import { afterEach, expect, it } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture writes and reads its own product directory.
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve fixture files inside the owned output directory.
import { relative, resolve } from 'node:path';
import { emptyShardfile } from '@wildshard/sdk/author';
import { emitPlatformSections } from '@wildshard/sdk/platformSections';
import { encodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import { validateShardfileFolder as validateShardfileProduct, type ShardfileFiles as ProductFiles } from '@wildshard/format/shardfileValidation';
import { hashImmutableBytes } from './immutable';
import { validateOutputProduct, writeOutputProduct } from './outputProduct';

// P1-F3: the format half of `validate` runs with only a file map and a SHA-256 port, and agrees with the author SDK's.
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function output(): string { mkdirSync('tmp', { recursive: true }); const path = mkdtempSync(resolve('tmp', 'format-product-')); directories.push(path); return path; }
function inMemory(directory: string, extra: ReadonlyMap<string, Uint8Array> = new Map()): ProductFiles {
  const files = new Map(extra);
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const path = resolve(folder, name);
      if (statSync(path).isDirectory()) walk(path); else files.set(relative(directory, path).split('\\').join('/'), new Uint8Array(readFileSync(path)));
    }
  };
  walk(directory);
  return {
    read: (path, maxBytes) => {
      const bytes = files.get(path);
      if (bytes === undefined || bytes.length > maxBytes) throw new Error(`Missing or oversized: ${path}`);
      return bytes;
    },
    paths: () => files.keys(),
  };
}

it('validates a written product from format alone, as the author SDK does', () => {
  const shard = emptyShardfile({ slug: 'format-only', name: 'Format only', author: 'Test', revision: 1, seed: 5 }), directory = output();
  const tile = encodeTerrainTile({ resolution: 2, x: 0, z: 0, size: 1, heights: new Float32Array([1, 2, 3, 4]) });
  const assets = new Map([[hashImmutableBytes(tile), tile]]);
  shard.files = [...assets].map(([hash, bytes]) => ({ hash, kind: 'binary', compressed: bytes.length, decoded: bytes.length + 1024, gpu: 1024, triangles: 4, draws: 1, dependencies: [], critical: false }));
  shard.library = [...assets.keys()]; shard.budgets.library = { resident: 100000, compressed: 100000 };
  writeOutputProduct(shard, assets, directory, { platform: emitPlatformSections(new Map([['ui/strings', { hello: 'Hello' }]])) });
  const formatOnly = validateShardfileProduct(inMemory(directory), { hash: hashImmutableBytes });
  const author = validateOutputProduct(directory);
  expect(formatOnly.shard).toEqual(author.shard);
  expect(formatOnly.index).toEqual(author.index);
  expect(formatOnly.assets).toEqual(assets);
  expect(formatOnly.sections.get('ui/strings')).toEqual({ hello: 'Hello' });
  expect(() => validateShardfileProduct(inMemory(directory, new Map([['unlisted.js', new Uint8Array([1])]])), { hash: hashImmutableBytes })).toThrow(/Unlisted/u);
  expect(() => validateShardfileProduct(inMemory(directory), { hash: () => '0'.repeat(64) })).toThrow(/hash or size/u);
});
