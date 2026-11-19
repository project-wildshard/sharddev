// MEMORY-STRUCTURE STR17: `wildshard check` reads every built GLB's vertex layout, prints the channels ANGLE's Metal back
// end copies (stride not a multiple of 4) and refuses a copied layout the cook did not already write when the rule landed.
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { staticGlb } from '../../../sdk/src/sharddev/bake/glb';
import { EXISTING_COPIED_LAYOUTS, glbGeometry, shardGeometry, vertexLayoutLine, vertexLayoutRefusals } from '../../../sdk/src/sharddev/vertexLayout';
import { refusalNote } from '@wildshard/upload/sharddev/refusals';
import { PHONE_TRIANGLE_BUDGET, triangleBudgetLine, triangleBudgetWarnings } from '../../../sdk/src/sharddev/triangleBudget';

/** A quad (two triangles) with an Int8 normal and a Uint8 colour, both 3 wide: the layout Nine's slabs cook today. */
function quad(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127]), 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]), 3, true));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}
const material = new THREE.MeshStandardMaterial();
const packed = staticGlb([{ geometry: quad(), material, quantizedChannels: true }]);
const aligned = staticGlb([{ geometry: quad(), material, quantizedChannels: true, meshoptReady: true }]);

test('a tightly packed 3-byte normal and colour are copied channels; meshoptReady pads them to 4', () => {
  expect(glbGeometry(packed)).toEqual({ triangles: 2, vertices: 4, copied: new Map([['NORMAL i8x3n stride 3', 4], ['COLOR_0 u8x3n stride 3', 4]]) });
  expect(glbGeometry(aligned)).toEqual({ triangles: 2, vertices: 4, copied: new Map() });
  // a float32 GLB (the old byte path) reads in place too; bytes that are not a GLB are skipped
  expect(glbGeometry(staticGlb([{ geometry: quad().deleteAttribute('normal').deleteAttribute('color'), material }]))?.copied.size).toBe(0);
  expect(glbGeometry(new Uint8Array([1, 2, 3]))).toBeNull();
});

test('the shard sums its GLBs; a geometry that instances share counts once', () => {
  const instanced = staticGlb([{ geometry: quad(), material, quantizedChannels: true, meshoptReady: true,
    instances: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(2, 0, 0)] }]);
  const shard = shardGeometry([packed, aligned, instanced, new Uint8Array(8)]);
  expect(shard).toEqual({ triangles: 6, vertices: 12, glbs: 3, copied: [
    { channel: 'COLOR_0 u8x3n stride 3', vertices: 4, files: 1 }, { channel: 'NORMAL i8x3n stride 3', vertices: 4, files: 1 }] });
  expect(vertexLayoutLine(shard.copied)).toBe('2 channels ANGLE copies: COLOR_0 u8x3n stride 3 (0 k vertices, 1 GLB), NORMAL i8x3n stride 3 (0 k vertices, 1 GLB)');
  expect(vertexLayoutLine(shardGeometry([aligned]).copied)).toBe('every vertex channel 4-byte aligned');
});

/** A 16-bit position, 3 wide and packed (stride 6): a copied layout no pinned cook wrote. */
function shortPositions(): Uint8Array {
  const bytes = staticGlb([{ geometry: quad(), material }]);
  // rewrite the float32 position accessor's declared type in the JSON chunk to Int16 x3 (stride 6): only the layout is read
  const length = new DataView(bytes.buffer).getUint32(12, true), json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { accessors: { componentType: number }[] };
  const position = json.accessors.find(accessor => accessor.componentType === 5126);
  if (position === undefined) throw new Error('fixture has no float32 accessor');
  position.componentType = 5122;
  const text = new TextEncoder().encode(JSON.stringify(json).padEnd(length, ' '));
  if (text.length !== length) throw new Error('fixture JSON grew');
  const out = bytes.slice(); out.set(text, 20); return out;
}

test('a new copied layout refuses by name; the three the cook already wrote report', () => {
  const existing = shardGeometry([packed]).copied;
  expect(existing.every(row => EXISTING_COPIED_LAYOUTS.has(row.channel))).toBe(true);
  expect(vertexLayoutRefusals(existing)).toEqual([]);
  const fresh = shardGeometry([shortPositions()]).copied;
  expect(fresh).toEqual([{ channel: 'POSITION i16x3 stride 6', vertices: 4, files: 1 }]);
  expect(vertexLayoutRefusals(fresh)).toEqual([{ code: 'vertex-layout-copy',
    message: "vertex channel POSITION i16x3 stride 6 (1 GLB) is not 4-byte aligned, so ANGLE's Metal back end holds a second copy of it" }]);
  expect(vertexLayoutRefusals(shardGeometry([aligned]).copied)).toEqual([]);
  expect([...EXISTING_COPIED_LAYOUTS]).toEqual(['COLOR_0 u16x3n stride 6', 'COLOR_0 u8x3n stride 3', 'NORMAL i8x3n stride 3']);
  expect(refusalNote('validate', 'words', { code: 'vertex-layout-copy' }).rule).toBe('vertex-layout');
});

// MEMORY-STRUCTURE STR13: the same reading against the phone-Low triangle budget, a report-only warning (J424).
test('the triangle budget warns over 600 k static triangles and prints the reading under it', () => {
  const under = shardGeometry([packed, aligned]);
  expect(triangleBudgetLine(under)).toBe('0 k static triangles of 600 k (phone Low), 0 k vertices in 2 GLBs');
  expect(triangleBudgetWarnings(under)).toEqual([]);
  expect(triangleBudgetWarnings({ ...under, triangles: PHONE_TRIANGLE_BUDGET })).toEqual([]);
  // a fixture over the budget: two GLBs of 300,001 triangles each (staticGlb takes at most 400 k vertices per geometry)
  const strip = (quads: number): Uint8Array => {
    const geometry = new THREE.BufferGeometry(), positions = new Float32Array((quads + 1) * 2 * 3), index: number[] = [];
    for (let q = 0; q <= quads; q++) positions.set([q, 0, 0, q, 1, 0], q * 6);
    for (let q = 0; q < quads; q++) index.push(2 * q, 2 * q + 2, 2 * q + 1, 2 * q + 1, 2 * q + 2, 2 * q + 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setIndex(index);
    return staticGlb([{ geometry, material }]);
  };
  const half = strip(150_000), odd = staticGlb([{ geometry: quad().deleteAttribute('normal').deleteAttribute('color'), material }]);
  const over = shardGeometry([half, half.slice(), odd]);
  expect(over.triangles).toBe(600_002);
  expect(triangleBudgetWarnings(shardGeometry([half, half.slice()]))).toEqual([]);
  expect(triangleBudgetWarnings(over)).toEqual([{ code: 'triangle-budget',
    message: 'the shard holds 600 k static triangles, over the phone-Low budget of 600 k (a report-only line: upload still takes it)' }]);
  expect(refusalNote('validate', 'words', { code: 'triangle-budget' }).rule).toBe('triangle-budget');
});
