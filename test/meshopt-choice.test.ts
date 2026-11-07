// CI6: nameMeshoptBlob's choice (meshoptNoLarger, its per-process memo and the gen-cache memo meshoptNoLargerMemo) picks
// exactly what the inline level-9 gzip comparison picked; each pair is compared once per comparison; the gen-cache memo
// answers the same cold, warm and after damage.
// oxlint-disable-next-line import/no-nodejs-modules -- The memo fixture owns repository scratch.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scratch paths never touch the shared gen cache.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The reference is the comparison before the split.
import { gzipSync } from 'node:zlib';
import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from 'three';
import { expect, test, vi } from 'vitest';
import { staticGlb } from '../src/sharddev/bake/glb';
import { compressGlb } from '../src/sharddev/bake/glbCompression';
import { meshoptNoLarger, nameMeshoptBlob } from '../src/sharddev/blobs';

/** a GLB of `count` triangles on a grid, offset by `shift` so each call is distinct bytes */
function glb(count: number, shift: number): Uint8Array {
  const positions = new Float32Array(count * 9), normals = new Float32Array(count * 9);
  for (let i = 0; i < positions.length; i++) { positions[i] = Math.floor(i / 9) * .25 + (i % 3) * .5 + shift; normals[i] = i % 3 === 1 ? 1 : 0; }
  const geometry = new BufferGeometry(), material = new MeshStandardMaterial();
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  try { return staticGlb([{ geometry, material }]); } finally { geometry.dispose(); material.dispose(); }
}
/** nameMeshoptBlob's selection before CI6 */
function inline(input: Uint8Array): Uint8Array {
  const packed = compressGlb(input);
  return gzipSync(packed, { level: 9 }).length <= gzipSync(input, { level: 9 }).length ? packed : input;
}
const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.compare(a, b) === 0;

test('the choice names what the inline comparison picked, once per pair, whichever way it goes', async () => {
  // real GLBs, and a packed GLB as its own source (identical bytes: packed without a gzip)
  const source = glb(400, 0), packedSource = compressGlb(glb(400, 1));
  for (const input of [source, packedSource]) {
    const noLarger = vi.fn(meshoptNoLarger), want = inline(input);
    expect(same((await nameMeshoptBlob('models/case.glb', input, {}, noLarger)).bytes, want)).toBe(true);
    expect(same((await nameMeshoptBlob('models/again.glb', input, {}, noLarger)).bytes, want)).toBe(true);
    expect(noLarger).toHaveBeenCalledTimes(input === packedSource ? 0 : 1);
  }
  // a comparison that says packed is larger keeps the source; another comparison's answer never leaks into it
  const input = glb(400, 2), packed = compressGlb(input), larger = vi.fn(() => Promise.resolve(false)), smaller = vi.fn(() => Promise.resolve(true));
  expect(same((await nameMeshoptBlob('models/kept.glb', input, {}, larger)).bytes, input)).toBe(true);
  expect(same((await nameMeshoptBlob('models/packed.glb', input, {}, smaller)).bytes, packed)).toBe(true);
  expect(same((await nameMeshoptBlob('models/kept-again.glb', input, {}, larger)).bytes, input)).toBe(true);
  expect([larger.mock.calls.length, smaller.mock.calls.length]).toEqual([1, 1]);
});

test('the gen-cache memo answers the comparison cold, warm and after damage', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/meshopt-choice-'));
  process.env['WILDSHARD_MESHOPT_CHOICE_CACHE'] = root;
  try {
    const { meshoptNoLargerMemo } = await import('../src/sharddev/bake/meshoptChoiceMemo');
    const pairs = [glb(300, 3), glb(300, 4)].map(input => [compressGlb(input), input] as const);
    for (const [packed, input] of pairs) {
      const want = await meshoptNoLarger(packed, input);
      expect(await meshoptNoLargerMemo(packed, input)).toBe(want);
      expect(await meshoptNoLargerMemo(packed, input)).toBe(want);
    }
    const files = readdirSync(root); expect(files).toHaveLength(2);
    for (const file of files) writeFileSync(resolve(root, file), 'damaged');
    for (const [packed, input] of pairs) expect(await meshoptNoLargerMemo(packed, input)).toBe(await meshoptNoLarger(packed, input));
    // a stored answer is used as stored: flip one and the memo returns it (it is the memo answering, not a recompute)
    const [packed, input] = pairs[0] ?? [];
    if (packed === undefined || input === undefined) throw new Error('Missing pair');
    const truth = await meshoptNoLarger(packed, input);
    for (const name of readdirSync(root)) {
      const saved: unknown = JSON.parse(readFileSync(resolve(root, name), 'utf8'));
      if (typeof saved === 'object' && saved !== null && 'key' in saved) writeFileSync(resolve(root, name), JSON.stringify({ key: saved.key, packed: !truth }));
    }
    expect(await meshoptNoLargerMemo(packed, input)).toBe(!truth);
  } finally { delete process.env['WILDSHARD_MESHOPT_CHOICE_CACHE']; rmSync(root, { recursive: true, force: true }); }
});
