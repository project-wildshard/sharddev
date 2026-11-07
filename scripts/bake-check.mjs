#!/usr/bin/env node
// E357 F1: check committed outputs by baking them, including local GPU/encoder outputs where supported.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { toolVersion } from '@wildshard/engine/scripts/bake-output.mjs';

const ROOT = pathResolve(import.meta.dirname, '..');
const nodeOnly = process.argv.includes('--node-only'); // builders queue the GPU/derived batch to the lead
const skipGpu = nodeOnly ? true : process.argv.includes('--skip-gpu');
const state = { failed: false };
const run = (args, command = process.execPath) => {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) state.failed = true;
  return result.status === 0;
};
// SF74 W24 (speed audit #10): the push gate caches each node baker on its own inputs (`--list-node`, then
// `--node-only --only=<baker>` per cached step), so one touched src file re-runs only the bakers that read it.
const NODE_BAKERS = ['directors', 'chunk', 'sky', 'navmesh', 'island-cover', 'voxel-ao', 'geometry', 'cloud-field', 'water-ripples', 'nalati-bodies', 'nalati-places', 'pine-thrall-extras', 'pine-rain'];
if (process.argv.includes('--list-node')) { console.log(NODE_BAKERS.join('\n')); process.exit(0); }
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
if (only !== undefined && !NODE_BAKERS.includes(only)) { console.error(`bake-check: no node baker ${only} (${NODE_BAKERS.join(', ')})`); process.exit(64); }
if (only !== undefined && !nodeOnly) { console.error('bake-check: --only needs --node-only'); process.exit(64); }
for (const baker of NODE_BAKERS) if (only === undefined || only === baker) {
  if (baker === 'directors') {
    run(['--experimental-transform-types', '--import', './scripts/bake-loader.mjs', '--input-type=module', '-e', `import { runCli } from './src/sharddev/cli.ts'; await runCli(['build', 'src/shards/nalati-grasslands', '--behaviour-only', '--check']);`]);
  } else {
    const entry = baker.startsWith('pine-') ? `src/shards/pine-hollow/generators/bake-${baker}.mjs` : baker.startsWith('nalati-') ? `src/shards/nalati-grasslands/generators/bake-${baker === 'nalati-places' ? 'nalati-painted' : baker}.mjs` : `scripts/bake-${baker}.mjs`;
    run(['--experimental-transform-types', '--import', './scripts/bake-loader.mjs', entry, '--check']);
  }
}

const metal = only === undefined && process.platform === 'darwin' && spawnSync('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8' }).stdout.includes('Metal');
if (only !== undefined) { /* one node baker: no GPU bakers */ }
else if (!metal) console.log('bake-check: GPU bakers skipped (no Metal): bake-textures');
else if (skipGpu) console.log('bake-check: GPU bakers queued: bake-textures');
else if (!state.failed) {
  // SF87 (G320): the sky textures render on their own bake page (no game build, no preview, no ?chunk= boot)
  run(['scripts/browser-lane.sh', '--max', '4', process.execPath, 'scripts/bake-textures.mjs', '--check', '--all'], 'bash');
}
if (only !== undefined) { /* one node baker for the gate's per-baker cache */ }
else if (nodeOnly) console.log('bake-check: derived copies queued (--node-only): tex-tiers, bake-ktx2');
else {
  if (toolVersion('magick', ['-version']) && toolVersion('cwebp', ['-version'])) run(['scripts/tex-tiers.mjs', '--check']);
  else console.log('bake-check: phone copies skipped (no magick/cwebp): tex-tiers');
  if (toolVersion('magick', ['-version']) && toolVersion('basisu', ['-version'])) run(['--import', './scripts/bake-loader.mjs', 'scripts/bake-ktx2.mjs', '--check']);
  else console.log('bake-check: KTX2 copies skipped (no magick/basisu): bake-ktx2');
}
if (state.failed) {
  const playwright = JSON.parse(readFileSync(join(ROOT, 'node_modules/playwright/package.json'), 'utf8'));
  console.log(`bake-check: tools node ${process.version}; playwright ${playwright.version}; ${['magick', 'cwebp', 'basisu'].map((command) => `${command} ${toolVersion(command, ['-version']) ?? 'unavailable'}`).join('; ')}`);
  process.exitCode = 1;
}
