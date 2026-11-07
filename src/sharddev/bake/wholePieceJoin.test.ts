import { afterEach, expect, test } from 'vitest';
import { BufferAttribute, BufferGeometry, Float16BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assembleWholeGeometryViews, type WholeGeometryPiece } from '@wildshard/engine/game/plugin/geometry';
import { wholeGeometryPieces } from '@wildshard/engine/game/shardfile/wholeGeometryPieces';
import { joinWholePieces, joinWholePieceSteps } from './wholePieceJoin';

const geometries: BufferGeometry[] = [], materials: MeshBasicMaterial[] = [];
afterEach(() => { for (const geometry of geometries.splice(0)) geometry.dispose(); for (const material of materials.splice(0)) material.dispose(); });
function tile(triangle: number, grid = false): Mesh {
  const geometry = new BufferGeometry(); geometries.push(geometry);
  const positions = [-0, 0, 0, 1, 0, 0, 0, 0, 1];
  geometry.setAttribute('position', new BufferAttribute(grid ? Int16Array.from(positions) : Float32Array.from(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(Int16Array.of(0, 32767, 0, -0, 0, 32767, 0, 0, 32767), 3, true));
  geometry.setAttribute('uv', new Float16BufferAttribute(Uint16Array.of(0x8000, 0x3c00, 0x7e01, 0, 0x3c00, 0x8000), 2));
  geometry.setIndex(new BufferAttribute(Uint16Array.of(0, 1, 2), 1));
  const material = new MeshBasicMaterial(); materials.push(material);
  const mesh = new Mesh(geometry, material);
  mesh.userData['nativeAttributes'] = {
    position: { semantic: 'POSITION', storage: grid ? 'Int16Array' : 'Float32Array', normalized: false, itemSize: 3 },
    normal: { semantic: 'NORMAL', storage: 'Int16Array', normalized: true, itemSize: 3 },
    uv: { semantic: 'TEXCOORD_0', storage: 'Float16Array', normalized: false, itemSize: 2 },
  };
  mesh.userData['wholePartition'] = { id: 'fabric', vertices: { runs: [triangle * 3, 3] }, triangles: { runs: [triangle, 1] }, vertexCount: 6, indexCount: 6, index: 'u16',
    ...(grid ? { grid: { origin: [1 / 3, -2, 0], step: 1 / 4096 } } : {}) };
  mesh.userData['matrix64'] = new Matrix4().makeTranslation(1 / 7, 2, 3).elements;
  return mesh;
}
function own(pieces: readonly WholeGeometryPiece[]): void { for (const piece of pieces) geometries.push(piece.geometry); }

test.each([false, true])('partial pieces keep exact original channels and transforms (grid=%s)', grid => {
  const a = tile(0, grid), b = tile(1, grid), raw = a.geometry.getAttribute('position').array.slice();
  expect(() => assembleWholeGeometryViews([a])).toThrow('incomplete');
  const first = wholeGeometryPieces([a]); own(first);
  expect(first).toHaveLength(1); expect(first[0]?.geometry.getAttribute('position').count).toBe(3);
  const second = wholeGeometryPieces([b]); own(second);
  const full = assembleWholeGeometryViews([a, b]).get('fabric');
  if (full === undefined) throw new Error('Missing original model'); geometries.push(full.geometry);
  const alias = new Matrix4().makeTranslation(-1, 0, 5), oracle = full.geometry.clone().applyMatrix4(full.matrix).applyMatrix4(alias); geometries.push(oracle);
  const joined = joinWholePieces([...first, ...second], alias.elements); geometries.push(joined);
  for (const [name, attribute] of Object.entries(oracle.attributes)) {
    const actual = joined.getAttribute(name);
    expect(actual.array).toEqual(attribute.array); expect(actual.array.constructor).toBe(attribute.array.constructor);
    expect(actual.normalized).toBe(attribute.normalized); expect(actual.itemSize).toBe(attribute.itemSize);
  }
  expect(joined.index?.array).toEqual(oracle.index?.array); expect(joined.groups).toEqual([]);
  expect(a.geometry.getAttribute('position').array).toEqual(raw);
});

test('a duplicate triangle or conflicting shared vertex refuses before joining', () => {
  const pieces = wholeGeometryPieces([tile(0), tile(1)]); own(pieces);
  const first = pieces[0], second = pieces[1]; if (first === undefined || second === undefined) throw new Error('Missing original pieces');
  expect(() => joinWholePieces([first, first])).toThrow('duplicate');
  second.geometry.getAttribute('position').setX(0, 99);
  expect(() => joinWholePieces([first, { ...second, vertices: [0, 4, 5] }])).toThrow('shared vertex differs');
  expect(first.geometry.getAttribute('position').getX(0)).toBe(-0);
});

test('bad triangle indices and unavailable source ordinals keep strict refusals', () => {
  const mesh = tile(0); mesh.geometry.index?.setX(0, 3);
  expect(() => wholeGeometryPieces([mesh])).toThrow('missing triangle vertex');
  mesh.geometry.index?.setX(0, 0);
  mesh.userData['wholePartition'] = { id: 'fabric', vertices: { runs: [6, 3] }, triangles: { runs: [0, 1] }, vertexCount: 6, indexCount: 6, index: 'u16' };
  expect(() => wholeGeometryPieces([mesh])).toThrow('vertex ordinal outside source');
});


test('a first identity source preserves raw signed zero while repeated aliases keep their original transform branch', () => {
  const pieces = wholeGeometryPieces([tile(0)]); own(pieces);
  const piece = pieces[0]; if (piece === undefined) throw new Error('Missing original piece');
  const identity = { ...piece, matrix: new Matrix4() };
  const fresh = joinWholePieces([identity]), repeat = joinWholePieces([identity], undefined, true), oracle = piece.geometry.clone().applyMatrix4(identity.matrix);
  geometries.push(fresh, repeat, oracle);
  expect(Object.is(fresh.getAttribute('position').getX(0), -0)).toBe(true);
  expect(repeat.getAttribute('position').array).toEqual(oracle.getAttribute('position').array);
  expect(repeat.getAttribute('normal').array).toEqual(oracle.getAttribute('normal').array);
});

test('partial pieces reuse only their own invocation channel admission', () => {
  const mesh = tile(0), original: unknown = mesh.userData['nativeAttributes']; let reads = 0;
  Object.defineProperty(mesh.userData, 'nativeAttributes', { get() { reads++; return original; } });
  const pieces = wholeGeometryPieces([mesh]); own(pieces);
  expect(reads).toBe(1); expect(pieces).toHaveLength(1);
  const normal = mesh.geometry.getAttribute('normal');
  mesh.geometry.deleteAttribute('normal');
  expect(() => wholeGeometryPieces([mesh])).toThrow('missing typed channel');
  expect(reads).toBe(2); mesh.geometry.setAttribute('normal', normal);
});

test('sliced join retains exact transform rounding, half words and native merger output', () => {
  const pieces = wholeGeometryPieces([tile(0), tile(1)]); own(pieces);
  const matrix = new Matrix4().makeRotationX(0.31).scale(new Vector3(-2, 1 / 3, 7 / 5));
  const alias = new Matrix4().makeRotationY(-0.19).setPosition(1 / 7, -3, 9);
  const input: WholeGeometryPiece[] = [];
  for (const piece of pieces) input.push({ ...piece, matrix });
  for (const piece of input) piece.geometry.setAttribute('tangent', new BufferAttribute(Float32Array.of(1, 0, 0, -1, 0, 1, 0, 1, 0, 0, 1, -1), 4));
  const copies = input.map(piece => piece.geometry.clone().applyMatrix4(matrix).applyMatrix4(alias)); geometries.push(...copies);
  const oracle = mergeGeometries(copies, false); if (oracle === null) throw new Error('Original merge refused'); geometries.push(oracle);
  const cursor = joinWholePieceSteps(input, alias.elements); let yields = 0, actual: BufferGeometry | undefined;
  for (;;) { const next = cursor.next(); if (next.done) { actual = next.value; break; } yields++; }
  if (actual === undefined) throw new Error('Join did not complete'); geometries.push(actual);
  expect(yields).toBeGreaterThan(10);
  for (const [name, expected] of Object.entries(oracle.attributes)) {
    const found = actual.getAttribute(name);
    if (!(found instanceof BufferAttribute) || !(expected instanceof BufferAttribute)) throw new Error('Missing native channel');
    expect(new Uint8Array(found.array.buffer, found.array.byteOffset, found.array.byteLength)).toEqual(new Uint8Array(expected.array.buffer, expected.array.byteOffset, expected.array.byteLength));
    expect(found.array.constructor).toBe(expected.array.constructor); expect(found.normalized).toBe(expected.normalized);
    expect(found.itemSize).toBe(expected.itemSize); expect(found.gpuType).toBe(expected.gpuType);
  }
  expect(actual.index?.array).toEqual(oracle.index?.array); expect(actual.groups).toEqual(oracle.groups);
  // NR2: the half words stay a half-float channel (three's merger and the plain wrapper upload them as integers)
  expect(actual.getAttribute('uv')).toBeInstanceOf(Float16BufferAttribute); expect(actual.getAttribute('uv').getX(0)).toBe(-0);
});

test('one large original piece has bounded validation, transform and index progress', () => {
  const count = 3072, geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3)); geometries.push(geometry);
  geometry.setIndex(Array.from({ length: count }, (_, index) => index));
  const piece: WholeGeometryPiece = { geometry, matrix: new Matrix4().makeTranslation(1, 2, 3), part: 'large', layout: 'plain',
    vertices: Array.from({ length: count }, (_, index) => index), triangles: Array.from({ length: count / 3 }, (_, index) => index), vertexCount: count, indexCount: count };
  const cursor = joinWholePieceSteps([piece]); let yields = 0, joined: BufferGeometry | undefined;
  for (;;) { const next = cursor.next(); if (next.done) { joined = next.value; break; } yields++; }
  if (joined === undefined) throw new Error('Join did not complete'); geometries.push(joined);
  expect(yields).toBeGreaterThan(30); expect(joined.getAttribute('position').count).toBe(count);
  expect(Array.from(joined.getAttribute('position').array.slice(0, 3))).toEqual([1, 2, 3]);
  expect(geometry.getAttribute('position').getX(0)).toBe(0);
});

test.each([65534, 65535])('sliced index merger keeps the original restart boundary at %s', vertex => {
  const count = 65536, geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3)); geometries.push(geometry);
  geometry.setIndex([vertex, 0, 1]);
  const piece: WholeGeometryPiece = { geometry, matrix: new Matrix4(), part: 'boundary', layout: 'plain',
    vertices: Array.from({ length: count }, (_, index) => index), triangles: [0], vertexCount: count, indexCount: 3 };
  const actual = joinWholePieces([piece]), oracle = mergeGeometries([geometry], false);
  if (oracle === null) throw new Error('Original merge refused'); geometries.push(actual, oracle);
  expect(actual.index?.array.constructor).toBe(oracle.index?.array.constructor); expect(actual.index?.array).toEqual(oracle.index?.array);
});
