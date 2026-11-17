import { Box3, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Vector3 } from 'three';
import { expect, test, vi } from 'vitest';
import { parseGlbData } from '@wildshard/format/glbCost';
import { staticGlb } from './glb';
import { compressGlb } from './glbCompression';
import { compactTileGeometry, modelGrid, tileGrid, tileGridTransform } from './worldGeometry';

// RM8.1a: a clipped tile's triangle soup welds into indexed, quantized channels without moving a position
test('compacted tile geometry keeps every triangle, exact positions and close normals and colours', () => {
  const soup = new BufferGeometry();
  // two triangles of one quad (shared corners repeated, as worldGeometry clips them) and one apart
  const p = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 5.125, 2.5, -3.75, 6, 2.5, -3.75, 5.5, 3.25, -3.75];
  const n = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0.6, 0, 0.8, 0.6, 0, 0.8, 0.6, 0, 0.8];
  const c = Array.from({ length: 27 }, (_, i) => (i % 3) / 3 + 0.123456);
  soup.setAttribute('position', new Float32BufferAttribute(p, 3));
  soup.setAttribute('normal', new Float32BufferAttribute(n, 3));
  soup.setAttribute('color', new Float32BufferAttribute(c, 3));
  const compact = compactTileGeometry(soup), index = compact.getIndex();
  expect(index?.array).toBeInstanceOf(Uint16Array);
  expect(index?.count).toBe(9);
  expect(compact.getAttribute('position').count).toBe(7); // the quad's two shared corners welded
  expect(compact.getAttribute('normal').array).toBeInstanceOf(Int8Array);
  expect(compact.getAttribute('normal').normalized).toBe(true);
  expect(compact.getAttribute('color').array).toBeInstanceOf(Uint16Array);
  for (let corner = 0; corner < 9; corner++) {
    const at = index?.getX(corner) ?? -1;
    for (let k = 0; k < 3; k++) {
      expect(compact.getAttribute('position').getComponent(at, k)).toBe(soup.getAttribute('position').getComponent(corner, k));
      expect(Math.abs(compact.getAttribute('normal').getComponent(at, k) - soup.getAttribute('normal').getComponent(corner, k))).toBeLessThanOrEqual(0.5 / 127);
      expect(Math.abs(compact.getAttribute('color').getComponent(at, k) - soup.getAttribute('color').getComponent(corner, k))).toBeLessThanOrEqual(0.5 / 65535);
    }
  }
});

// RM8.1: on a tile grid, positions are Int16 steps (within half a step), every triangle survives the cache reorder, and
// the meshopt-packed GLB's node dequantizes them back to the world
test('a gridded tile keeps every triangle within half a grid step through its packed GLB', () => {
  const soup = new BufferGeometry(), p: number[] = [], n: number[] = [], c: number[] = [];
  for (let i = 0; i < 40; i++) {
    const x = -187.5 + (i % 8) * 7.8125, z = -125 + Math.floor(i / 8) * 12.4, y = 0.37 * i;
    p.push(x, y, z, x + 3.3, y, z, x, y + 2.1, z + 1.7);
    for (let k = 0; k < 3; k++) { n.push(0, 1, 0); c.push(0.2 + i / 100, 0.5, 0.75); }
  }
  soup.setAttribute('position', new Float32BufferAttribute(p, 3)); soup.setAttribute('normal', new Float32BufferAttribute(n, 3)); soup.setAttribute('color', new Float32BufferAttribute(c, 3));
  const grid = tileGrid(new Box3().setFromBufferAttribute(soup.getAttribute('position') as Float32BufferAttribute));
  expect(grid.step).toBe(1 / 512);
  for (const o of grid.origin) expect(Number.isInteger(o / grid.step)).toBe(true);
  const compact = compactTileGeometry(soup, grid), index = compact.getIndex();
  expect(compact.getAttribute('position').array).toBeInstanceOf(Int16Array);
  expect(compact.getAttribute('color').array).toBeInstanceOf(Uint8Array);
  const world = (at: number) => new Vector3().fromBufferAttribute(compact.getAttribute('position'), at).multiplyScalar(grid.step).add(new Vector3(...grid.origin));
  const corners = (t: number) => [0, 1, 2].map(k => new Vector3().fromBufferAttribute(soup.getAttribute('position'), t * 3 + k));
  const matched = new Set<number>();
  for (let t = 0; t < (index?.count ?? 0) / 3; t++) {
    const points = [0, 1, 2].map(k => world(index?.getX(t * 3 + k) ?? 0));
    const source = Array.from({ length: 40 }, (_, s) => s).find(s => points.every(q => corners(s).some(o => Math.max(...q.clone().sub(o).toArray().map(Math.abs)) <= grid.step / 2 + 1e-9)));
    if (source !== undefined) matched.add(source);
  }
  expect(index?.count).toBe(120);
  expect(matched.size).toBe(40);
  const material = new MeshStandardMaterial({ vertexColors: true });
  const glb = compressGlb(staticGlb([{ geometry: compact, material, quantizedChannels: true, compactIndex: true, meshoptReady: true, transform: tileGridTransform(grid) }]));
  material.dispose();
  const seen: number[] = [];
  const cost = parseGlbData(glb, triangle => { for (const q of triangle) seen.push(q.x, q.y, q.z); });
  expect(cost.triangles).toBe(40);
  const original = new Set(Array.from({ length: p.length / 3 }, (_, v) => v));
  for (let at = 0; at < seen.length; at += 3) {
    const match = [...original].some(v => [0, 1, 2].every(axis => Math.abs((seen[at + axis] ?? Number.NaN) - (p[v * 3 + axis] ?? Number.NaN)) <= grid.step / 2 + 1e-9));
    expect(match).toBe(true);
  }
});

