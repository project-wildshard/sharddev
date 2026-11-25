import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { buildShardfiles } from '../scripts/build-shardfiles.mjs';
import { runWildshard } from '../scripts/wildshard.mjs';

// A7 (sdk 0.5.0): a migrated shard repo keeps no public/. A shard with a generated map (pastel-plain's painter program)
// once had build-shards copy that map out to public/assets/<slug>/map/top.webp; the product carries the map itself.
const scratch = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratch, { recursive: true });
const repo = mkdtempSync(join(scratch, 'build-shards-no-public-'));
afterAll(() => { rmSync(repo, { recursive: true, force: true }); });

/** pastel-plain in `root`; its map inputs that name the sdk's own source (`../../sharddev/…`) are not in a copy, and
 * build-shards refuses a missing input (sdk-migrate F3), so the copy lists only what it holds. */
function copyPastelPlain(root: string, extra: readonly string[] = []): string {
  const shard = join(root, 'src/shards/pastel-plain'), settings = join(shard, 'data/map.json');
  cpSync(resolve(import.meta.dirname, '../../sdk/src/shards/pastel-plain'), shard, { recursive: true });
  cpSync(resolve(import.meta.dirname, '../../sdk/lint/tile-bake-debt.json'), join(root, 'lint/tile-bake-debt.json'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'no-public', private: true, type: 'module' })}\n`);
  const map = JSON.parse(readFileSync(settings, 'utf8')) as { inputs: string[] };
  map.inputs = [...map.inputs.filter(input => existsSync(resolve(shard, input))), ...extra];
  writeFileSync(settings, `${JSON.stringify(map, null, 2)}\n`);
  return shard;
}

// sdk-migrate F3 (sdk 0.6.0): the map hash skips an absent input, so a map input naming no file (a typo, a moved path)
// once built a map that ignored it without a word. build-shards refuses it before building, naming the file.
test('build-shards refuses a map input that names no file, naming it', async () => {
  const other = mkdtempSync(join(scratch, 'build-shards-missing-input-'));
  try {
    copyPastelPlain(other, ['../../../public/assets/pastel-plain/well.glb']);
    await expect(buildShardfiles(other, { strict: false, copyRuntime: false, only: ['pastel-plain'], build: () => { throw new Error('built'); } }))
      .rejects.toThrow(/src\/shards\/pastel-plain\/data\/map\.json lists map input\(s\) that name no file: \.\.\/\.\.\/\.\.\/public\/assets\/pastel-plain\/well\.glb/u);
    expect(existsSync(join(other, 'out'))).toBe(false);
  } finally { rmSync(other, { recursive: true, force: true }); }
});

test('build-shards of a generated-map shard writes out/<slug> and no public/', async () => {
  copyPastelPlain(repo);
  await buildShardfiles(repo, { strict: false, copyRuntime: false, only: ['pastel-plain'],
    // The real builder, unrecorded: a recorded receipt only seals inputs inside the repo, and this shard reads the sdk's.
    build: (args: readonly string[]) => runWildshard(args) });
  expect(existsSync(join(repo, 'out/pastel-plain/shard.json'))).toBe(true);
  expect(existsSync(join(repo, 'public'))).toBe(false);
}, 180_000);
