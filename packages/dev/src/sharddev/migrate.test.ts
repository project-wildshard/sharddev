// oxlint-disable-next-line import/no-nodejs-modules -- migrate runs as the real bin, on real git repos.
import { execFileSync, spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Real temp shard repos with a real installed sdk folder on disk.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the bin and the scratch repos.
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readStamp } from '../../../sdk/src/sharddev/migrations';
import { closeFixtures, fixtureRoot } from '../../../sdk/src/sharddev/test/ownedScratch';

// SDK 0.5.0 plan M3: `wildshard migrate [dir]` on real git repos, with a real installed sdk folder in the repo's own
// node_modules that ships fixture migrations, through the real bin. The first run syncs GUIDE.md and the skills, runs
// what is pending, prints the manual steps and stamps; a second run has nothing to migrate; a dirty tree is refused; a
// migration that throws leaves the stamp as it was; `migrate --dry-run <file>` is still the API's dry run (CP7).
const DEV_BIN = resolve(import.meta.dirname, '../../bin/wildshard.mjs');
const SDK = resolve(import.meta.dirname, '../../../sdk');
const root = fixtureRoot('migrate-');
afterAll(() => { rmSync(root, { recursive: true, force: true }); closeFixtures(); });

/** 0.5.0's migration: pending while public/assets/ is in the repo; it moves it and names one edit it cannot make. */
const MIGRATION_050 = `import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
export const title = 'shard assets move from public/ into src/static/';
export const guide = 'migrate-0-5-0';
export const pending = ({ project }) => existsSync(resolve(project, 'public/assets')) ? 'public/assets/ exists' : undefined;
export default ({ project, from, to }) => {
  mkdirSync(resolve(project, 'src/static'), { recursive: true });
  renameSync(resolve(project, 'public/assets'), resolve(project, 'src/static/assets'));
  return { lines: [\`public/assets/ -> src/static/assets/ (\${from} -> \${to})\`], manual: ['scripts/ci.mjs:3 still names public/: remove its alias check'] };
};
`;
/** 0.6.0's: pending while old.txt is there; it returns plain lines (a string[]). */
const MIGRATION_060 = `import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
export const title = 'old.txt goes';
export const guide = 'migrate-0-6-0';
export const pending = ({ project }) => existsSync(resolve(project, 'old.txt')) ? 'old.txt exists' : undefined;
export default ({ project }) => { rmSync(resolve(project, 'old.txt')); return ['removed old.txt']; };
`;
const THROWING_060 = MIGRATION_060.replace(/export default .*$/mu, 'export default () => { throw new Error(\'boom\'); };');

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'ignore' });
};
const commitAll = (repo: string, message: string): void => { git(repo, 'add', '--all'); git(repo, 'commit', '-qm', message); };

