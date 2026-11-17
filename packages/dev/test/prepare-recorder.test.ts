// SENTRY-TRIAGE S12: the two `wildshard prepare` gaps S10 found. The recorder must pass engine main's Name prompt, and the
// mount recorder must mount every hashed stand-in a product's texture table names (GAME-89: Pine's rigs and birds 404'd).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NAME_ASKED } from '@wildshard/engine/scripts/debug-settings.mjs';
import { expect, test } from 'vitest';
import { preparationSaveSeed } from '../scripts/preparation-seed.mjs';

test('the preparation seed answers the Name prompt and the first-play card on the served epoch', () => {
  const seed = preparationSaveSeed(1);
  const device = JSON.parse(seed['wildshard.save.v2@1.device'] ?? '{}') as { keys: Record<string, { v: number; data: unknown }> };
  expect(device.keys[NAME_ASKED.key]).toEqual({ v: 1, data: NAME_ASKED.data });
  expect(device.keys['firstPlayDone']).toEqual({ v: 1, data: true });
  expect(Object.keys(preparationSaveSeed(0))).toEqual(['wildshard.save.v2.global', 'wildshard.save.v2.device']);
});

test('the mount recorder mounts every target the product texture table names, on both tiers', () => {
  mkdirSync(resolve('tmp'), { recursive: true });
  const root = mkdtempSync(resolve('tmp/prepare-recorder-'));
  const put = (path: string, text: string): void => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), text); };
  try {
    put('dist/index.html', '<script type="application/json" id="boot-module-files">{"spawnManifests":{"client":{}},"extras":{}}</script>');
    put('dist/assets/spawn/packs-0.json', '{"client":{}}');
    put('src/shards/fen/manifest.json', '{}');
    put('out/fen/shard.json', '{}');
    // The section names the source URL; the table maps each tier's source to a hashed stand-in no variant spells.
    put('out/fen/sections/actors/creatures.json', '{"rig":"/assets/fen/creatures/wolf.rigged.glb"}');
    const table = {
      shard: {
        phone: { '/assets/fen/creatures/wolf.phone.rigged.glb': '/assets/gpu/fen/creatures/wolf.phone.rigged-0a1b2c3d.glb', '/assets/fen/life/birds.phone.glb': '/assets/gpu/fen/life/birds.phone-11aa22bb.glb' },
        desktop: { '/assets/fen/creatures/wolf.rigged.glb': '/assets/gpu/fen/creatures/wolf.rigged-4e5f6a7b.glb' },
      },
      grid: { desktop: { '/assets/fen/life/birds.glb': '/assets/gpu/fen/life/birds-33cc44dd.glb' } },
    };
    put('out/fen/mounts/shardfiles/fen/discovery.json', JSON.stringify({ native: { ktx2: { $call: 'pageModeKtx2', args: [table] } } }));
    for (const url of ['/assets/fen/creatures/wolf.rigged.glb', '/assets/gpu/fen/creatures/wolf.phone.rigged-0a1b2c3d.glb', '/assets/gpu/fen/creatures/wolf.rigged-4e5f6a7b.glb',
      '/assets/gpu/fen/life/birds.phone-11aa22bb.glb', '/assets/gpu/fen/life/birds-33cc44dd.glb']) put(`public${url}`, 'glb');
    const run = spawnSync(process.execPath, [resolve('scripts/record-shard-mounts.mjs'), `--root=${root}`, `--dist=${resolve(root, 'dist')}`], { encoding: 'utf8' });
    expect(run.stderr).not.toMatch(/Error/u);
    expect(run.status).toBe(0);
    const mounts = JSON.parse(readFileSync(resolve(root, 'src/shards/fen/mounts.json'), 'utf8')) as { outputs: Record<string, string[]> };
    expect(mounts.outputs['fen']).toEqual(expect.arrayContaining([
      '/assets/gpu/fen/creatures/wolf.phone.rigged-0a1b2c3d.glb', '/assets/gpu/fen/creatures/wolf.rigged-4e5f6a7b.glb',
      '/assets/gpu/fen/life/birds.phone-11aa22bb.glb', '/assets/gpu/fen/life/birds-33cc44dd.glb',
    ]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
