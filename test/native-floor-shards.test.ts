import { driftwoodPhysics, driftwoodPhysicsGroundBytes } from '../src/shards/driftwood-isle/generators/physics';
import { pinePhysics } from '../src/shards/pine-hollow/generators/physics';
// oxlint-disable-next-line import/no-nodejs-modules -- Read the actual native floor payloads without importing megabyte JSON types.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { nativeGroundRecordSchema } from '@wildshard/format/nativePhysics';
import { nativeBakeGround } from '@wildshard/engine/game/population/nativeBake';
import { nativeBakeFloats,originalNativeGround } from './fixtures/native-bake-inline';
import { hashImmutableBytes } from '../src/sdk/immutable';

for (const slug of ['driftwood-isle','pine-hollow']) test(`${slug} retains all floor bytes and values through inline and raw intake`, () => {
  const source:unknown=slug === 'driftwood-isle' ? driftwoodPhysics() : pinePhysics();
  const row=v.parse(v.object({ground:nativeGroundRecordSchema(256,true)}),source).ground;
  const original=typeof row.heights==='string' ? nativeBakeFloats(row.heights)
    : new Float32Array((slug === 'driftwood-isle' ? driftwoodPhysicsGroundBytes() : Uint8Array.from(readFileSync(`src/shards/${slug}/${row.heights.file}`))).buffer);
  const bytes=new Uint8Array(original.buffer);
  const inline=originalNativeGround({...row,heights:Buffer.from(bytes).toString('base64')},256,500,slug);
  const file='data/floor.bin';
  const raw=nativeBakeGround({...row,heights:{file}},256,500,slug,{file,bytes});
  expect(original).toHaveLength(65536);
  for (const current of [inline,raw]) {
    expect(hashImmutableBytes(new Uint8Array(current.heights.buffer))).toBe(hashImmutableBytes(bytes));
    expect(original.every((value,index)=>Object.is(value,current.heights[index]))).toBe(true);
    expect(current.scale).toEqual({x:500,y:1,z:500});
    expect(current.at).toEqual({x:0,y:0,z:0});
    expect(current.friction).toBe(row.friction);expect(current.groups).toBe(row.groups);
  }
  console.info(`${slug}: 262144 bytes, 65536 Object.is values; SHA-256 ${hashImmutableBytes(bytes)}`);
});
