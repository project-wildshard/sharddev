import { expect, test } from 'vitest';
import { BufferAttribute, BufferGeometry, Float16BufferAttribute, Float32BufferAttribute, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phoneSlabGeometry, withinBound } from './slabPhone';

/** A dense, gently waved sheet (n x n quads over `size` metres, `wave` metres high) with the slab channels, plus one
 *  tiny separate triangle (an island of `island` metres) at its corner. */
function sheet(n: number, size: number, wave: number, island = 0.004): BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colours: number[] = [], faces: number[] = [], offs: number[] = [], index: number[] = [];
  for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const u = x / n * size, w = z / n * size;
    positions.push(u, wave * Math.sin(u / size * Math.PI) * Math.sin(w / size * Math.PI), w);
    normals.push(0, 127, 0); colours.push(200, 180, 160); faces.push(0x3c00); offs.push(0.5);
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const a = z * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const base = positions.length / 3;
  positions.push(-1, 0, -1, -1 + island, 0, -1, -1, 0, -1 + island);
  for (let i = 0; i < 3; i++) { normals.push(0, 127, 0); colours.push(1, 2, 3); faces.push(0x3800); offs.push(1); }
  index.push(base, base + 2, base + 1);
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('normal', new BufferAttribute(new Int8Array(normals), 3, true))
    .setAttribute('color', new BufferAttribute(new Uint8Array(colours), 3, true))
    .setAttribute('aFace', new Float16BufferAttribute(new Uint16Array(faces), 1))
    .setAttribute('aOff', new BufferAttribute(new Float32Array(offs), 1)).setIndex(index);
}

const scratch = { ab: new Vector3(), ac: new Vector3(), ap: new Vector3(), bp: new Vector3(), cp: new Vector3(), q: new Vector3() };
/** Euclidean distance from `p` to the triangle `a b c` (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTriangle(p: Vector3, a: Vector3, b: Vector3, c: Vector3): number {
  const { ab, ac, ap, bp, cp, q } = scratch;
  ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(p, a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap); if (d1 <= 0 && d2 <= 0) return p.distanceTo(a);
  bp.subVectors(p, b); const d3 = ab.dot(bp), d4 = ac.dot(bp); if (d3 >= 0 && d4 <= d3) return p.distanceTo(b);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return p.distanceTo(q.copy(a).addScaledVector(ab, d1 / (d1 - d3)));
  cp.subVectors(p, c); const d5 = ab.dot(cp), d6 = ac.dot(cp); if (d6 >= 0 && d5 <= d6) return p.distanceTo(c);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return p.distanceTo(q.copy(a).addScaledVector(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return p.distanceTo(q.copy(b).addScaledVector(c.clone().sub(b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return p.distanceTo(q.copy(a).addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom));
}
/** The largest distance from any source vertex to the phone surface, islands under `prune` metres across left out. */
function hausdorff(source: BufferGeometry, phone: BufferGeometry): number {
  const position = phone.getAttribute('position'), index = phone.getIndex(); if (index === null) throw new Error('indexed');
  const corners: Vector3[][] = [];
  for (let at = 0; at < index.count; at += 3) corners.push([0, 1, 2].map(k => new Vector3().fromBufferAttribute(position, index.getX(at + k))));
  const from = source.getAttribute('position'), p = new Vector3();
  let worst = 0;
  for (let vertex = 0; vertex < from.count - 3; vertex++) {
    p.fromBufferAttribute(from, vertex);
    let best = Infinity;
    for (const [a, b, c] of corners) { if (a === undefined || b === undefined || c === undefined) continue; best = Math.min(best, pointTriangle(p, a, b, c)); }
    worst = Math.max(worst, best);
  }
  return worst;
}

test.each([0.01, 0.05])('the phone copy stays within %s m of every source vertex, holds fewer triangles and prunes the tiny island', async bound => {
  const source = sheet(24, 6, 0.3), phone = await phoneSlabGeometry(source, { error: bound });
  try {
    expect(phone.sourceTriangles).toBe(24 * 24 * 2 + 1);
    expect(phone.triangles).toBeLessThan(phone.sourceTriangles * 0.6);
    expect(phone.error).toBeGreaterThan(0); expect(phone.error).toBeLessThanOrEqual(bound);
    // the measured bound, independent of the simplifier's own estimate
    expect(hausdorff(source, phone.geometry)).toBeLessThanOrEqual(bound);
    // the 4 mm island is gone: no phone vertex keeps its colour
    const colour = phone.geometry.getAttribute('color');
    expect(Array.from({ length: colour.count }, (_, v) => colour.getX(v)).some(value => Math.abs(value - 1 / 255) < 1e-6)).toBe(false);
  } finally { source.dispose(); phone.geometry.dispose(); }
});

