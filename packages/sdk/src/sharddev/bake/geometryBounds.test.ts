import { expect, test } from 'vitest';
import { Box3, BufferGeometry, Float32BufferAttribute, Float16BufferAttribute, Int16BufferAttribute,
  InterleavedBuffer, InterleavedBufferAttribute, Sphere, Vector3 } from 'three';
import { geometryBoundsSteps } from '@wildshard/engine/world/geometryBounds';
import { bakeGeometryBoundsSteps } from './geometryBounds';

const packed = (count: number): BufferGeometry => new BufferGeometry().setAttribute('position',
  new Float32BufferAttribute(Array.from({ length: count * 3 }, (_, i) => Math.sin(i / 17) * (i % 53)), 3));
const interleaved = (): BufferGeometry => {
  const values = Float32Array.from([1, 2, 3, 999, -4, -5, -6, -999, 7, 8, 9, 1]);
  return new BufferGeometry().setAttribute('position', new InterleavedBufferAttribute(new InterleavedBuffer(values, 4), 3, 0));
};
const morph = (): BufferGeometry => {
  const geometry = packed(3); geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new Float32BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, -3], 3)];
  return geometry;
};
const factories = [
  ['packed partial', () => packed(17)], ['packed full chunks', () => packed(65537)],
  ['interleaved padding', interleaved],
  ['normalized Int16', () => new BufferGeometry().setAttribute('position', new Int16BufferAttribute([-32768, 1, 32767, 12, -34, 56], 3, true))],
  ['numeric Float16', () => new BufferGeometry().setAttribute('position', new Float16BufferAttribute([-0, 1 / 3, 12, -15, 0.002, 99], 3))],
  ['relative morph fallback', morph], ['empty attribute', () => packed(0)], ['missing attribute fallback', () => new BufferGeometry()],
] as const;

test.each(factories)('%s keeps every native bound, turn and publication identity', (_name, make) => {
  for (const mode of ['box', 'sphere', 'both'] as const) {
    const actual = make(), native = actual.clone(), direct = actual.clone();
    const box = new Box3(new Vector3(-9, -8, -7), new Vector3(-6, -5, -4));
    const sphere = new Sphere(new Vector3(-1, -2, -3), 45);
    actual.boundingBox = box; actual.boundingSphere = sphere;
    native.boundingBox = box.clone(); native.boundingSphere = sphere.clone();
    direct.boundingBox = box.clone(); direct.boundingSphere = sphere.clone();
    const a = bakeGeometryBoundsSteps(actual, mode), b = geometryBoundsSteps(native, mode);
    try {
      for (;;) {
        const before = b.next(), after = a.next();
        expect(after.done).toBe(before.done); expect(after.value).toBe(before.value);
        if (after.done) break;
        expect(actual.boundingBox).toBe(box); expect(actual.boundingSphere).toBe(sphere);
        expect(box).toEqual(new Box3(new Vector3(-9, -8, -7), new Vector3(-6, -5, -4)));
        expect(sphere).toEqual(new Sphere(new Vector3(-1, -2, -3), 45));
      }
      expect(actual.boundingBox).toBe(box); expect(actual.boundingSphere).toBe(sphere);
      expect(actual.boundingBox).toEqual(native.boundingBox); expect(actual.boundingSphere).toEqual(native.boundingSphere);
      if (mode !== 'sphere') { direct.computeBoundingBox(); expect(box).toEqual(direct.boundingBox); }
      if (mode !== 'box') { direct.computeBoundingSphere(); expect(sphere).toEqual(direct.boundingSphere); }
      for (const [name, attribute] of Object.entries(actual.attributes)) expect(attribute.array).toEqual(native.getAttribute(name).array);
    } finally { actual.dispose(); native.dispose(); direct.dispose(); }
  }
});
