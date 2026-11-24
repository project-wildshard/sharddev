// FAST-RELEASE FR1-FR3 (meta docs/plans/FAST-RELEASE-PLAN.md): when a release may reuse main's green run, when a push
// is release-only, and guards that keep the duplicate release CI from creeping back (J505).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { ciVerdict, mainGreen, releaseOnlyPush, stampOnly } from '../../scripts/release-reuse.mjs';

mkdirSync('tmp', { recursive: true });
const scratch = mkdtempSync(join(resolve('tmp'), 'release-reuse-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
/** @param {string} cwd @param {string[]} args */
const git = (cwd, args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** @param {string} dir @param {Record<string, string>} files */
function write(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}
const manifest = (name, version, extra = {}) => `${JSON.stringify({ name, version, ...extra }, null, 2)}\n`;
let count = 0;
/** A repo on main with a pushed origin, at version 0.1.0. */
function repo() {
  const dir = join(scratch, `r${++count}`);
  const origin = `${dir}-origin.git`;
  mkdirSync(dir);
  git(scratch, ['init', '--quiet', '--bare', '-b', 'main', origin]);
  git(dir, ['init', '--quiet', '-b', 'main']);
  write(dir, {
    'package.json': manifest('ws', '0.1.0', { scripts: { check: 'true' } }),
    'packages/sdk/package.json': manifest('@wildshard/sdk', '0.1.0'),
    'CHANGELOG.md': '# Changelog\n\n## v0.1.0 (2026-11-01)\n\n- First.\n',
    'src/a.ts': 'export const a = 1\n',
  });
  git(dir, ['add', '.']);
  git(dir, ['commit', '--quiet', '-m', 'init']);
  git(dir, ['remote', 'add', 'origin', origin]);
  git(dir, ['push', '--quiet', 'origin', 'main']);
  return dir;
}
/** The release commit prepare writes: versions and new notes, on a release branch. */
function release(dir, version = '0.2.0', more = {}) {
  git(dir, ['checkout', '--quiet', '-b', `release/v${version}`]);
  const notes = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').replace('## v', `## v${version} (2026-11-24)\n\n- Faster.\n\n## v`);
  write(dir, {
    'package.json': manifest('ws', version, { scripts: { check: 'true' } }),
    'packages/sdk/package.json': manifest('@wildshard/sdk', version),
    'CHANGELOG.md': notes,
    ...more,
  });
  git(dir, ['add', '.']);
  git(dir, ['commit', '--quiet', '-m', `chore(release): v${version}`]);
  return git(dir, ['rev-parse', 'HEAD']);
}
const head = (dir, ref = 'HEAD') => git(dir, ['rev-parse', ref]);
const line = (local, sha, remoteRef, remote = '0'.repeat(40)) => `${local} ${sha} ${remoteRef} ${remote}`;

test('a stamp-only release commit is reusable; code, new files, lost notes and extra manifest fields are not', () => {
  const dir = repo();
  const base = head(dir);
  const sha = release(dir);
  assert.equal(stampOnly(dir, base, sha).ok, true);

  const code = repo();
  const codeBase = head(code);
  assert.match(stampOnly(code, codeBase, release(code, '0.2.0', { 'src/a.ts': 'export const a = 2\n' })).reason, /src\/a\.ts is not a release-written file/u);

  const added = repo();
  assert.match(stampOnly(added, head(added), release(added, '0.2.0', { 'packages/sdk/new.ts': 'x\n' })).reason, /not a release-written file/u);

  const field = repo();
  const fieldBase = head(field);
  assert.match(stampOnly(field, fieldBase, release(field, '0.2.0', { 'packages/sdk/package.json': manifest('@wildshard/sdk', '0.2.0', { main: 'x.js' }) })).reason, /changes more than its version/u);

  const notes = repo();
  const notesBase = head(notes);
  assert.match(stampOnly(notes, notesBase, release(notes, '0.2.0', { 'CHANGELOG.md': '# Changelog\n' })).reason, /lost .* line/u);
});

test('the ci verdict needs one parent and main green at it; anything else runs the full suite', async () => {
  const dir = repo();
  const base = head(dir);
  release(dir);
  /** @param {string} sha @param {number} [status] */
  const api = (sha, status = 200) => async () => /** @type {Response} */ ({ ok: status === 200, status, json: async () => ({ workflow_runs: [{ id: 7, head_sha: sha, head_branch: 'main', event: 'push', conclusion: 'success' }] }) });
  assert.equal((await ciVerdict(dir, { repository: 'o/r', token: 't', get: api(base) })).ok, true);
  assert.match((await ciVerdict(dir, { repository: 'o/r', token: 't', get: api('f'.repeat(40)) })).reason, /never passed/u);
  assert.match((await ciVerdict(dir, { repository: 'o/r', token: 't', get: api(base, 403) })).reason, /answered 403/u);
  assert.equal((await mainGreen('o/r', base, 't', api(base))).ok, true);

  // A --pick hotfix puts a second commit on the branch: its parent was never green on main.
  write(dir, { 'src/a.ts': 'export const a = 3\n' });
  git(dir, ['commit', '--quiet', '-am', 'fix: hotfix']);
  release(dir, '0.2.1');
  assert.equal((await ciVerdict(dir, { repository: 'o/r', token: 't', get: api(base) })).ok, false);
});

test('a release branch, its tag, its merge-back and its delete are release-only pushes; code pushes keep the gate', () => {
  const dir = repo();
  const sha = release(dir);
  const branch = 'refs/heads/release/v0.2.0';
  assert.equal(releaseOnlyPush(dir, line(branch, sha, branch)).ok, true);
  git(dir, ['push', '--quiet', 'origin', 'release/v0.2.0']);

  git(dir, ['tag', '-a', 'v0.2.0', '-m', 'v0.2.0', sha]);
  const tag = head(dir, 'refs/tags/v0.2.0');
  assert.match(releaseOnlyPush(dir, line('refs/tags/v0.2.0', tag, 'refs/tags/v0.2.0')).reason, /already on origin/u);

  // A tag on a commit origin lacks is gated.
  write(dir, { 'src/a.ts': 'export const a = 9\n' });
  git(dir, ['commit', '--quiet', '-am', 'feat: local only']);
  git(dir, ['tag', '-a', 'v0.2.9', '-m', 'v0.2.9']);
  assert.equal(releaseOnlyPush(dir, line('refs/tags/v0.2.9', head(dir, 'refs/tags/v0.2.9'), 'refs/tags/v0.2.9')).ok, false);

  // Merge-back: main moved on with code; the merge itself only brings the stamp.
  git(dir, ['checkout', '--quiet', 'main']);
  write(dir, { 'src/b.ts': 'export const b = 1\n' });
  git(dir, ['add', 'src/b.ts']);
  git(dir, ['commit', '--quiet', '-m', 'feat: b']);
  git(dir, ['push', '--quiet', 'origin', 'main']);
  const tip = head(dir);
  git(dir, ['merge', '--quiet', '--no-ff', '-m', 'chore(release): merge v0.2.0', 'origin/release/v0.2.0']);
  assert.match(releaseOnlyPush(dir, line('refs/heads/main', head(dir), 'refs/heads/main', tip)).reason, /release merge/u);

  // A code commit on main keeps the gate, and so does a delete of anything but a release branch.
  write(dir, { 'src/c.ts': 'export const c = 1\n' });
  git(dir, ['add', 'src/c.ts']);
  git(dir, ['commit', '--quiet', '-m', 'feat: c']);
  assert.equal(releaseOnlyPush(dir, line('refs/heads/main', head(dir), 'refs/heads/main', tip)).ok, false);
  assert.equal(releaseOnlyPush(dir, line('(delete)', '0'.repeat(40), branch, sha)).ok, true);
  assert.equal(releaseOnlyPush(dir, line('(delete)', '0'.repeat(40), 'refs/heads/main', sha)).ok, false);

  // A release branch whose cut is not on origin/main is gated.
  git(dir, ['checkout', '--quiet', '-b', 'local-cut']);
  const unpushed = release(dir, '0.3.0');
  assert.match(releaseOnlyPush(dir, line('refs/heads/release/v0.3.0', unpushed, 'refs/heads/release/v0.3.0')).reason, /cut is not on origin\/main/u);
});

/** The top-level jobs of a workflow, each as its own text block. @param {string} text */
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n'));
  return Object.fromEntries([...body.matchAll(/^ {2}([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^ {2}[a-z][a-z0-9-]*:\n|(?![\s\S]))/gmu)].map((m) => [m[1], m[2]]));
}

test('ci.yml: check and products wait on the release gate, packed-install never does (J505)', () => {
  const blocks = jobs(readFileSync('.github/workflows/ci.yml', 'utf8'));
  assert.match(blocks['release-gate'] ?? '', /startsWith\(github\.ref, 'refs\/heads\/release\/'\)/u);
  assert.match(blocks['release-gate'] ?? '', /node scripts\/release-reuse\.mjs ci/u);
  for (const name of ['check', 'products']) {
    assert.match(blocks[name] ?? '', /needs: release-gate\n/u, `${name} needs the gate`);
    assert.match(blocks[name] ?? '', /if: \$\{\{ !cancelled\(\) && needs\.release-gate\.outputs\.reuse != 'true' \}\}/u, `${name} skips on reuse`);
  }
  assert.ok(blocks['packed-install'] !== undefined);
  assert.doesNotMatch(blocks['packed-install'] ?? '', /release-gate/u, 'the exact-SHA release proof always runs');
  // Every job is accounted for: a new heavy job must say whether a release reuses it.
  assert.deepEqual(Object.keys(blocks).sort(), ['check', 'packed-install', 'products', 'release-gate']);
});

test('e2e retries once on CI only, and the push lane asks release-reuse first', () => {
  const config = readFileSync('packages/dev/src/e2e/playwright.config.ts', 'utf8');
  assert.match(config, /retries: process\.env\['CI'\] === undefined \? 0 : 1,/u);
  const hook = readFileSync('.githooks/run-checks.mjs', 'utf8');
  assert.match(hook, /releaseOnlyPush\(root, process\.env\.WS_PUSH_REFS/u);
  assert.ok(hook.indexOf('releaseOnlyPush(') < hook.indexOf("jobs.push({ name: 'check'"), 'the skip comes before the push lane');
});
