// Meta REPO-DISK DK9 (DEV-SPEED Q41): `node src/scripts/.kit/worktree.mjs new` refuses at MAX_WORKTREES live worktrees or
// under MIN_FREE_GIB free, and names the oldest parked worktree. Real git: a bare remote, a clone and planted
// worktrees; the free space is faked through WS_WORKTREE_FREE_GIB. No network, no pnpm, no herdr.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { MAX_WORKTREES, MIN_FREE_GIB } from '../../scripts/.kit/worktree.mjs';

const KIT = resolve(import.meta.dirname, '../../..');
const WORKTREE = join(KIT, 'src/scripts/.kit/worktree.mjs');
const SCRATCH = join(KIT, 'tmp/worktree-cap-test');
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, 'cap-'));
  roots.push(root);
  const remote = join(root, 'remote.git'), repo = join(root, 'repo');
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Cap', GIT_AUTHOR_EMAIL: 'cap@example.test', GIT_COMMITTER_NAME: 'Cap', GIT_COMMITTER_EMAIL: 'cap@example.test', WS_LANE_RECEIPTS: join(root, 'receipts.log'), WS_TIMINGS_FETCH: '0', WS_SESSION_KEEP_ROOT: join(root, 'keep') };
  for (const key of Object.keys(env)) if ((key.startsWith('GIT_') && !/^GIT_(CONFIG_GLOBAL|CONFIG_NOSYSTEM|AUTHOR_|COMMITTER_)/u.test(key)) || key.startsWith('NODE_TEST') || key === 'WS_LANE_NAME' || key === 'HERDR_ENV' || key === 'WS_WORKTREE_FREE_GIB') Reflect.deleteProperty(env, key);
  const git = (cwd, args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(root, ['init', '--quiet', '--bare', '--initial-branch=main', remote]);
  git(root, ['clone', '--quiet', remote, repo]);
  // .owner marks a worktree; the real repos ignore it.
  writeFileSync(join(repo, '.git/info/exclude'), '/.owner\n');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  writeFileSync(join(repo, '.gitignore'), '/.worktrees/\n');
  git(repo, ['add', 'a.txt', '.gitignore']);
  // An old seed commit, so each worktree's last activity is the time planted below, not the commit's.
  const old = new Date(Date.now() - 200 * 3_600_000).toISOString();
  execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd: repo, env: { ...env, GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old }, stdio: 'ignore' });
  git(repo, ['push', '--quiet', 'origin', 'main']);
  /** Plant a worktree on plan/<slug> at origin/main, its Git activity `hoursAgo` in the past. */
  const plant = (slug, hoursAgo, { unlanded = false, dirty = false, owner = false, rebased = false } = {}) => {
    const path = join(repo, '.worktrees', slug);
    // the plan commits carry the planted time too: a worktree's activity reads its HEAD commit's date
    const stamp = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
    const commitAt = (cwd, message) => execFileSync('git', ['commit', '--quiet', '-m', message], { cwd, env: { ...env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp }, stdio: 'ignore' });
    git(repo, ['worktree', 'add', '--quiet', '-b', `plan/${slug}`, path, 'origin/main']);
    // A rebased land: the branch's commit, and the same patch on main under another sha (another commit landed first).
    if (rebased) {
      writeFileSync(join(path, `${slug}.txt`), 'work\n'); git(path, ['add', `${slug}.txt`]); commitAt(path, `${slug} work`);
      const tip = git(path, ['rev-parse', 'HEAD']);
      writeFileSync(join(repo, `first-${slug}.txt`), 'x\n'); git(repo, ['add', `first-${slug}.txt`]); git(repo, ['commit', '--quiet', '-m', 'first']);
      git(repo, ['cherry-pick', tip]); git(repo, ['push', '--quiet', 'origin', 'main']); git(repo, ['fetch', '--quiet', 'origin']);
    }
    if (unlanded) { writeFileSync(join(path, `${slug}.txt`), 'work\n'); git(path, ['add', `${slug}.txt`]); commitAt(path, `${slug} work`); }
    if (dirty) writeFileSync(join(path, 'a.txt'), 'edited\n');
    if (owner) writeFileSync(join(path, '.owner'), JSON.stringify({ lane: 'gone', pid: process.pid }));
    const gitDir = git(path, ['rev-parse', '--absolute-git-dir']);
    const when = new Date(Date.now() - hoursAgo * 3_600_000);
    for (const file of ['index', 'HEAD', 'logs/HEAD']) if (existsSync(join(gitDir, file))) utimesSync(join(gitDir, file), when, when);
    return path;
  };
  const run = (slug, extra = {}) => spawnSync(process.execPath, [WORKTREE, 'new', slug, '--no-install', '--no-pins', '--no-herdr', '--no-clone'], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
  return { repo, git, plant, run };
}

