import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('build-shards of a generated-map shard writes out/<slug> and no public/', async () => {
  cpSync(resolve(import.meta.dirname, '../../sdk/src/shards/pastel-plain'), join(repo, 'src/shards/pastel-plain'), { recursive: true });
  cpSync(resolve(import.meta.dirname, '../../sdk/lint/tile-bake-debt.json'), join(repo, 'lint/tile-bake-debt.json'));
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ name: 'no-public', private: true, type: 'module' })}\n`);
  await buildShardfiles(repo, { strict: false, copyRuntime: false, only: ['pastel-plain'],
    // The real builder, unrecorded: a recorded receipt only seals inputs inside the repo, and this shard reads the sdk's.
    build: (args: readonly string[]) => runWildshard(args) });
  expect(existsSync(join(repo, 'out/pastel-plain/shard.json'))).toBe(true);
  expect(existsSync(join(repo, 'public'))).toBe(false);
}, 180_000);