test('a model-space primitive gets a grid pinned at its model origin (RM8.1e)', () => {
  const near = modelGrid(new Box3(new Vector3(-20, 0, -18), new Vector3(20, 30, 18)));
  expect(near).toEqual({ origin: [0, 0, 0], step: 1 / 512 });
  expect(modelGrid(new Box3(new Vector3(-100, 0, 0), new Vector3(10, 10, 10))).step).toBe(1 / 256);
  expect(() => modelGrid(new Box3(new Vector3(0, 0, 0), new Vector3(40000, 1, 1)))).toThrow('too far from its model origin');
});


test.each([false, true])('channel copies preserve short input values and signed zero with grid=%s', gridded => {
  const source = new BufferGeometry();
  source.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  source.setAttribute('uv', new Float32BufferAttribute([-0, 0.5], 2));
  source.setAttribute('tangent', new Float32BufferAttribute([-0, 0.1, 0.2, 1, 1, 0.3, 0.4, -1, 0, 0.5, 0.6, 1], 4));
  source.setAttribute('weight', new Float32BufferAttribute([0.2, 0.3, 0.4], 1));
  source.setIndex([0, 1, 2, 0, 1, 2]);
  const compact = compactTileGeometry(source, gridded ? { origin: [0, 0, 0], step: 1 } : undefined);
  try {
    const position = compact.getAttribute('position'), uv = compact.getAttribute('uv');
    expect(compact.getIndex()?.count).toBe(source.getIndex()?.count);
    expect(uv.count).toBe(position.count);
    for (let vertex = 0; vertex < position.count; vertex++) {
      const original = position.getX(vertex) === 1 ? 1 : position.getZ(vertex) === 1 ? 2 : 0;
      expect(compact.getAttribute('weight').getX(vertex)).toBe(source.getAttribute('weight').getX(original));
      for (let component = 0; component < 4; component++)
        expect(Object.is(compact.getAttribute('tangent').getComponent(vertex, component), source.getAttribute('tangent').getComponent(original, component))).toBe(true);
      if (position.getX(vertex) === 0 && position.getZ(vertex) === 0) {
        expect(Object.is(uv.getX(vertex), -0)).toBe(true); expect(uv.getY(vertex)).toBe(0.5);
      } else if (gridded) {
        expect(uv.getX(vertex)).toBe(0); expect(uv.getY(vertex)).toBe(0);
      } else {
        expect(Number.isNaN(uv.getX(vertex))).toBe(true); expect(Number.isNaN(uv.getY(vertex))).toBe(true);
      }
    }
    expect(source.getAttribute('uv').count).toBe(1);
    expect(Object.is(source.getAttribute('uv').getX(0), -0)).toBe(true);
  } finally { compact.dispose(); source.dispose(); }
});


test.each([false, true])('weld buckets keep string identity and first-use ordering with forced collision=%s', collide => {
  const source = new BufferGeometry(), positions: number[] = [], uv: number[] = [];
  for (let vertex = 0; vertex < 48; vertex++) {
    positions.push(vertex % 24, 0, 0); uv.push(Number.NaN, vertex < 24 ? -0 : 0);
  }
  source.setAttribute('position', new Float32BufferAttribute(positions, 3));
  source.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const expected = new Map<string, number>(), order: number[] = [], first: number[][] = [];
  for (let vertex = 0; vertex < 48; vertex++) {
    const values = [source.getAttribute('position').getX(vertex), 0, 0, source.getAttribute('uv').getX(vertex), source.getAttribute('uv').getY(vertex)];
    const key = values.join(','); let at = expected.get(key);
    if (at === undefined) { at = first.length; first.push(values); expected.set(key, at); }
    order.push(at);
  }
  const compact = (() => {
    const hash = collide ? vi.spyOn(Math, 'imul').mockReturnValue(0) : undefined;
    try { return compactTileGeometry(source); } finally { hash?.mockRestore(); }
  })();
  try {
    const index = compact.getIndex(); if (index === null) throw new Error('Missing welded index');
    expect(Array.from(index.array)).toEqual(order);
    expect(compact.getAttribute('position').count).toBe(first.length);
    for (const [vertex, values] of first.entries()) {
      const actual = [compact.getAttribute('position').getX(vertex), compact.getAttribute('position').getY(vertex), compact.getAttribute('position').getZ(vertex), compact.getAttribute('uv').getX(vertex), compact.getAttribute('uv').getY(vertex)];
      expect(actual.every((value, component) => Object.is(value, values[component]))).toBe(true);
    }
  } finally { compact.dispose(); source.dispose(); }
});