test(`a full cap refuses the ${String(MAX_WORKTREES + 1)}th and lists each ended worktree with copy-first commands, removing nothing (J358)`, { timeout: 120_000 }, () => {
  const f = fixture();
  // Older than the parked ones, but not ended: an unlanded commit, and an edit.
  f.plant('busy-unlanded', 90, { unlanded: true });
  f.plant('busy-dirty', 80, { dirty: true });
  f.plant('parked-old', 50, { owner: true });
  f.plant('parked-mid', 30);
  f.plant('parked-new', 2);
  f.plant('parked-newest', 0);
  const result = f.run('seventh', { WS_WORKTREE_FREE_GIB: '500' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /oldest parked worktree is \.worktrees\/parked-old \(landed, clean, idle 5\d\.\d h\)/u);
  assert.match(result.stderr, /ended worktrees \(J358: nothing removes them for you; copy first, then remove/u);
  const listed = [...result.stderr.matchAll(/node src\/scripts\/\.kit\/keep-copy\.mjs \.worktrees\/(?<slug>\S+) && git worktree remove \.worktrees\/\k<slug> && git branch -d plan\/\k<slug>/gu)].map((match) => match.groups?.['slug']);
  assert.deepEqual(listed, ['parked-old', 'parked-mid', 'parked-new']);
  // meta QA 11-26 row 23: a clean unlanded worktree idle over 12 h is listed too, its branch kept
  assert.match(result.stderr, /\n  node src\/scripts\/\.kit\/keep-copy\.mjs \.worktrees\/busy-unlanded && git worktree remove \.worktrees\/busy-unlanded   # busy-unlanded: not landed, clean, idle 9\d\.\d h, nothing running; branch plan\/busy-unlanded kept/u);
  assert.doesNotMatch(result.stderr, /worktree remove \.worktrees\/busy-dirty/u);
  for (const kept of ['busy-unlanded', 'busy-dirty', 'parked-old', 'parked-mid', 'parked-new', 'parked-newest']) assert.equal(existsSync(join(f.repo, '.worktrees', kept)), true, kept);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/plan/parked-old'], { cwd: f.repo }).status, 0);
  assert.equal(existsSync(join(f.repo, '.worktrees/seventh')), false);
});

test(`the ${String(MAX_WORKTREES + 1)}th worktree is refused while every parked one is fresh, naming the oldest`, { timeout: 120_000 }, () => {
  const f = fixture();
  // unlanded and idle under PARKED_IDLE_MS (12 h): not ended
  f.plant('busy-unlanded', 10, { unlanded: true });
  f.plant('busy-dirty', 80, { dirty: true });
  for (const slug of ['parked-a', 'parked-b', 'parked-c', 'parked-d']) f.plant(slug, 0);
  const result = f.run('seventh', { WS_WORKTREE_FREE_GIB: '500' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /worktree STOP repo already has 6 live worktrees under \.worktrees\/ \(cap 6\)/u);
  assert.match(result.stderr, /oldest parked worktree is \.worktrees\/parked-[a-d] \(landed, clean, idle 0\.\d h\)$/mu);
  assert.doesNotMatch(result.stderr, /ended worktrees/u);
  assert.equal(existsSync(join(f.repo, '.worktrees/seventh')), false);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/plan/seventh'], { cwd: f.repo }).status, 1);
});

test(`under ${String(MIN_FREE_GIB)} GiB free is refused with fewer worktrees, and at the floor it goes ahead`, { timeout: 120_000 }, () => {
  const f = fixture();
  f.plant('parked-a', 10);
  f.plant('parked-b', 3);
  const low = f.run('next', { WS_WORKTREE_FREE_GIB: String(MIN_FREE_GIB - 0.5) });
  assert.equal(low.status, 1, low.stdout + low.stderr);
  assert.match(low.stderr, /only 59\.5 GiB free on the volume of .*repo \(floor 60 GiB\)/u);
  assert.match(low.stderr, /oldest parked worktree is \.worktrees\/parked-a /u);
  assert.doesNotMatch(low.stderr, /live worktrees/u);
  assert.equal(existsSync(join(f.repo, '.worktrees/next')), false);
  const ok = f.run('next', { WS_WORKTREE_FREE_GIB: String(MIN_FREE_GIB) });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(existsSync(join(f.repo, '.worktrees/next/a.txt')), true);
});

test('with no parked worktree the refusal says so; a removed folder does not count as live', { timeout: 120_000 }, () => {
  const f = fixture();
  for (let index = 0; index < MAX_WORKTREES; index++) f.plant(`work-${String(index)}`, index, { unlanded: true });
  const full = f.run('more', { WS_WORKTREE_FREE_GIB: '500' });
  assert.equal(full.status, 1, full.stdout + full.stderr);
  assert.match(full.stderr, /none of them is parked \(landed on origin\/main and clean\)/u);
  rmSync(join(f.repo, '.worktrees/work-0'), { recursive: true, force: true });
  const room = f.run('more', { WS_WORKTREE_FREE_GIB: '500' });
  assert.equal(room.status, 0, room.stdout + room.stderr);
});

test('meta QA 11-26 row 23: a rebased land counts as landed, and a fresh unlanded worktree is not listed', { timeout: 120_000 }, () => {
  const f = fixture();
  f.plant('rebased', 1, { rebased: true });
  f.plant('fresh-unlanded', 5, { unlanded: true });
  for (const slug of ['a', 'b', 'c', 'd']) f.plant(slug, 0);
  const result = f.run('seventh', { WS_WORKTREE_FREE_GIB: '500' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /oldest parked worktree is \.worktrees\/rebased \(landed, clean, idle 1\.\d h\)/u);
  assert.match(result.stderr, /git worktree remove \.worktrees\/rebased   # rebased: landed by patch \(a rebased land\), clean, idle 1\.\d h, nothing running; branch plan\/rebased kept/u);
  assert.doesNotMatch(result.stderr, /fresh-unlanded:/u);
  for (const kept of ['rebased', 'fresh-unlanded']) assert.equal(existsSync(join(f.repo, '.worktrees', kept)), true, kept);
});

test('a non-number fake is refused, not read as zero', { timeout: 60_000 }, () => {
  const f = fixture();
  const bad = f.run('x', { WS_WORKTREE_FREE_GIB: 'lots' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /WS_WORKTREE_FREE_GIB=lots is not a number of GiB/u);
});
