import { expect, test } from 'vitest';
import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { parse } from 'valibot';
import { Scope } from '@wildshard/engine/app/scope';
import { viewProgram } from '@wildshard/engine/script/viewProgram';
import { ViewProgramSchema } from '@wildshard/format/viewProgram';
import { compileScriptV2 } from './compileScriptV2';

// G600 L7 vocabulary (R6): a lent array the module reads (kind 23, f32) and a lent instanced draw it writes in bulk
// (kind 24: total, first changed, changed, then `capacity` matrices and attribute items). The module's input array
// says what to write: [mode, total, first, changed]; mode 0 writes nothing, 1 writes, 2 claims too many copies, 3 an
// out-of-bounds matrix. Each written copy k is the identity moved to x = first + k, its attribute (10 (first + k), .5).
const MODULE = `
const IO: i32 = 1024; const HEADER: i32 = 128; const ENTRY: i32 = 24; const CAPACITY: i32 = 4;
function entry(kind: i32): i32 { return IO + HEADER + (kind - 1) * ENTRY; }
function region(kind: i32): i32 { return IO + load<i32>(entry(kind) + 4); }
export function ws_abi(): i32 { return 2; }
export function ws_io(): i32 { return IO; }
export function ws_init(lo: i32, hi: i32, fuel: i32): i32 { return fuel; }
export function ws_view(dt: f64, alpha: f64, fuel: i32): i32 {
  const a = region(23), b = region(24), mode = <i32>load<f32>(a);
  if (mode == 0) return fuel;
  const total = <i32>load<f32>(a + 4), first = <i32>load<f32>(a + 8), n = <i32>load<f32>(a + 12);
  store<u32>(b, mode == 2 ? 7 : total); store<u32>(b + 4, first); store<u32>(b + 8, n);
  for (let k: i32 = 0; k < n; k++) {
    const m = b + 16 + k * 64;
    for (let c: i32 = 0; c < 16; c++) store<f32>(m + c * 4, c % 5 == 0 ? 1 : 0);
    store<f32>(m + 48, <f32>(first + k));
    if (mode == 3) store<f32>(m, 1000);
    const item = b + 16 + CAPACITY * 64 + k * 8;
    store<f32>(item, <f32>((first + k) * 10)); store<f32>(item + 4, 0.5);
  }
  return fuel;
}`;

test('a view program reads a lent array and writes a lent instanced draw in bulk, inside its caps', async () => {
  const rows = parse(ViewProgramSchema, { system: 'test.batches', budget: { pages: 1, ioBytes: 4096, fuel: 100_000, targetMs: 5 },
    samples: [{ kind: 'constant', value: 0 }], channels: [], transforms: [], arrays: [{ id: 'input', length: 4 }],
    batches: [{ draw: 'copies', capacity: 4, attribute: { name: 'aInst', itemSize: 2 } }], bounds: { translation: 100, scale: [.5, 2], shear: .01 } });
  const module = await compileScriptV2(MODULE, { lane: 'view', ioBytes: 4096 });
  const geometry = new BoxGeometry(); geometry.setAttribute('aInst', new InstancedBufferAttribute(new Float32Array(12), 2));
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 6); mesh.count = 2;
  const input = [0, 0, 0, 0], scope = new Scope('batches');
  const program = viewProgram(module, rows, { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(),
    values: () => null, floor: () => null, slots: () => null, object: () => { throw new Error('No objects here'); }, look: () => undefined,
    array: () => () => input, draw: () => mesh });
  if (program === null) throw new Error('Missing batch program');
  const x = (copy: number): number => new Vector3().setFromMatrixPosition(new Matrix4().fromArray(mesh.instanceMatrix.array, copy * 16)).x;
  const item = (copy: number): number[] => [mesh.geometry.getAttribute('aInst').getX(copy), mesh.geometry.getAttribute('aInst').getY(copy)];
  try {
    input.splice(0, 4, 1, 5, 1, 3); program.frame(1 / 60, 0);
    expect(mesh.count).toBe(5); expect([x(1), x(2), x(3)]).toEqual([1, 2, 3]); expect(item(3)).toEqual([30, .5]); expect(item(0)).toEqual([0, 0]);
    // a frame that writes nothing keeps the draw as it was
    input.splice(0, 4, 0, 0, 0, 0); program.frame(1 / 60, 1 / 60);
    expect(mesh.count).toBe(5); expect(x(2)).toBe(2);
    // a later frame rewrites a range and shrinks the drawn count
    input.splice(0, 4, 1, 3, 0, 2); program.frame(1 / 60, 2 / 60);
    expect(mesh.count).toBe(3); expect([x(0), x(1)]).toEqual([0, 1]); expect(item(1)).toEqual([10, .5]);
    // more copies than the draw holds refuses the whole frame: nothing lands and the program freezes
    input.splice(0, 4, 2, 0, 0, 1); program.frame(1 / 60, 3 / 60);
    expect(mesh.count).toBe(3); expect(program.frozen).toBe(true);
  } finally { scope.dispose(); }
  expect(mesh.count).toBe(2);
});

test('a batch matrix outside the declared bounds refuses its frame', async () => {
  const rows = parse(ViewProgramSchema, { system: 'test.bounds', budget: { pages: 1, ioBytes: 4096, fuel: 100_000, targetMs: 5 },
    samples: [{ kind: 'constant', value: 0 }], channels: [], transforms: [], arrays: [{ id: 'input', length: 4 }],
    batches: [{ draw: 'copies', capacity: 4, attribute: { name: 'aInst', itemSize: 2 } }], bounds: { translation: 100, scale: [.5, 2], shear: .01 } });
  const module = await compileScriptV2(MODULE, { lane: 'view', ioBytes: 4096 });
  const geometry = new BoxGeometry(); geometry.setAttribute('aInst', new InstancedBufferAttribute(new Float32Array(12), 2));
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 6); mesh.count = 0;
  const input = [3, 2, 0, 2], scope = new Scope('bounds');
  const program = viewProgram(module, rows, { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(),
    values: () => null, floor: () => null, slots: () => null, object: () => { throw new Error('No objects here'); }, look: () => undefined,
    array: () => () => input, draw: () => mesh });
  try {
    program?.frame(1 / 60, 0);
    expect(mesh.count).toBe(0); expect(program?.frozen).toBe(true);
    // a draw without the attribute the row names cannot be lent to the program
    const bare = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 6);
    expect(() => viewProgram(module, rows, { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(),
      values: () => null, floor: () => null, slots: () => null, object: () => { throw new Error('No objects here'); }, look: () => undefined,
      array: () => () => input, draw: () => bare })).toThrow('lacks its attribute');
  } finally { scope.dispose(); }
});
