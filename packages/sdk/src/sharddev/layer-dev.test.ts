// oxlint-disable-next-line import/no-nodejs-modules -- Spawn the author lint over a scaffolded repo.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a repo into a scratch folder and link its packages.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the scratch repo and this sdk checkout.
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { authorLintPlan } from './authorLint';
import { writeShardRepo } from './newProject';

// SDK-SPLIT SP13g: the split codemod moved Sky Reach's map bake to `@wildshard/dev/bake/mapRest`, and the author lint
// refused it ("No such layer package"): dev was not one of the packages whose real exports the layer rule accepts.
const SDK = resolve(import.meta.dirname, '../..');
const WORKSPACE = resolve(SDK, '../..');
let scratch = '';
beforeAll(() => { mkdirSync('tmp', { recursive: true }); scratch = mkdtempSync(resolve('tmp', 'layer-dev-')); });
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

it('a shard imports a real @wildshard/dev export, and an unknown dev subpath still refuses', () => {
  const repo = resolve(scratch, 'repo');
  writeShardRepo(repo, 'layer-dev', {});
  writeFileSync(resolve(repo, 'src/bake-map.mjs'), [
    "import { bakeMapRest } from '@wildshard/dev/bake/mapRest';",
    "import { nothing } from '@wildshard/dev/bake/notThere';",
    'export const used = [bakeMapRest, nothing];',
    '',
  ].join('\n'));
  mkdirSync(resolve(repo, 'node_modules/@wildshard'), { recursive: true });
  symlinkSync(SDK, resolve(repo, 'node_modules/@wildshard/sdk'));
  symlinkSync(resolve(WORKSPACE, 'packages/dev'), resolve(repo, 'node_modules/@wildshard/dev'));
  for (const pkg of ['@wildshard/engine', '@wildshard/format', 'three']) symlinkSync(resolve(SDK, 'node_modules', pkg), resolve(repo, 'node_modules', pkg));
  expect(spawnSync('git', ['init', '-q', '.'], { cwd: repo }).status).toBe(0);
  const plan = authorLintPlan(resolve(repo, 'src'), SDK);
  if (plan.kind !== 'run') throw new Error(plan.note);
  const run = spawnSync(plan.bin, plan.args, { cwd: plan.cwd, env: { ...process.env, ...plan.env }, encoding: 'utf8' });
  const report = JSON.parse(run.stdout) as { diagnostics: { message: string; filename: string }[] };
  const layer = report.diagnostics.filter(row => row.message.startsWith('No such layer package')).map(row => row.message);
  expect(layer).toEqual(['No such layer package: @wildshard/dev/bake/notThere']);
}, 120_000);
