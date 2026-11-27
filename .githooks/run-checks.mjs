// The code-quality lanes, keyed off package.json scripts so they switch
// on by themselves once the scaffold defines them.
//   commit: like the scaffold's own pre-commit: `lint` and `format:check`
//           on the staged code files only, plus the whole `typecheck`,
//           in parallel under a budget (silent < 5 s, warn 5-8 s, BLOCK
//           > 8 s on an idle machine, warn on a loaded one; SKIP_BUDGET=1). Skipped when no code or JSON is staged.
//   push:   the full `check` script (adds knip and the unit tests), run in
//           a clean copy of the pushed commit (.githooks/push-gate-copy.mjs,
//           meta M1), so other lanes' dirty and untracked files in a shared
//           checkout neither refuse the push nor leak into it.
//   both:   .githooks/pinned-links.mjs first (commit warns, push refuses;
//           SKIP_CHECK does not skip it).
// The hooks only check; `pnpm fix` (or `pnpm lint:fix` / `pnpm format`) fixes.
// Bypass a lane: SKIP_CHECK=1 (last resort; CI still runs it).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gateTestEnvironment } from './gate-workers.mjs';
import { availableParallelism } from 'node:os';
import { budgetVerdict, machineLoad } from './commit-budget.mjs';
import { copyReason, makeGateCopy, pushedCommit } from './push-gate-copy.mjs';
import { git } from './lib.mjs';
import { stagedCheckCommit, stagedCheckTree } from './staged-check-tree.mjs';
import { guardPinnedLinks } from './pinned-links.mjs';
import { failureReport } from './gate-report.mjs';

const lane = process.argv[2];
const root = git(['rev-parse', '--show-toplevel']).trim();
const SOFT = Number(process.env.PRECOMMIT_SOFT_S ?? 5);
const HARD = Number(process.env.PRECOMMIT_HARD_S ?? 8);
const LINTABLE = /\.(?:ts|tsx|js|mjs|cjs)$/;
const FORMATTABLE = /\.(?:ts|tsx|js|mjs|cjs|json|jsonc)$/;

