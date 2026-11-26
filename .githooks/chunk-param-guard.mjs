// Chunk-param guard (meta CHUNK-PARAM-REMOVAL CP23, J522: `?chunk=` is deleted; no zone in any address). The kit's copy
// of engine's own guard (engine runs that one in lint:game and takes no copy of this): the push lane (run-checks.mjs)
// refuses a URL-shaped `chunk` coming back in a repo's tracked text:
//   (a) a query pair: `chunk=` right after `?`, `&`, a quote, a backtick or a parenthesis;
//   (b) a params call: `.get`, `.set`, `.has`, `.delete` or `.append` of the string `'chunk'`.
// The music sting (`music.sting('chunk')`), Rollup's `type === 'chunk'` and `--chunk=` flags match neither.
// History stays unread: project/, leftover/, budgets/calibration-reports/ and CHANGELOG.md.
// The repo's own baseline, `.githooks/chunk-param-guard.baseline.json` (never stamped), holds the files that still carry
// one while the plan's rows move them, with counts. It may only shrink: a new file, or more than its count, is refused;
// fewer asks for `--prune`. Until M3 moves the shared skill and the tools (CP18 to CP20), a repo with no baseline is
// report-only: its hits print and the push passes (`MISSING_BASELINE`). Recording one (`--write`) enforces it; after M3,
// no baseline turns into an empty one, enforced everywhere.
//   node .githooks/chunk-param-guard.mjs [--write | --prune]   (exit 1 when refused)
// Bypass in the push lane: SKIP_CHUNK_GUARD=1 (J381).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASELINE = '.githooks/chunk-param-guard.baseline.json';
const SELF = new Set(['.githooks/chunk-param-guard.mjs', BASELINE, 'test/tooling/chunk-param-guard.test.mjs']);
const SKIP = ['project/', 'leftover/', 'budgets/calibration-reports/', 'node_modules/'];
/** 'report' until CHUNK-PARAM-REMOVAL M3 closes, then 'enforce': what a repo with no baseline gets. */
export const MISSING_BASELINE = 'report';
const TEXT = /\.(?:[cm]?[jt]sx?|mts|json|html|md|sh|py|ya?ml|txt|css)$/u;
const PAIR = /[?&'"`(]chunk=/gu;
const CALL = /\.(?:get|set|has|delete|append)\(\s*['"`]chunk['"`]/gu;

/** How many URL-shaped `chunk` reads and writes a text carries. @param {string} text */
export function chunkParamCount(text) {
  return (text.match(PAIR)?.length ?? 0) + (text.match(CALL)?.length ?? 0);
}

/** Every file in scope that carries one, with its count. @param {{ paths: string[], read: (path: string) => string }} input */
export function chunkParamOffenders({ paths, read }) {
  /** @type {Record<string, number>} */
  const found = {};
  for (const path of [...paths].sort()) {
    if (SELF.has(path) || path === 'CHANGELOG.md' || SKIP.some((prefix) => path.startsWith(prefix)) || !TEXT.test(path)) continue;
    let text;
    try {
      text = read(path);
    } catch {
      continue;
    }
    const count = chunkParamCount(text);
    if (count > 0) found[path] = count;
  }
  return found;
}

/** Compare with the shrink-only baseline. @param {Record<string, number>} found @param {Record<string, number>} baseline */
export function judge(found, baseline) {
  const added = Object.keys(found)
    .filter((path) => found[path] > (baseline[path] ?? 0))
    .map((path) => `${path} (${found[path]}, baseline ${baseline[path] ?? 0})`);
  const shrunk = Object.keys(baseline).filter((path) => (found[path] ?? 0) < baseline[path]);
  return { added, shrunk };
}

/** The repo at `root`, judged: its tracked files against its baseline. @param {string} root */
export function chunkGuardVerdict(root) {
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
  const found = chunkParamOffenders({ paths, read: (path) => readFileSync(join(root, path), 'utf8') });
  const file = join(root, BASELINE), recorded = existsSync(file);
  /** @type {Record<string, number>} */
  const baseline = recorded ? JSON.parse(readFileSync(file, 'utf8')).files ?? {} : {};
  return { found, baseline, enforced: recorded || MISSING_BASELINE === 'enforce', ...judge(found, baseline) };
}

/** The refusal's text. @param {string[]} added */
export function refusal(added) {
  return `chunk-param-guard (J522): \`?chunk=\` is deleted; a page enters a zone by its tap, its tab's handoff or a record, never its address (harness: enterZone). New reads or writes:\n${added.map((line) => `  ${line}`).join('\n')}`;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const { found, baseline, enforced, added, shrunk } = chunkGuardVerdict(root);
  const write = process.argv.includes('--write');
  if (write || process.argv.includes('--prune')) {
    /** @type {Record<string, number>} */
    const files = {};
    for (const path of Object.keys(found).sort()) {
      if (write || baseline[path] !== undefined) files[path] = Math.min(found[path], baseline[path] ?? found[path]);
    }
    mkdirSync(dirname(join(root, BASELINE)), { recursive: true });
    writeFileSync(join(root, BASELINE), `${JSON.stringify({ about: 'meta CHUNK-PARAM-REMOVAL CP23: files that still read or write ?chunk=, with counts; shrink only (node .githooks/chunk-param-guard.mjs --prune).', files }, null, 1)}\n`);
    console.log(`chunk-param-guard: baseline written, ${Object.keys(files).length} files`);
  } else if (shrunk.length > 0) {
    console.log(`chunk-param-guard: ${shrunk.length} file(s) carry fewer than the baseline; run node .githooks/chunk-param-guard.mjs --prune and commit it`);
  }
  if (added.length > 0 && !write && enforced) {
    console.error(refusal(added));
    process.exitCode = 1;
  } else if (added.length > 0 && !write) {
    console.log(`chunk-param-guard: report only (no ${BASELINE} yet): ${added.join(', ')}`);
  } else {
    const total = Object.values(found).reduce((sum, count) => sum + count, 0);
    console.log(`chunk-param-guard: ${total} in ${Object.keys(found).length} baselined file(s), none new`);
  }
}
