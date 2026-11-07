// oxlint-disable-next-line import/no-nodejs-modules -- Each case owns its scratch cache; source trees are observed read-only.
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- All fixture inputs and caches are explicitly bounded.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Compare actual immutable banks without dumping their contents.
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { generate } from '../src/shards/pastel-plain/shard.config';
import { createProjectGeneration } from '../src/sharddev/projectGeneration';
import { readProjectAssets } from '../src/sharddev/project';
import { encodeCanonicalJson, hashImmutableBytes } from '../src/sdk/immutable';
import { PASTEL_SOURCE, pastelAssets } from './fixtures/pastelSource';

test('cold and cached Pastel generation preserve every original source row and actual asset byte', async () => {
  mkdirSync('tmp', { recursive: true }); const cache = mkdtempSync(resolve('tmp', 'pastel-generation-'));
  try {
    const assets = new Map<string, Uint8Array>(), root = resolve('src/shards/pastel-plain');
    const first = await generate(createProjectGeneration(root, 'c'.repeat(64), assets, cache));
    const hit = await generate(createProjectGeneration(root, 'c'.repeat(64), assets, cache));
    expect(encodeCanonicalJson(first.shard)).toBe(encodeCanonicalJson(PASTEL_SOURCE));
    expect(hit.shard).toEqual(first.shard);
    if (first.map === undefined || hit.map === undefined) throw new Error('Missing Pastel map lattice');
    expect(Buffer.compare(first.map.pixels, hit.map.pixels)).toBe(0);
    const expected = pastelAssets(); expect(assets.size).toBeGreaterThan(100);
    for (const [hash, bytes] of assets) {
      const old = expected.get(hash); if (old === undefined) throw new Error('Unexpected generated Pastel asset');
      expect(Buffer.compare(bytes, old), hash).toBe(0);
    }
    console.info({ pastelRowsHash: hashImmutableBytes(new TextEncoder().encode(encodeCanonicalJson(first.shard))), files: first.shard.files.length, generated: assets.size });
  } finally { rmSync(cache, { recursive: true, force: true }); }
});

test('the real Pastel loader admits the source program and map without writing source outputs', async () => {
  const root = resolve('src/shards/pastel-plain'), before = readdirSync(root, { recursive: true, encoding: 'utf8' }).sort((a, b) => a.localeCompare(b));
  const loaded = await readProjectAssets(root, undefined, { folder: 'pastel-plain', file: resolve(root, 'manifest.json'), imageRoots: [{ prefix: '/assets/', directory: resolve('public/assets') }, { prefix: '/src/shards/pastel-plain/', directory: root }] }, { mapSourceHash: 'e'.repeat(64) });
  expect(loaded.shard.manifest?.minimap.image).toContain('/shardfiles/pastel-plain/blobs/');
  expect(loaded.shard.identity.slug).toBe('pastel-plain'); expect(loaded.shard.map?.tilesHash).toBe('e'.repeat(64));
  expect(readdirSync(root, { recursive: true, encoding: 'utf8' }).sort((a, b) => a.localeCompare(b))).toEqual(before);
});