let repos = 0;
/** A committed git shard repo with sdk 0.6.0 installed in its node_modules, shipping `migrations`, in the old layout. */
function shardRepo(migrations: Readonly<Record<string, string>>, options: { readonly git?: boolean } = {}): string {
  repos += 1;
  const repo = join(root, `repo-${String(repos)}`), sdk = join(repo, 'node_modules/@wildshard/sdk');
  mkdirSync(join(sdk, 'codemods'), { recursive: true });
  writeFileSync(join(sdk, 'package.json'), '{ "name": "@wildshard/sdk", "version": "0.6.0" }\n');
  for (const file of ['GUIDE.md', 'skills']) cpSync(join(SDK, file), join(sdk, file), { recursive: true });
  for (const [version, text] of Object.entries(migrations)) writeFileSync(join(sdk, 'codemods', `${version}.mjs`), text);
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ name: 'isle', dependencies: { '@wildshard/sdk': '0.6.0' } }, null, 2)}\n`);
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  mkdirSync(join(repo, 'public/assets'), { recursive: true });
  writeFileSync(join(repo, 'public/assets/tree.glb'), 'tree');
  writeFileSync(join(repo, 'old.txt'), 'old');
  if (options.git !== false) { git(repo, 'init', '-q'); commitAll(repo, 'old layout'); }
  return repo;
}

const run = (args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = process.env): { status: number | null; stdout: string; stderr: string } => {
  const done = spawnSync(process.execPath, [DEV_BIN, ...args], { cwd, encoding: 'utf8', env });
  return { status: done.status, stdout: done.stdout, stderr: done.stderr };
};

describe('wildshard migrate [dir] (M3)', () => {
  it('syncs the agent files, runs each pending migration oldest first, prints the manual steps and stamps', () => {
    const repo = shardRepo({ '0.5.0': MIGRATION_050, '0.6.0': MIGRATION_060 });
    const done = run(['migrate', repo], root);
    expect(done.status, done.stderr).toBe(0);
    const lines = done.stdout.trimEnd().split('\n');
    expect(lines[0]).toBe('wildshard update: GUIDE.md and the skills from @wildshard/sdk 0.6.0');
    expect(lines).toContain('  added GUIDE.md');
    expect(lines.slice(lines.indexOf('wildshard migrate: 2 migrations ran'))).toEqual([
      'wildshard migrate: 2 migrations ran',
      '  0.5.0  shard assets move from public/ into src/static/',
      '    public/assets/ -> src/static/assets/ (0.0.0 -> 0.6.0)',
      '  0.6.0  old.txt goes',
      '    removed old.txt',
      'Manual steps (no script can make these edits safely; do each, then run check):',
      '  0.5.0  scripts/ci.mjs:3 still names public/: remove its alias check',
      'migrated to sdk 0.6.0; run: pnpm exec wildshard check .',
    ]);
    expect([existsSync(join(repo, 'src/static/assets/tree.glb')), existsSync(join(repo, 'old.txt'))]).toEqual([true, false]);
    expect(readFileSync(join(repo, 'GUIDE.md'), 'utf8')).toBe(readFileSync(join(SDK, 'GUIDE.md'), 'utf8'));
    expect(readStamp(repo)).toBe('0.6.0');

    // Again, before the author commits: nothing is pending and the stamp says 0.6.0, so nothing is refused or run.
    const again = run(['migrate'], repo);
    expect([again.status, again.stdout.trimEnd().split('\n').at(-1)]).toEqual([0, 'nothing to migrate; stamped 0.6.0']);
    expect(again.stdout).not.toMatch(/migrations? ran/u);
    commitAll(repo, 'migrated');
    const committed = run(['migrate', '.'], repo);
    expect(committed.status, committed.stderr).toBe(0);
    expect(committed.stdout).toBe('wildshard update: GUIDE.md and the skills from @wildshard/sdk 0.6.0\n  already up to date\nnothing to migrate; stamped 0.6.0\n');
    expect(run(['status', repo], root).stdout).toContain('  pending migrations: none');
  }, 60_000);

  it('stamps a repo with nothing pending on its first run', () => {
    const repo = shardRepo({});
    expect(readStamp(repo)).toBeUndefined();
    const done = run(['migrate'], repo);
    expect([done.status, done.stdout.trimEnd().split('\n').at(-1)]).toEqual([0, 'nothing to migrate; stamped 0.6.0']);
    expect(readStamp(repo)).toBe('0.6.0');
  });

  it('refuses a dirty tree, or a repo not in git, before it writes anything', () => {
    const repo = shardRepo({ '0.5.0': MIGRATION_050 });
    writeFileSync(join(repo, 'notes.txt'), 'wip\n');
    const dirty = run(['migrate'], repo);
    expect([dirty.status, dirty.stdout]).toEqual([1, '']);
    expect(dirty.stderr).toMatch(/^migrate: .* has uncommitted changes \(notes\.txt\); commit or stash them first, so git diff shows only what migrate changes\n {2}\[migrate-dirty\] fix: Commit or stash your changes, then run `wildshard migrate` again\. \(GUIDE\.md#migrate-dirty\)\n$/u);
    expect([existsSync(join(repo, 'GUIDE.md')), existsSync(join(repo, 'public/assets/tree.glb')), readStamp(repo)]).toEqual([false, true, undefined]);

    const loose = shardRepo({ '0.5.0': MIGRATION_050 }, { git: false });
    const none = run(['migrate'], loose, { ...process.env, GIT_CEILING_DIRECTORIES: root });
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/^migrate: .* is not in a git repo with its package\.json committed[\s\S]*\[migrate-no-git\]/u);
    expect(readStamp(loose)).toBeUndefined();
  });

  it('stops at a migration that throws, names it, and leaves the stamp as it was', () => {
    const repo = shardRepo({ '0.5.0': MIGRATION_050, '0.6.0': THROWING_060 });
    const done = run(['migrate'], repo);
    expect(done.status).toBe(1);
    expect(done.stderr).toMatch(/^migrate: migration 0\.6\.0\.mjs failed: boom; the stamp is unchanged \(none\): git diff shows what it changed before it stopped\n {2}\[migrate\] fix: /u);
    expect(done.stdout).toBe('');
    expect(readStamp(repo)).toBeUndefined();
    // 0.5.0 ran before it; git diff shows it.
    expect(existsSync(join(repo, 'src/static/assets/tree.glb'))).toBe(true);
  });

  it('refuses a repo with no sdk installed, and extra operands', () => {
    const repo = shardRepo({});
    rmSync(join(repo, 'node_modules'), { recursive: true });
    const done = run(['migrate'], repo);
    expect(done.status).toBe(1);
    expect(done.stderr).toMatch(/^migrate: .* has no @wildshard\/sdk or @wildshard\/sharddev installed: run pnpm install, then migrate again\n {2}\[migrate\]/u);
    expect(run(['migrate', 'a', 'b'], repo)).toMatchObject({ status: 1, stderr: 'usage: wildshard migrate [dir] (or migrate --dry-run <file> [--server <url>])\n' });
  });

  it('still routes migrate --dry-run <file> to the API dry run (CP7)', () => {
    const usage = run(['migrate', '--dry-run'], root);
    expect([usage.status, usage.stderr]).toEqual([1, 'usage: wildshard migrate --dry-run <file> [--server <url>]\n']);
    const file = join(root, 'isle.shardfile');
    writeFileSync(file, 'shard file bytes');
    // Nothing listens on port 9: the dry run asks the API there and fails as its own verb does (exit 3).
    const asked = run(['migrate', '--dry-run', file, '--server', 'http://127.0.0.1:9'], root);
    expect(asked.status).toBe(3);
    expect(asked.stderr).toMatch(/^wildshard: migrate: /u);
  });
});