// A push that only deletes plan/* branches (`git push --delete origin plan/<slug>`
// after a landing, J240) or a shipped release/vX.Y.Z branch (release.sh
// --merge-back, after main has the merge) sends no commit, so there is nothing
// to check. Any other deleted ref, or any update pushed alongside, keeps the gate.
if (lane === 'push') {
  const lines = (process.env.WS_PUSH_REFS ?? '').split('\n').map((line) => line.trim().split(/\s+/u)).filter((row) => row[0] !== '');
  if (lines.length > 0 && lines.every(([, local = '', remote = '']) => /^0+$/u.test(local) && /^refs\/heads\/(?:plan\/[a-z0-9][a-z0-9._-]*|release\/v\d+\.\d+\.\d+)$/u.test(remote))) {
    console.error(`  - delete-only push of ${lines.map(([, , remote]) => remote).join(', ')}: no commit leaves this machine; push lane skipped`);
    process.exit(0);
  }
  // Meta QA 11-25 row 113 (J381): re-creating deleted branches at a sha the destination's main holds or the
  // deleted-branches log recorded sends no new code (.githooks/branch-restore.mjs); ALLOW_BRANCH_RESTORE=1 is its
  // hatch. Never a main push.
  const { restoreVerdict } = await import('./branch-restore.mjs');
  const restore = restoreVerdict(root, process.env.WS_PUSH_REFS ?? '');
  if (restore.ok) {
    console.error(`  - ${restore.reason}; push lane skipped`);
    process.exit(0);
  }
}
// Pinned links: a node_modules/@wildshard/* alias on a live checkout tests
// another lane's edits, not the pin CI uses. Commit warns, push refuses.
// It runs before SKIP_CHECK: a lane that links on purpose writes a receipt.
if (!guardPinnedLinks(root, lane)) process.exit(1);
// FAST-RELEASE FR2 (meta docs/plans/FAST-RELEASE-PLAN.md): a release-only push (a tag on a commit origin has, a
// stamp-only release branch over origin/main, a stamp-only merge-back, a release branch delete) sends no new code, so
// the push lane has nothing to gate; SDK 0.4.32 spent about 6 min on each. src/scripts/release-reuse.mjs decides; its
// release ci still runs packed-install on the exact SHA, and main's ci runs the merge.
if (lane === 'push' && existsSync(join(root, 'src/scripts/release-reuse.mjs'))) {
  const { releaseOnlyPush } = await import(pathToFileURL(join(root, 'src/scripts/release-reuse.mjs')).href);
  /** @type {{ ok: boolean, reason: string }} */ let verdict = { ok: false, reason: '' };
  try {
    verdict = releaseOnlyPush(root, process.env.WS_PUSH_REFS ?? '');
  } catch {} // Anything it cannot read keeps the gate.
  if (verdict.ok) {
    console.error(`  - ${verdict.reason}: push lane skipped`);
    process.exit(0);
  }
}
if (process.env.SKIP_CHECK === '1') {
  console.error(`  - SKIP_CHECK=1: ${lane} lane skipped (CI still runs it)`);
  process.exit(0);
}
// The push lane gates the pushed commit in a clean copy of it (M1).
/** @type {{ path: string, remove: () => void } | null} */
let copy = null;
if (lane === 'push') {
  const sha = pushedCommit(root, process.env.WS_PUSH_REFS);
  const reason = copyReason(root, sha);
  if (sha !== null && reason !== null) {
    console.error(`  - push lane gates ${sha.slice(0, 10)} in a clean copy: ${reason}`);
    try {
      copy = makeGateCopy(root, sha);
    } catch (error) {
      console.error(`\n  X push blocked: the clean copy failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  }
}
// The package is at the repo root; its kit configs live in kit/ (J329).
const stagedTree = lane === 'commit' ? stagedCheckTree(root) : null;
let pkgDir = copy?.path ?? root;
const pkgPath = join(pkgDir, 'package.json');
const manifest = stagedTree?.manifest ?? (existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {});
const scripts = manifest.scripts ?? {};

/** @type {{ name: string, args: string[] }[]} */
const jobs = [];
if (stagedTree !== null) {
  // Staged code under src/ and kit/ (J329) and each packages/<name>/src (SDK-SPLIT SP2b),
  // passed relative to the repo root; src/scripts/lint-dispatch.mjs routes them. Code outside them (.githooks, docs) has its own checks.
  const staged = stagedTree.files.filter((path) => /^(?:src|kit|packages\/[^/]+\/src)\//u.test(path));
  const lint = staged.filter((path) => LINTABLE.test(path));
  const format = staged.filter((path) => FORMATTABLE.test(path));
  if (scripts.lint && lint.length) jobs.push({ name: 'lint', args: ['lint', ...lint] });
  if (scripts['format:check'] && format.length) {
    jobs.push({ name: 'format:check', args: ['format:check', '--no-error-on-unmatched-pattern', ...format] });
  }
  if (scripts.typecheck && format.length) jobs.push({ name: 'typecheck', args: ['typecheck'] });
  if (!jobs.length) {
    if (Object.keys(scripts).length) console.error('  - no code staged: commit lane skipped');
    process.exit(0);
  }
} else if (scripts.check) {
  jobs.push({ name: 'check', args: ['check'] });
}
if (!jobs.length) {
  copy?.remove();
  process.exit(0); // no toolchain yet
}

// A gate copy installs its own (push-gate-copy.mjs) when the pushed tree has a lockfile.
if (copy === null && !existsSync(join(pkgDir, 'node_modules'))) {
  console.error(`\n  X ${lane} blocked: node_modules is missing. Run pnpm install, then pnpm exec npr install --frozen when binDependencies are declared.\n`);
  process.exit(1);
}

if (stagedTree !== null) {
  copy = makeGateCopy(root, stagedCheckCommit(root, stagedTree), {say: () => {}});
  pkgDir = copy.path;
}

// Hooks export GIT_INDEX_FILE and friends; tools that shell out to git
// (knip, tests that build repos) must see a normal environment.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const env = lane === 'push' ? gateTestEnvironment(cleanEnv, 2) : cleanEnv;
// Meta QA 11-25 row 149: the watch parity's frames outlive the clean copy, so a gate red can be looked at, not skipped.
if (copy !== null) env.WS_PARITY_FRAMES ??= join(root, 'tmp', 'push-gate', 'watch-parity');
// Install a missing shared tool cache from its committed lock before checks.
// Frozen mode refuses stale pins instead of silently rewriting the checkout.
if (manifest.binDependencies !== undefined) {
  const tools = spawnSync('pnpm', ['exec', 'npr', 'install', '--frozen'], { cwd: pkgDir, env, stdio: 'inherit' });
  if (tools.error !== undefined || tools.status !== 0) {
    console.error('  X frozen binary tool install failed; repair and commit .bin-deps/');
    copy?.remove();
    process.exit(tools.status || 1);
  }
}
// meta CHUNK-PARAM-REMOVAL CP23 (J522): no new `chunk` address param beyond the repo's shrink-only baseline
// (.githooks/chunk-param-guard.mjs, the kit's; this run-checks is sharddev's own, so the stamp can't add it). Bypass:
// SKIP_CHUNK_GUARD=1.
const chunkGuard = join(root, '.githooks/chunk-param-guard.mjs');
if (lane === 'push' && existsSync(chunkGuard) && process.env.SKIP_CHUNK_GUARD !== '1') {
  const { chunkGuardVerdict, refusal } = await import(pathToFileURL(chunkGuard).href);
  const { added, enforced } = chunkGuardVerdict(pkgDir);
  if (added.length && !enforced) console.error(`  - chunk-param-guard, report only until the repo records its baseline: ${added.join(', ')}`);
  if (added.length && enforced) {
    console.error(`\n  X push blocked: ${refusal(added)}\n    SKIP_CHUNK_GUARD=1 is a last resort (J381).\n`);
    copy?.remove();
    process.exit(1);
  }
}
// Meta QA 11-25 rows 82 and 84 (J505): no new script pointing where nothing is (a relative import, an undeclared
// package, a ROOT off the package root, a missing read path) beyond the repo's shrink-only baseline, empty here
// (.githooks/script-paths.mjs, the kit's; this run-checks is sharddev's own, so the stamp can't add it).
// Bypass: SKIP_SCRIPT_PATHS=1.
const scriptPaths = join(root, '.githooks/script-paths.mjs');
if (lane === 'push' && existsSync(scriptPaths) && process.env.SKIP_SCRIPT_PATHS !== '1') {
  const { scriptPathsVerdict, refusal: pathRefusal } = await import(pathToFileURL(scriptPaths).href);
  const { added, enforced } = scriptPathsVerdict(pkgDir);
  if (added.length && !enforced) console.error(`  - script-paths, report only until the repo records its baseline: ${added.length} finding(s) (node .githooks/script-paths.mjs)`);
  if (added.length && enforced) {
    console.error(`\n  X push blocked: ${pathRefusal(added)}\n    SKIP_SCRIPT_PATHS=1 is a last resort (J381).\n`);
    copy?.remove();
    process.exit(1);
  }
}
const run = ({ name, args }) => new Promise((done) => {
  const child = spawn('pnpm', ['run', '--silent', ...args], { cwd: pkgDir, env });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  child.on('close', (code) => done({ name, code, output }));
});

console.error(`  - ${lane} lane: pnpm ${jobs.map((job) => job.name).join(', ')}`);
const started = Date.now();
const results = await Promise.all(jobs.map(run));
const seconds = (Date.now() - started) / 1000;
copy?.remove();

const failed = results.filter((result) => result.code !== 0);
// Meta QA 11-25 row 75 (repo-kit's stamped gate, hand-wired into this fork): a long output goes whole to
// tmp/push-gate/, and the report ends with the failing step.
const logOf = (name) => join(root, 'tmp', 'push-gate', `${lane}-${name.replaceAll(/[^\w.-]/gu, '-')}.log`);
for (const { name, output } of failed) console.error(`\n${failureReport({ name, output, logPath: logOf(name) })}`);
if (failed.length) {
  const fix = lane === 'commit' ? ` (${scripts.fix ? 'pnpm fix fixes' : 'pnpm lint:fix / pnpm format fix'} most of it)` : '';
  console.error(`\n  ${lane} blocked. Fix it${fix}; SKIP_CHECK=1 is a last resort.\n`);
  process.exit(1);
}

if (lane === 'commit') {
  const verdict = budgetVerdict(seconds, { soft: SOFT, hard: HARD, skip: process.env.SKIP_BUDGET === '1' });
  if (verdict === 'block') {
    console.error(`\n  X commit blocked: the commit lane took ${seconds.toFixed(1)} s, over the ${HARD} s budget on an idle machine.`);
    console.error('    Something slow crept in; move it to the push lane. SKIP_BUDGET=1 is a last resort.\n');
    process.exit(1);
  }
  if (verdict === 'loaded') console.error(`  !! commit lane took ${seconds.toFixed(1)} s, over the ${HARD} s budget, on a loaded machine (load ${machineLoad().toFixed(1)} on ${availableParallelism()} cores): not blocked`);
  else if (verdict === 'warn') console.error(`  !! commit lane took ${seconds.toFixed(1)} s (soft ${SOFT} s, hard ${HARD} s)`);
}
console.error(`  - ${lane} lane green in ${seconds.toFixed(1)} s`);
