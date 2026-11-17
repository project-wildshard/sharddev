import { expect, expectTypeOf, test } from 'vitest';
import type { Placement } from '@wildshard/engine/models/model';
import { boxDesc as nativeBox } from '@wildshard/engine/world/registry';
import { yawWorld as nativeWorld } from '@wildshard/engine/world/yawFrame';
import { modelPoseMatrix } from '@wildshard/engine/models/modelPose';
import { bakeModelPose, boxDesc, yawWorld, type AuthorModelPose, type BoxSpec, type ContactSurface, type AuthorPlacement } from './placement';

test('owned model poses retain every native matrix word and independent storage', () => {
  const poses: AuthorModelPose[] = [
    { x: -0, y: 0, z: -0, yaw: 0, scale: 1 },
    { x: 17.25, y: -3, z: 127, yaw: 1.234, pitch: -.37, roll: .19, scale: .001 },
    { x: -112, y: 1.25, z: .125, yaw: -2.7, pitch: .8, roll: -1.1, scale: -1.25 },
  ];
  const made = poses.map(bakeModelPose), saved = made.map(matrix => matrix.elements.slice());
  for (const [index, pose] of poses.entries()) expect(made[index]?.elements).toEqual(modelPoseMatrix(pose).elements);
  bakeModelPose({ x: 99, y: 88, z: 77, yaw: 6, scale: 4 });
  for (const [index, matrix] of made.entries()) expect(matrix.elements).toEqual(saved[index]);
  expect(new Set(made).size).toBe(poses.length);
});

test('recursive model getters retain native read order without sharing scratch', () => {
  const inner = { x: 100, y: 200, z: 300, yaw: .5, scale: 10 };
  const pose = (compile: typeof bakeModelPose): AuthorModelPose => {
    let scales = 0;
    return { get x() { compile(inner); return 1; }, y: 2, z: 3, yaw: .75,
      get scale() { compile(inner); return ++scales; } };
  };
  expect(bakeModelPose(pose(bakeModelPose)).elements).toEqual(modelPoseMatrix(pose(modelPoseMatrix)).elements);
});

const rows: readonly BoxSpec[] = [
  { x: 0, z: 0, hw: 2, hd: 3, rot: 0, yBottom: -1, yTop: 5 },
  { x: -3.5, z: 7.25, hw: 0.18, hd: 9, rot: Math.PI / 3, yBottom: 2, yTop: 2 },
  { x: 8, z: -2, hw: 1, hd: 2, rot: -Math.PI / 2, yBottom: 7, yTop: -3 },
];
const surfaces: readonly (ContactSurface | undefined)[] = [undefined, 'stone', 'wood', 'wetSand'];

test.each(rows)('authored box %j retains every native field, signed yaw, clamped height and JSON order', row => {
  for (const surface of surfaces) {
    const actual = boxDesc(row, surface), original = nativeBox(row, surface);
    expect(actual).toEqual(original);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(original));
    expect(Object.hasOwn(actual, 'surface')).toBe(surface !== undefined);
  }
});

test('author yaw frames retain exact native axes, signs and double arithmetic', () => {
  for (const yaw of [0, -0, Math.PI / 2, -Math.PI / 3, 8.7]) {
    const frame = { x: -7.25, z: 13.5, yaw };
    for (const x of [-2.9, 0, 100]) for (const z of [-1.2, -0, 75.3]) {
      expect(yawWorld(frame, x, z)).toEqual(nativeWorld(frame, x, z));
    }
  }
});


test('author copy poses retain the complete native placement contract', () => {
  expectTypeOf<AuthorPlacement<{ radius: number; tint: string }>>().toEqualTypeOf<Placement<{ radius: number; tint: string }>>();
  expectTypeOf<AuthorPlacement<object>>().toEqualTypeOf<Placement<object>>();
});
