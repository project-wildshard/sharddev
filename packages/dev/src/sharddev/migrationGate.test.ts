// oxlint-disable-next-line import/no-nodejs-modules -- Each verb runs as the real bin in its own process.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Real temp shard repos with a real installed sdk folder on disk.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the bins and the scratch repos.
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeFixtures, fixtureRoot } from '../../../sdk/src/sharddev/test/ownedScratch';

// SDK 0.5.0 plan M2: a shard repo whose installed sdk has a migration it has not run refuses dev, watch, build, check
// and upload up front, with one block naming it; `check --json` carries it as `migration-pending`; a repo with nothing
// pending runs as before; `status --brief` prints one line or nothing. Real temp repos, a real installed sdk folder with a
// real codemod file, the real bins.
const DEV_BIN = resolve(import.meta.dirname, '../../bin/wildshard.mjs');
const CLI_BIN = resolve(import.meta.dirname, '../../../cli/bin/wildshard.mjs');
const root = fixtureRoot('migration-gate-');
afterAll(() => { rmSync(root, { recursive: true, force: true }); closeFixtures(); });

/** 0.5.0's migration, as the installed sdk ships it: pending while public/assets/ is in the repo. */
const CODEMOD = `import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export const title = 'shard assets move from public/ into src/static/';
export const guide = 'migrate-0-5-0';
export const pending = ({ project }) => existsSync(resolve(project, 'public/assets')) ? 'public/assets/ exists' : undefined;
export default () => [];
`;

