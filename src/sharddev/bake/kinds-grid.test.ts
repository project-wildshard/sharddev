import { expect, it } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';
import { bakeKinds } from './kinds';
import { compactWholeChannels, gridPositions, objectSpaceLooks, wholeGrid } from './props';

const json = (glb: Uint8Array): { nodes: { translation?: number[]; scale?: number[]; extras?: Record<string, unknown> }[]; accessors: { componentType: number }[]; meshes: { primitives: { attributes: Record<string, number> }[] }[] } =>
  JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true)))) as never;

it('a one-instance kind on a grid writes Int16 positions under the grid transform and keeps its instance as the pose', () => {
  const geometry = new BoxGeometry(4, 2, 6).translate(10, 1, -3);
  const grid = wholeGrid(geometry); if (grid === undefined) throw new Error('Missing grid');
  expect(compactWholeChannels(geometry)).toBe(true); gridPositions(geometry, grid);
  const mesh = new InstancedMesh(geometry, new MeshStandardMaterial(), 1), pose = new Matrix4().makeTranslation(5, 0, 2);
  mesh.setMatrixAt(0, pose);
  const glb = json(bakeKinds('piece', [['main', mesh]], [], { nativeAttributes: true, compactIndex: true, grid: () => grid }).glb);
  const node = glb.nodes[0], position = glb.accessors[glb.meshes[0]?.primitives[0]?.attributes['POSITION'] ?? -1];
  expect(position?.componentType).toBe(5122);
  expect(node?.scale).toEqual([grid.step, grid.step, grid.step]);
  expect(node?.translation?.map(value => Math.round(value * 1e6) / 1e6)).toEqual(grid.origin.map((value, c) => Math.round((value + ([5, 0, 2][c] ?? 0)) * 1e6) / 1e6));
  expect(node?.extras?.['matrix64']).toEqual(pose.elements);
  expect(node?.extras).not.toHaveProperty('instances64');
});

it('a gridded kind needs exactly one instance', () => {
  const geometry = new BoxGeometry(1, 1, 1), grid = wholeGrid(geometry); if (grid === undefined) throw new Error('Missing grid');
  gridPositions(geometry, grid);
  expect(() => bakeKinds('piece', [['main', new InstancedMesh(geometry, new MeshStandardMaterial(), 2)]], [], { nativeAttributes: true, grid: () => grid })).toThrow('exactly one instance');
});

it('object-space looks are the graphs that read a local or geometry position', () => {
  expect(objectSpaceLooks({ a: { nodes: { n: { op: 'positionLocal' } } }, b: { nodes: { n: { op: 'positionWorld' } } }, c: { nodes: { m: { op: 'positionGeometry' } } }, d: 7 }))
    .toEqual(new Set(['a', 'c']));
});
