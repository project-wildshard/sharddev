import { expect, test } from 'vitest';
import { treadBoxes } from '@wildshard/engine/physics/pieces';
import { placeCollider, poseOf, readColliderRows } from '@wildshard/engine/models/colliders';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { ColliderDesc } from './placement';
import { admitContactRows, placeContactRows, treadBoxRows } from './contactRows';

test('authored stair contacts preserve every native word, ordering and surface', () => {
  for (const count of [0, 1, 3, 8, 2.5]) for (const surface of [undefined, 'stone', 'wood'] as const) {
    for (const end of [{ x: -12.5, y: 7, z: 45 }, { x: 0, y: -9, z: -0 }, { x: 40, y: -3, z: -8 }]) {
      const input: Extract<ColliderDesc, { kind: 'treads' }> = { kind: 'treads', from: { x: -0, y: -3, z: 0 },
        to: end, width: 1.75, count, ...(surface === undefined ? {} : { surface }) };
      const before = structuredClone(input), actual = treadBoxRows(input);
      expect(actual).toEqual(treadBoxes(input));
      expect(input).toEqual(before);
      expect(actual).not.toBe(treadBoxes(input));
    }
  }
});

test('authored contact admission retains native owned lanes and complete refusals', () => {
  const rows = [{ kind: 'hull', x: 1, y: -0, z: 3, points: [0, 0, 0, 1, 2, 3], surface: 'wood' }];
  const policy = { kinds: ['hull'], surfaces: ['wood'], requireSurface: true } as const;
  const actual = admitContactRows(rows, policy);
  expect(actual).toEqual(readColliderRows(rows, policy));
  const row = actual[0];
  if (row?.kind !== 'hull') throw new Error('Missing admitted authored hull');
  rows[0]?.points.fill(99);
  expect([...row.points]).toEqual([0, 0, 0, 1, 2, 3]);
  for (const invalid of [[{ ...rows[0], points: [Number.NaN] }], [{ ...rows[0], unexpected: true }],
    [{ kind: 'box', x: 0, y: 0, z: 0, hx: 1, hy: 1, hz: 1 }]]) {
    expect(() => admitContactRows(invalid, policy)).toThrow();
    expect(() => readColliderRows(invalid, policy)).toThrow();
  }
});

test('authored batches retain every native shape, transform word, order and input lane', () => {
  const rows: ColliderDesc[] = [
    { kind: 'box', x: 1, y: 2, z: 3, hx: 2, hy: 3, hz: 4, yaw: 0.2, surface: 'wood' },
    { kind: 'capsule', x: -1, y: 0, z: 1, halfHeight: 2, radius: 0.5 },
    { kind: 'ball', x: 2, y: 3, z: 4, radius: 1, rot: { x: 0, y: 0, z: 0, w: 1 } },
    { kind: 'hull', x: -0, y: 0, z: 0, points: Float32Array.of(0, 0, 0, 1, 2, 3) },
    { kind: 'trimesh', x: 0, y: 0, z: 0, vertices: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), indices: Uint32Array.of(0, 1, 2) },
    { kind: 'treads', from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 2, z: 3 }, width: 2, count: 3, surface: 'stone' },
  ];
  const placements = [{ x: 2, y: -3, z: 4 }, { x: -1, y: 2, z: 3, scale: 2, yaw: 0.4, leanX: 0.2, leanZ: -0.1 },
    { x: 8, y: 9, z: 10, matrix: new Matrix4().compose(new Vector3(8, 9, 10), new Quaternion().setFromEuler(new Euler(0.1, 0.2, 0.3)), new Vector3(0.5, 0.5, 0.5)) }];
  for (const placement of placements) {
    const before = structuredClone(rows), nativePose = poseOf(placement);
    expect(placeContactRows(rows, placement)).toEqual(rows.map(row => placeCollider(row, nativePose)));
    expect(rows).toEqual(before);
  }
});
