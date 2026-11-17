import { expect, test } from 'vitest';
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { floatPositionError, gridPositionError, positionErrorScale } from './geometryError';
import { worldGeometry } from './worldGeometry';
import type { WorldPrimitive } from './world';
import { measuredCoarseGeometry } from './coarseCopy';
import { bakeProps, type PropsBakeSource } from './props';

const grid = { origin: [0, 0, 0] as const, step: 1 / 512 };

test('float storage reports actual vector loss and refuses invalid storage', () => {
  expect(floatPositionError([0, 0.5, 1])).toBe(0);
  expect(floatPositionError([0.1, 0.2, 0.3])).toBe(Math.hypot(0.1 - Math.fround(0.1), 0.2 - Math.fround(0.2), 0.3 - Math.fround(0.3)));
  expect(() => floatPositionError([Infinity, 0, 0])).toThrow('finite');
  expect(() => floatPositionError([0, 1])).toThrow('triples');
});

test('a quantization cell bounds world displacement, including nonuniform scale, without charging translation', () => {
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  try {
    expect(gridPositionError(geometry, grid)).toBe(0);
    geometry.getAttribute('position').setX(0, 0.1);
    const transform = new Matrix4().makeScale(2, 3, 4).setPosition(100, 200, 300);
    const error = gridPositionError(geometry, grid, transform);
    expect(error).toBe(Math.hypot(2, 3, 4) * grid.step / 2);
    const position = geometry.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
      const original = new Vector3().fromBufferAttribute(position, vertex), stored = original.clone().multiplyScalar(512).round().multiplyScalar(1 / 512);
      expect(original.applyMatrix4(transform).distanceTo(stored.applyMatrix4(transform))).toBeLessThanOrEqual(error);
    }
    expect(() => gridPositionError(geometry, { ...grid, step: 0 })).toThrow('grid');
  } finally { geometry.dispose(); }
});

test.each([false, true])('coarse error uses the actual meshopt result in metres, sloppy=%s', sloppy => {
  const source = sloppy ? new BoxGeometry(5, 6, 7, 5, 5, 5).toNonIndexed() : new SphereGeometry(20, 24, 16);
  const result = measuredCoarseGeometry(source, 0.07, 3, { sloppy });
  try {
    const attribute = source.getAttribute('position'), positions = Float32Array.from(attribute.array);
    const indices = source.index === null ? Uint32Array.from({ length: attribute.count }, (_, i) => i) : Uint32Array.from(source.index.array);
    const target = Math.max(3, Math.floor(indices.length / 3 * 0.07) * 3);
    let [kept, error] = MeshoptSimplifier.simplify(indices, positions, 3, target, 3, ['LockBorder', 'ErrorAbsolute']);
    if (sloppy && kept.length > target * 1.5) {
      [kept, error] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1);
      error *= MeshoptSimplifier.getScale(positions, 3);
    }
    expect(Array.from(result.geometry.index?.array ?? [])).toEqual(Array.from(kept));
    expect(result.errorMetres).toBe(kept.length === indices.length ? 0 : error);
    for (const name of Object.keys(source.attributes)) expect(result.geometry.getAttribute(name).array).toEqual(source.getAttribute(name).array);
  } finally { source.dispose(); result.geometry.dispose(); }
});

function propsSource(offset: number, inherited = 0): PropsBakeSource {
  const geometry = new BoxGeometry(2, 2, 2).translate(offset, 20, 0);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  return { static: new Group(), whole: [{ id: 'shape', mesh: new Mesh(geometry, material), transform: new Matrix4().makeScale(1, 2, 1),
    nativeAttributes: true, partition: 'runs', compact: true, geometricError: inherited }] };
}
function release(input: PropsBakeSource): void {
  for (const row of input.whole ?? []) { row.mesh.geometry.dispose(); const material = row.mesh.material; if (!Array.isArray(material)) material.dispose(); }
}

test('props report quantization and source error while preserving every payload and genuinely lossless zero', () => {
  const exact = propsSource(0), rounded = propsSource(0.1), inherited = propsSource(0.1, 2);
  try {
    const a = bakeProps(exact), b = bakeProps(rounded), c = bakeProps(inherited);
    expect(a.tiles.every(row => row.geometricError === 0)).toBe(true);
    const occupied = b.tiles.filter(row => row.files.length > 0);
    expect(occupied.length).toBeGreaterThan(0);
    expect(occupied.every(row => row.geometricError > 0)).toBe(true);
    for (const row of occupied) {
      const next = c.tiles.find(tile => tile.lod === row.lod && tile.x === row.x && tile.z === row.z);
      expect(next?.geometricError).toBe(row.geometricError + 4);
    }
    expect([...c.assets]).toEqual([...b.assets]);
    expect(b.tiles.filter(row => row.files.length === 0).every(row => row.geometricError === 0)).toBe(true);
  } finally { release(exact); release(rounded); release(inherited); }
});


test('authored clipping reports float storage loss without changing its triangles or channels', () => {
  const source: WorldPrimitive = { node: 'error-fixture', objectId: null, material: 0, terrain: false,
    positions: new Float64Array([0.1, 0.2, 0.3, 1.1, 0.2, 0.3, 0.1, 1.2, 0.3]),
    indices: new Uint32Array([0, 1, 2]), normals: null, colours: null, uv: null, tangents: null };
  let error = -1;
  const original = worldGeometry(source), measured = worldGeometry(source, undefined, undefined, metres => { error = metres; });
  try {
    expect(error).toBe(floatPositionError(source.positions));
    expect(error).toBeGreaterThan(0);
    for (const name of Object.keys(original.attributes)) expect(measured.getAttribute(name).array).toEqual(original.getAttribute(name).array);
  } finally { original.dispose(); measured.dispose(); }
});


test('source uncertainty stays bounded under shear as well as scale', () => {
  const transform = new Matrix4().makeShear(1, 0, 0, 0, 0, 0), direction = new Vector3(1, 1, 0).normalize();
  const moved = direction.clone().applyMatrix4(transform), bound = positionErrorScale(transform);
  expect(moved.length()).toBeGreaterThan(transform.getMaxScaleOnAxis());
  expect(moved.length()).toBeLessThanOrEqual(bound);
  expect(positionErrorScale(new Matrix4().setPosition(100, 200, 300))).toBe(1);
  expect(() => positionErrorScale(new Matrix4().makePerspective(-1, 1, 1, -1, 1, 10))).toThrow('affine');
});