test('every phone vertex is a source vertex with every channel stored as it was', async () => {
  const source = sheet(16, 4, 0.2), phone = await phoneSlabGeometry(source, { error: 0.05 });
  try {
    const keyOf = (geometry: BufferGeometry, vertex: number): string => Object.keys(geometry.attributes).sort().map(name => {
      const attribute = geometry.getAttribute(name); if (!(attribute instanceof BufferAttribute)) throw new Error('plain');
      const width = attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
      return `${name}:${attribute.array.constructor.name}:${Array.from(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset + vertex * width, width)).join(',')}`;
    }).join('|');
    const known = new Set(Array.from({ length: source.getAttribute('position').count }, (_, v) => keyOf(source, v)));
    for (let vertex = 0; vertex < phone.geometry.getAttribute('position').count; vertex++) expect(known.has(keyOf(phone.geometry, vertex))).toBe(true);
    expect(phone.geometry.getAttribute('aFace')).toBeInstanceOf(Float16BufferAttribute);
  } finally { source.dispose(); phone.geometry.dispose(); }
});

test('a pattern seam is protected: no collapse carries one face word across onto the other', async () => {
  // two flat sheets meet on a duplicated seam column at x = 2: the left's face word 0x3c00, the right's 0x4000
  const left = sheet(8, 2, 0), right = sheet(8, 2, 0), faces = right.getAttribute('aFace'), shift = right.getAttribute('position');
  for (let v = 0; v < shift.count; v++) { shift.setX(v, shift.getX(v) + 2); faces.setX(v, 0x4000); }
  const source = mergeGeometries([left, right]); left.dispose(); right.dispose();
  if (source === null) throw new Error('merge');
  const phone = await phoneSlabGeometry(source, { error: 0.05 });
  try {
    const out = phone.geometry, index = out.getIndex(), word = out.getAttribute('aFace'), at = out.getAttribute('position'); if (index === null) throw new Error('indexed');
    for (let i = 0; i < index.count; i += 3) {
      const corners = [0, 1, 2].map(k => index.getX(i + k));
      const centre = corners.reduce((sum, v) => sum + at.getX(v), 0) / 3;
      const words = new Set(corners.map(v => (word.array as Uint16Array)[v]));
      // a triangle wholly on one side keeps that side's word
      if (centre < 1.9) expect(words.has(0x4000)).toBe(false);
      if (centre > 2.1) expect(words.has(0x3c00)).toBe(false);
    }
  } finally { source.dispose(); phone.geometry.dispose(); }
});

test('the phone error is bounded in world metres through the key frame scale', async () => {
  await expect(phoneSlabGeometry(sheet(2, 1, 0), { error: 0 })).rejects.toThrow('outside');
  await expect(phoneSlabGeometry(sheet(2, 1, 0), { error: 2 })).rejects.toThrow('outside');
  const source = sheet(24, 6, 0.3), scaled = await phoneSlabGeometry(source, { error: 0.05 }, 2);
  try { expect(scaled.error).toBeLessThanOrEqual(0.05); } finally { source.dispose(); scaled.geometry.dispose(); }
});

test('the bound check refuses a copy that moved a vertex past the error and admits a pruned island within twice it', () => {
  // a 1 m square of two triangles, a vertex at its centre lifted 0.1 m (a fan of four), and a separate 4 cm island
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0.5, 0.1, 0.5, 5, 0, 5, 5.04, 0, 5, 5, 0, 5.04]);
  const indices = new Uint32Array([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 5, 7, 6]);
  const flat = new Uint32Array([0, 2, 1, 0, 3, 2]);
  expect(withinBound(positions, indices, flat, 0.05)).toBe(false);
  expect(withinBound(positions, indices, flat, 0.11)).toBe(true);
  expect(withinBound(positions, indices, flat, 0.015)).toBe(false);
});
