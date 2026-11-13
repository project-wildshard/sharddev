import { expect, test } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { Float32BufferAttribute, MeshStandardMaterial, PlaneGeometry } from 'three';
import { emptyShardfile } from '../author';
import { staticGlb } from './glb';
import { compressGlb } from './glbCompression';
import { WorldBakeRows } from './worldRows';
import { coarseNearView, shardfileWorld } from './placeholders';

async function world(): Promise<Uint8Array> {
  const geometry = new PlaneGeometry(20, 20, 16, 16).rotateX(-Math.PI / 2).translate(20, 1, 20);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new Float32BufferAttribute(Float32Array.from({ length: count * 3 }, (_, i) => (i % 19) / 18), 3));
  const material = new MeshStandardMaterial({ vertexColors: true, color: 0x8796ab }); material.name = 'Ground';
  try {
    const io = new NodeIO(), doc = await io.readBinary(staticGlb([{ geometry, material, name: 'ground', nativeAttributes: true }]));
    for (const node of doc.getRoot().listNodes()) node.setTranslation([5, 2, 3]).setScale([1.5, 1, 2]);
    return await io.writeBinary(doc);
  } finally { geometry.dispose(); material.dispose(); }
}

function admitted(bytes: Uint8Array) {
  const pack = new WorldBakeRows();
  pack.tile({ lod: 1, x: 2, z: 2, bytes, bounds: { min: [0, 0, 0], max: [125, 20, 125] } });
  const data = pack.finish('pbr');
  return { shard: { ...emptyShardfile({ slug: 'meshopt-near', name: 'Near', author: 'Test', revision: 1, seed: 1 }),
    files: data.files, tiles: data.tiles, props: data.props }, assets: data.assets };
}

test('raw near intake preserves geometry, transforms and selection before codec changes', async () => {
  const bytes = await world(), raw = admitted(bytes), repeated = admitted(bytes);
  const prototypes = await shardfileWorld(raw.shard, raw.assets), first = prototypes[0];
  expect(prototypes).toHaveLength(1);
  if (first === undefined) throw new Error('Missing raw near prototype');
  expect(first.positions).toHaveLength(289 * 3);
  expect(Array.from(first.positions.subarray(0, 3))).toEqual([10, 1, 10]);
  expect(first.index).toHaveLength(16 * 16 * 6);
  expect(first.colours).toHaveLength(first.positions.length);
  expect(first.colours.some(value => value > 0)).toBe(true);
  expect(first.transforms).toEqual([[1.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 5, 2, 3, 1]]);
  expect(await shardfileWorld(raw.shard, raw.assets, name => name === 'Ground')).toEqual([]);
  expect(await shardfileWorld(raw.shard, raw.assets, undefined, 0)).toEqual([]);
  const a = await coarseNearView(raw.shard, raw.assets), b = await coarseNearView(repeated.shard, repeated.assets);
  expect(b.near).toEqual(a.near);
  if (a.near === null || a.near === undefined) throw new Error('Missing raw near bake');
  expect(a.near.content.length).toBeGreaterThan(0);
  for (const hash of a.near.content) expect(repeated.assets.get(hash)).toEqual(raw.assets.get(hash));
});

test('raw truncated near data refuses without poisoning the next valid read', async () => {
  const bytes = await world(), raw = admitted(bytes), ref = raw.shard.tiles[0]?.files[0];
  if (ref === undefined) throw new Error('Missing raw fixture tile');
  await expect(shardfileWorld(raw.shard, new Map([[ref, bytes.subarray(0, -8)]]))).rejects.toThrow();
  expect(await shardfileWorld(raw.shard, raw.assets)).toHaveLength(1);
});

test('existing meshopt producer feeds identical near prototypes and baked output', async () => {
  const bytes = await world(), raw = admitted(bytes), packed = admitted(compressGlb(bytes));
  const a = await shardfileWorld(raw.shard, raw.assets), b = await shardfileWorld(packed.shard, packed.assets);
  const content = (rows: typeof a) => rows.map(row => ({ ...row, name: row.name.slice(row.name.indexOf(':') + 1) }));
  expect(content(b)).toEqual(content(a));
  expect(a).toHaveLength(1);
  expect(await shardfileWorld(packed.shard, packed.assets, name => name === 'Ground')).toEqual([]);
  expect(await shardfileWorld(packed.shard, packed.assets, undefined, 0)).toEqual([]);
  const first = await coarseNearView(raw.shard, raw.assets), second = await coarseNearView(packed.shard, packed.assets);
  expect(second.near).toEqual(first.near);
  if (first.near === null || first.near === undefined) throw new Error('Missing packed near bake');
  expect(first.near.content.length).toBeGreaterThan(0);
  for (const hash of first.near.content) expect(packed.assets.get(hash)).toEqual(raw.assets.get(hash));
});

test('corrupt meshopt payload refuses without poisoning the next near read', async () => {
  const bytes = compressGlb(await world()), packed = admitted(bytes), ref = packed.shard.tiles[0]?.files[0];
  if (ref === undefined) throw new Error('Missing fixture tile');
  await expect(shardfileWorld(packed.shard, new Map([[ref, bytes.subarray(0, -8)]]))).rejects.toThrow();
  expect(await shardfileWorld(packed.shard, packed.assets)).toHaveLength(1);
});