let repos = 0;
/** A shard repo with sdk 0.5.0 installed, stamped `stamp` (or not), in the old layout or not. */
function shardRepo(stamp: string | undefined, oldLayout: boolean): string {
  repos += 1;
  const repo = join(root, `repo-${String(repos)}`), sdk = join(repo, 'node_modules/@wildshard/sdk');
  mkdirSync(join(sdk, 'codemods'), { recursive: true });
  writeFileSync(join(sdk, 'package.json'), '{ "name": "@wildshard/sdk", "version": "0.5.0" }\n');
  writeFileSync(join(sdk, 'codemods/0.5.0.mjs'), CODEMOD);
  const pkg = { name: 'isle', dependencies: { '@wildshard/sdk': '0.5.0' }, ...(stamp === undefined ? {} : { wildshard: { migrated: stamp } }) };
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify(pkg)}\n`);
  if (oldLayout) mkdirSync(join(repo, 'public/assets'), { recursive: true });
  return repo;
}

const run = (bin: string, args: readonly string[], cwd: string): { status: number | null; stdout: string; stderr: string } => {
  const done = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
  return { status: done.status, stdout: done.stdout, stderr: done.stderr };
};

const block = (head: string): string => [
  head,
  '0.5.0 is a breaking release, and its migration has not run here:',
  '  0.5.0  shard assets move from public/ into src/static/   (GUIDE.md#migrate-0-5-0)',
  '         found: public/assets/ exists',
  'Run:   pnpm exec wildshard migrate',
  'Agents: read node_modules/@wildshard/sdk/skills/wildshard-upgrade/SKILL.md and follow it.',
].join('\n');
const STAMPED = block('wildshard: this repo is migrated to sdk 0.4.29, but 0.5.0 is installed.');
const HINT = '\n  [migration-pending] fix: Run `pnpm exec wildshard migrate`';

describe('the migration-pending refusal (M2)', () => {
  it('refuses dev, watch, check, build and upload up front with the block', () => {
    const repo = shardRepo('0.4.29', true);
    const verbs: readonly (readonly [string, readonly string[]])[] = [
      [DEV_BIN, ['dev', '.']], [DEV_BIN, ['watch', '.', '0']], [DEV_BIN, ['check', '.']], [DEV_BIN, ['build', '.']],
      [DEV_BIN, ['upload', 'out/isle.shardfile', '--channel', 'staging']],
      // @wildshard/cli hands `build` to build's own bin, past dev's.
      [CLI_BIN, ['build', '.']],
    ];
    for (const [bin, args] of verbs) {
      const done = run(bin, args, repo);
      expect([done.status, done.stdout], args.join(' ')).toEqual([1, '']);
      expect(done.stderr.startsWith(`${STAMPED}${HINT}`), `${args.join(' ')} printed:\n${done.stderr}`).toBe(true);
    }
  });

  it('says so when the repo has no stamp', () => {
    const done = run(DEV_BIN, ['dev', '.'], shardRepo(undefined, true));
    expect(done.status).toBe(1);
    expect(done.stderr).toContain(block('wildshard: this repo has no migration stamp, but sdk 0.5.0 is installed.'));
  });

  it('carries it in check --json as rule migration-pending', () => {
    const done = run(DEV_BIN, ['check', '.', '--json'], shardRepo('0.4.29', true));
    expect(done.status, done.stderr).toBe(1);
    const verdict: unknown = JSON.parse(done.stdout);
    expect(verdict).toMatchObject({
      version: 1, verdict: 'fail',
      refusals: [{ step: 'lint', rule: 'migration-pending', message: STAMPED, guide: 'GUIDE.md#migration-pending', fix: expect.stringContaining('pnpm exec wildshard migrate') as unknown }],
    });
  });

  it('lets a repo with nothing pending run as before, stamped or not', () => {
    for (const repo of [shardRepo('0.5.0', false), shardRepo(undefined, false)]) {
      const upload = run(DEV_BIN, ['upload'], repo);
      expect(upload.status).toBe(1);
      expect(upload.stderr).toMatch(/upload needs a shard file/u);
      expect(upload.stderr).not.toMatch(/migration/u);
    }
    const check = run(DEV_BIN, ['check', '.', '--json'], shardRepo('0.5.0', false));
    const verdict: unknown = JSON.parse(check.stdout);
    expect(verdict).toMatchObject({ version: 1 });
    expect(check.stdout).not.toContain('migration-pending');
  }, 60_000);

  it('lets help through', () => {
    const done = run(DEV_BIN, ['dev', '--help'], shardRepo('0.4.29', true));
    expect(done.status, done.stderr).toBe(0);
    expect(done.stdout).toMatch(/^Usage: wildshard dev /u);
  });
});

describe('wildshard status (M2)', () => {
  it('prints the installed sdk, the stamp and each pending migration', () => {
    const repo = shardRepo(undefined, true);
    const done = run(DEV_BIN, ['status', repo], root);
    expect(done.status, done.stderr).toBe(0);
    expect(done.stdout).toBe([
      `wildshard status: ${repo}`,
      '  sdk installed: 0.5.0',
      '  migration stamp: none',
      '  pending migrations:',
      '    0.5.0  shard assets move from public/ into src/static/   (GUIDE.md#migrate-0-5-0)',
      '           found: public/assets/ exists',
      '  run: pnpm exec wildshard migrate',
      '',
    ].join('\n'));
  });

  it('--brief: exactly one line while one is pending, else nothing', () => {
    const pending = run(DEV_BIN, ['status', '--brief'], shardRepo('0.4.29', true));
    expect([pending.status, pending.stdout]).toEqual([0, 'wildshard: sdk 0.5.0 is installed, but migration 0.5.0 (shard assets move from public/ into src/static/) has not run in this repo: run pnpm exec wildshard migrate (agents: read node_modules/@wildshard/sdk/skills/wildshard-upgrade/SKILL.md and follow it)\n']);
    const clean = run(DEV_BIN, ['status', '--brief'], shardRepo('0.5.0', false));
    expect([clean.status, clean.stdout, clean.stderr]).toEqual([0, '', '']);
    // Outside a shard repo (a SessionStart hook anywhere): silent.
    const outside = run(DEV_BIN, ['status', '--brief'], root);
    expect([outside.status, outside.stdout]).toEqual([0, '']);
  });
});
