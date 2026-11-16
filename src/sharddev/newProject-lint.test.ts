// oxlint-disable-next-line import/no-nodejs-modules -- Spawn the planned oxlint run over a scaffolded repo.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold new repos into a scratch folder and link their packages.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the scratch repos and this sdk checkout.
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTHOR_LINT_CONFIG, authorLintPlan } from './authorLint';
import { writeShardRepo } from './newProject';

// TEMPLATE-E2E TC-NE4 (NEW-SHARD-E2E F4): `wildshard check .` on an untouched new repo ran no lint, because the repo had
// no `.oxlintrc.author.json`. Every shape `new` writes now carries one, and its own source passes it.
const SDK = resolve(import.meta.dirname, '../..');

describe('a new repo lints from its first check (TC-NE4)', () => {
  let scratch = '';
  beforeAll(() => { mkdirSync('tmp', { recursive: true }); scratch = mkdtempSync(resolve('tmp', 'new-lint-')); });
  afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

  it.each([['sdk', {}], ['scene', { template: 'scene' }], ['empty', { empty: true }]] as const)('%s: the config names the installed sdk\'s plugins and the source passes it', (name, options) => {
    const repo = resolve(scratch, name);
    writeShardRepo(repo, `lint-${name}`, options);
    const config = readFileSync(resolve(repo, AUTHOR_LINT_CONFIG), 'utf8');
    expect(config).toContain('"./node_modules/@wildshard/sdk/lint/engine-plugin.mjs"');
    expect(config).toContain('"./node_modules/@wildshard/sdk/lint/sdk-plugin.mjs"');
    expect(config).not.toMatch(/src\/shards\/\*\/|"\.\/lint\/|\$schema/u);
    // The installed packages a repo resolves its plugins and imports through: this sdk checkout and its pins.
    mkdirSync(resolve(repo, 'node_modules/@wildshard'), { recursive: true });
    symlinkSync(SDK, resolve(repo, 'node_modules/@wildshard/sdk'));
    for (const pkg of ['@wildshard/engine', '@wildshard/format', 'three']) symlinkSync(resolve(SDK, 'node_modules', pkg), resolve(repo, 'node_modules', pkg));
    // oxlint skips paths a parent checkout ignores (scratch sits under tmp/); a new repo is its own git root.
    expect(spawnSync('git', ['init', '-q', '.'], { cwd: repo }).status).toBe(0);
    const plan = authorLintPlan(resolve(repo, 'src'), SDK);
    if (plan.kind !== 'run') throw new Error(plan.note);
    expect(plan.cwd).toBe(repo);
    expect(existsSync(plan.bin)).toBe(true);
    const run = spawnSync(plan.bin, plan.args, { cwd: plan.cwd, env: { ...process.env, ...plan.env }, encoding: 'utf8' });
    const report = JSON.parse(run.stdout) as { diagnostics: { message: string; filename: string }[]; number_of_files: number };
    expect(report.diagnostics.map(row => `${row.filename}: ${row.message}`)).toEqual([]);
    expect(report.number_of_files).toBeGreaterThan(0);
    expect(run.status).toBe(0);
  }, 120_000);
});
