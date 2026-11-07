import { expect, test } from 'vitest';
import { BoxGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene, ShaderMaterial, Vector3 } from 'three';
import { GroundTell } from '@wildshard/engine/fx/groundTell';
import { bindFlatTerrain } from '@wildshard/engine/test/terrain';
import { parse } from 'valibot';
import { Scope } from '@wildshard/engine/app/scope';
import { viewProgram, type ViewSlotActor } from '@wildshard/engine/script/viewProgram';
import { ViewProgramSchema } from '@wildshard/format/viewProgram';
import { compileScriptV2 } from './compileScriptV2';

// A made-up second program (marsh lanterns): each transform position i moves to the first column + i on x; the channel
// bank is the columns after the first.
const LANTERN = `
const IO: i32 = 1024; const HEADER: i32 = 128; const ENTRY: i32 = 24;
function entry(kind: i32): i32 { return IO + HEADER + (kind - 1) * ENTRY; }
function region(kind: i32): i32 { return IO + load<i32>(entry(kind) + 4); }
export function ws_abi(): i32 { return 2; }
export function ws_io(): i32 { return IO; }
export function ws_init(lo: i32, hi: i32, fuel: i32): i32 { return fuel; }
export function ws_view(dt: f64, alpha: f64, fuel: i32): i32 {
  const c = IO + load<i32>(region(15) + 20), t = region(17), out = region(18), nt = load<i32>(entry(17) + 12), nc = load<i32>(entry(18) + 12);
  for (let i = 0; i < nt; i++) {
    const at = t + i * 80; store<i32>(at, 0); store<i32>(at + 4, i); store<i32>(at + 8, 0); store<i32>(at + 12, 1);
    for (let k = 0; k < 16; k++) store<f32>(at + 16 + k * 4, 0);
    store<f32>(at + 16, 1); store<f32>(at + 36, 1); store<f32>(at + 56, 1); store<f32>(at + 76, 1); store<f32>(at + 64, <f32>(load<f64>(c) + <f64>i));
  }
  store<i32>(entry(17) + 16, nt); store<i32>(IO + 72, nt);
  for (let i = 0; i < nc; i++) store<f64>(out + i * 8, load<f64>(c + 8 + i * 8));
  store<i32>(entry(18) + 16, nc); store<i32>(IO + 76, nc);
  return fuel;
}`;
const rows = parse(ViewProgramSchema, { system: 'marsh.lantern', before: [], budget: { pages: 1, ioBytes: 4096, fuel: 100_000, targetMs: 5 },
  samples: [{ kind: 'player', field: 'x' }, { kind: 'constant', value: .25 }, { kind: 'floor', piece: 'jetty', field: 'height' }],
  channels: [{ kind: 'camera', field: 'y' }, { kind: 'look', look: 'marsh-lantern', param: 'glow' }],
  transforms: [{ kind: 'object', object: 'lantern' }], bounds: { translation: 100, scale: [.5, 2], shear: .01 } });

test('a view program lands its matrices on lent objects, its bank on the camera and looks, and restores on leave', async () => {
  const module = await compileScriptV2(LANTERN, { lane: 'view', ioBytes: 4096 });
  const scope = new Scope('marsh'), camera = new PerspectiveCamera(), lantern = new Object3D(), looks: [string, string, number][] = [];
  lantern.position.set(5, 1, 0);
  const player = { position: new Vector3(3, 0, 0), velocity: new Vector3(), yaw: 0 };
  const ports = (pieces: Record<string, number>) => ({ scope, player, camera, slots: () => null, values: () => null, object: (id: string) => { if (id !== 'lantern') throw new Error(id); return lantern; },
    floor: (piece: string) => { const height = pieces[piece]; return height === undefined ? null : () => height; },
    look: (look: string, param: string, value: number) => { looks.push([look, param, value]); } });
  try {
    expect(viewProgram(module, rows, ports({}))).toBeNull();
    const program = viewProgram(module, rows, ports({ jetty: 2 }));
    if (program === null) throw new Error('Missing program');
    program.frame(1 / 60, 0);
    expect(lantern.position.x).toBeCloseTo(3); expect(lantern.matrixAutoUpdate).toBe(false);
    expect(camera.position.y).toBeCloseTo(.25); expect(looks).toEqual([['marsh-lantern', 'glow', 2]]);
    program.frame(1 / 60, 0);
    expect(camera.position.y).toBeCloseTo(.5);
    expect(() => viewProgram(module, rows, ports({ jetty: 2 }))).toThrow('already lent');
  } finally { scope.dispose(); }
  expect(lantern.position.toArray()).toEqual([5, 1, 0]); expect(lantern.matrixAutoUpdate).toBe(true);
});

test('instanced copies, bones, visibility, opacity, uniforms and per-copy attributes are targets, restored on leave', async () => {
  const module = await compileScriptV2(LANTERN, { lane: 'view', ioBytes: 4096 });
  const scope = new Scope('marsh.herd'), shape = new BoxGeometry(), fades = new InstancedBufferAttribute(new Float32Array([.1, .2]), 1);
  shape.setAttribute('aFade', fades);
  const herd = new InstancedMesh(shape, new MeshBasicMaterial(), 2), ghost = new Mesh(new BoxGeometry(), new ShaderMaterial({ uniforms: { uFade: { value: 0 } }, transparent: true }));
  const rider = new Group(), arm = new Object3D(); arm.name = 'arm'; rider.add(arm); ghost.visible = false;
  const objects: Record<string, Object3D> = { herd, ghost, rider };
  const marsh = parse(ViewProgramSchema, { ...rows, samples: [{ kind: 'player', field: 'x' }, ...[1, .4, .7, .9].map(value => ({ kind: 'constant', value }))],
    channels: [{ kind: 'visible', object: 'ghost' }, { kind: 'opacity', object: 'ghost' }, { kind: 'uniform', object: 'ghost', uniform: 'uFade' },
      { kind: 'attribute', object: 'herd', attribute: 'aFade', index: 1, component: 0 }],
    transforms: [{ kind: 'instance', object: 'herd', index: 1 }, { kind: 'bone', object: 'rider', bone: 'arm' }] });
  const program = viewProgram(module, marsh, { scope, player: { position: new Vector3(4, 0, 0), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(),
    floor: () => null, slots: () => null, values: () => null, look: () => undefined, object: id => { const found = objects[id]; if (found === undefined) throw new Error(id); return found; } });
  if (program === null) throw new Error('Missing program');
  try {
    program.frame(1 / 60, 0);
    const copy = new Matrix4(); herd.getMatrixAt(1, copy);
    expect(new Vector3().setFromMatrixPosition(copy).x).toBeCloseTo(4); expect(arm.position.x).toBeCloseTo(5);
    expect(ghost.visible).toBe(true); expect(ghost.material.opacity).toBeCloseTo(.4); expect(ghost.material.uniforms['uFade']?.value).toBeCloseTo(.7);
    expect(fades.getX(1)).toBeCloseTo(.9); expect(fades.getX(0)).toBeCloseTo(.1);
  } finally { scope.dispose(); }
  const copy = new Matrix4(); herd.getMatrixAt(1, copy);
  expect(copy.equals(new Matrix4())).toBe(true); expect(arm.position.x).toBe(0); expect(ghost.visible).toBe(false);
  expect(ghost.material.opacity).toBe(1); expect(ghost.material.uniforms['uFade']?.value).toBe(0); expect(fades.getX(1)).toBeCloseTo(.2);
});

test('pool slots sample their actors and address each actor\'s object, re-claimed when a slot\'s identity changes', async () => {
  const module = await compileScriptV2(LANTERN, { lane: 'view', ioBytes: 4096 });
  const scope = new Scope('marsh.watch'), drawn = (): Mesh<BoxGeometry, MeshBasicMaterial> => new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true }));
  const lifts: Record<string, number> = {};
  const actor = (identity: string, x: number): ViewSlotActor => ({ identity, object: drawn(), x, y: 0, z: 0, yaw: 0, alive: true, ground: 2, field: () => .5,
    set: (name, value) => { lifts[`${identity}.${name}`] = value; } });
  const first = actor('a', .3), second = actor('b', 0), slots: (ViewSlotActor | null)[] = [first, second];
  const watch = parse(ViewProgramSchema, { ...rows, pools: [{ id: 'watch', group: 'marsh.watch', count: 2, fields: ['fade'] }], samples: [{ kind: 'pool', pool: 'watch' }],
    channels: [{ kind: 'opacity', object: { pool: 'watch', slot: 0 } }, { kind: 'color', object: { pool: 'watch', slot: 0 }, color: [1, .5, 0] }, { kind: 'field', pool: 'watch', slot: 0, field: 'lift' }], transforms: [{ kind: 'object', object: { pool: 'watch', slot: 1 } }] });
  const ports = (lent: boolean) => ({ scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(), floor: () => null, values: () => null,
    slots: (group: string) => lent && group === 'marsh.watch' ? { actor: (slot: number) => slots[slot] ?? null } : null,
    look: () => undefined, object: (id: string): Object3D => { throw new Error(id); } });
  expect(viewProgram(module, watch, ports(false))).toBeNull();
  const program = viewProgram(module, watch, ports(true));
  if (program === null) throw new Error('Missing program');
  const third = actor('c', .6);
  const opacity = (slot: ViewSlotActor): number => { const mesh = slot.object; if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshBasicMaterial)) throw new Error('Missing mesh'); return mesh.material.opacity; };
  try {
    program.frame(1 / 60, 0);
    expect(opacity(first)).toBeCloseTo(.3); expect(second.object.position.x).toBeCloseTo(1); expect(lifts['a.lift']).toBe(0);
    const tint = (slot: ViewSlotActor): number => { const mesh = slot.object; if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshBasicMaterial)) throw new Error('Missing mesh'); return mesh.material.color.getHex(); };
    expect(tint(first)).toBe(0); // the bank's second value is slot 0's y (0): base colour × 0
    slots[0] = third; slots[1] = null;
    program.frame(1 / 60, 0);
    expect(opacity(first)).toBe(1); expect(tint(first)).toBe(0xffffff); expect(opacity(third)).toBeCloseTo(.6); expect(second.object.position.x).toBe(0); expect(second.object.matrixAutoUpdate).toBe(true);
  } finally { scope.dispose(); }
  expect(opacity(third)).toBe(1);
  expect(() => parse(ViewProgramSchema, { ...watch, transforms: [{ kind: 'object', object: { pool: 'watch', slot: 2 } }] })).toThrow();
});

test('pool observations keep borrowed read order and exact previous/current columns through slot changes', async () => {
  const capture = `
const IO:i32=1024;
function entry(kind:i32):i32{return IO+128+(kind-1)*24;}
function region(kind:i32):i32{return IO+load<i32>(entry(kind)+4);}
export function ws_abi():i32{return 2;}
export function ws_io():i32{return IO;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
export function ws_view(dt:f64,alpha:f64,fuel:i32):i32{
  const stamp=region(15), columns=IO+load<i32>(stamp+16), count=2*load<i32>(stamp+24), out=region(18);
  for(let i=0;i<count;i++)store<f64>(out+i*8,load<f64>(columns+i*8));
  store<i32>(entry(18)+16,count);store<i32>(IO+76,count);return fuel;
}`;
  const module = await compileScriptV2(capture, { lane: 'view', ioBytes: 4096 }), scope = new Scope('pool.capture');
  const table = parse(ViewProgramSchema, { ...rows, pools: [{ id: 'watch', group: 'watch', count: 2, fields: ['weight'] }],
    samples: [{ kind: 'pool', pool: 'watch' }], transforms: [],
    channels: Array.from({ length: 32 }, (_, i) => ({ kind: 'look', look: 'capture', param: `c${i}` })) });
  const events: string[] = [], landed: number[] = [];
  let x = -0, identity = 'first', fail = false;
  const actor: ViewSlotActor = { object: new Object3D(),
    get identity() { events.push('identity'); return identity; },
    get x() { events.push('x'); return x; }, get y() { events.push('y'); return -2; },
    get z() { events.push('z'); if (fail) throw new Error('Borrowed z refused'); return 3.5; },
    get yaw() { events.push('yaw'); return -.25; }, get alive() { events.push('alive'); return false; },
    get ground() { events.push('ground'); return 17; },
    field: name => { events.push(`field:${name}`); return -.75; }, set: () => undefined };
  let occupied = true;
  const program = viewProgram(module, table, { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(),
    slots: () => ({ refresh: () => { events.push('refresh'); }, actor: slot => { events.push(`slot:${slot}`); return slot === 0 && occupied ? actor : null; } }),
    values: () => null, floor: () => null, object: () => new Object3D(),
    look: (_look, param, value) => { landed[Number(param.slice(1))] = value; } });
  if (program === null) throw new Error('Missing pool capture program');
  const expectedReads = ['refresh', 'slot:0', 'identity', 'x', 'y', 'z', 'yaw', 'alive', 'ground', 'field:weight', 'slot:1'];
  const frame = (value: number): number[] => [1, value, -2, 3.5, -.25, 0, 17, -.75, ...Array.from({ length: 8 }, () => 0)];
  try {
    program.frame(1 / 60, 0);
    expect(events).toEqual(expectedReads); expect(landed).toEqual([...frame(-0), ...frame(-0)]);
    events.length = 0; x = 4;
    program.frame(1 / 60, 1 / 60);
    expect(events).toEqual(expectedReads); expect(landed).toEqual([...frame(-0), ...frame(4)]);
    events.length = 0; x = 6; fail = true;
    expect(() => program.frame(1 / 60, 2 / 60)).toThrow('Borrowed z refused');
    expect(events).toEqual(expectedReads.slice(0, 6)); expect(landed).toEqual([...frame(-0), ...frame(4)]);
    events.length = 0; fail = false; x = 7;
    program.frame(1 / 60, 3 / 60);
    expect(events).toEqual(expectedReads); expect(landed).toEqual([...frame(4), ...frame(7)]);
    events.length = 0; x = 9; identity = 'replacement';
    program.frame(1 / 60, 4 / 60);
    expect(events).toEqual(expectedReads); expect(landed).toEqual([...frame(9), ...frame(9)]);
    events.length = 0; occupied = false;
    program.frame(1 / 60, 5 / 60);
    expect(events).toEqual(['refresh', 'slot:0', 'slot:1']); expect(landed).toEqual(Array.from({ length: 32 }, () => 0));
  } finally { scope.dispose(); }
});

test('lent values and the player yaw are sample columns; a missing source installs nothing', async () => {
  const module = await compileScriptV2(LANTERN, { lane: 'view', ioBytes: 4096 });
  const scope = new Scope('marsh.carry'), lantern = new Object3D(), law: Record<string, number> = { goal: 3 };
  const carry = parse(ViewProgramSchema, { ...rows, samples: [{ kind: 'player', field: 'yaw' }, { kind: 'value', source: 'carry', field: 'goal' }],
    channels: [{ kind: 'look', look: 'marsh-lantern', param: 'goal' }], transforms: [{ kind: 'object', object: 'lantern' }] });
  const looks: number[] = [];
  const ports = (lent: boolean) => ({ scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: .5 }, camera: new PerspectiveCamera(), floor: () => null, slots: () => null,
    values: (source: string) => lent && source === 'carry' ? (field: string) => law[field] ?? Number.NaN : null,
    look: (_look: string, _param: string, value: number) => { looks.push(value); }, object: () => lantern });
  try {
    expect(viewProgram(module, carry, ports(false))).toBeNull();
    const program = viewProgram(module, carry, ports(true)); if (program === null) throw new Error('Missing program');
    program.frame(1 / 60, 0);
    expect(lantern.position.x).toBeCloseTo(.5); expect(looks).toEqual([3]);
    law['goal'] = Number.NaN; expect(() => { program.frame(1 / 60, 0); }).toThrow('not finite');
  } finally { scope.dispose(); }
});

test('a clock sample is its system\'s frame time, read fresh each frame', async () => {
  const CLOCK = `
const IO: i32 = 1024; const HEADER: i32 = 128; const ENTRY: i32 = 24;
function entry(kind: i32): i32 { return IO + HEADER + (kind - 1) * ENTRY; }
function region(kind: i32): i32 { return IO + load<i32>(entry(kind) + 4); }
export function ws_abi(): i32 { return 2; }
export function ws_io(): i32 { return IO; }
export function ws_init(lo: i32, hi: i32, fuel: i32): i32 { return fuel; }
export function ws_view(dt: f64, alpha: f64, fuel: i32): i32 {
  store<f64>(region(18), load<f64>(IO + load<i32>(region(15) + 20))); store<i32>(entry(18) + 16, 1); store<i32>(IO + 76, 1);
  return fuel;
}`;
  const module = await compileScriptV2(CLOCK, { lane: 'view', ioBytes: 4096 }), scope = new Scope('clock'), seen: number[] = [];
  const clock = parse(ViewProgramSchema, { system: 'marsh.clock', before: [], budget: { pages: 1, ioBytes: 4096, fuel: 100_000, targetMs: 5 },
    samples: [{ kind: 'clock' }], channels: [{ kind: 'look', look: 'marsh-clock', param: 'time' }], transforms: [], bounds: { translation: 0, scale: [1, 1], shear: 0 } });
  const program = viewProgram(module, clock, { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(),
    slots: () => null, values: () => null, floor: () => null, object: () => new Object3D(), look: (_look, _param, value) => { seen.push(value); } });
  if (program === null) throw new Error('Expected the clock program');
  try {
    program.frame(1 / 60, 1234.5); program.frame(600, 1834.5);
    expect(() => { program.frame(1 / 60, Number.NaN); }).toThrow('View clock is not finite');
  } finally { scope.dispose(); }
  expect(seen).toEqual([1234.5, 1834.5]);
});

test('a lent cell takes its channel on landing, before its owner reads it, and is restored on leave', async () => {
  const module = await compileScriptV2(LANTERN, { lane: 'view', ioBytes: 4096 });
  const scope = new Scope('marsh.cell'), glow = { value: .2 }, looks: number[] = [];
  const cells = parse(ViewProgramSchema, { ...rows, samples: [{ kind: 'constant', value: 0 }, { kind: 'constant', value: .8 }],
    channels: [{ kind: 'cell', cell: 'lantern.glow' }], transforms: [] });
  // the owner's own frame reads the cell after the program's (an owner's syncLook-style push)
  const sync = (): void => { looks.push(glow.value); };
  const bare = { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(), floor: () => null, slots: () => null,
    values: () => null, look: () => undefined, object: (id: string): Object3D => { throw new Error(id); } };
  const ports = { ...bare, cell: (id: string) => { if (id !== 'lantern.glow') throw new Error(id); return glow; } };
  const program = viewProgram(module, cells, ports); if (program === null) throw new Error('Missing program');
  try {
    sync(); program.frame(1 / 60, 0); sync();
    expect(looks).toEqual([.2, .8]);
    expect(() => viewProgram(module, cells, ports)).toThrow('already lent');
    expect(() => viewProgram(module, cells, bare)).toThrow('not lent');
  } finally { scope.dispose(); }
  expect(glow.value).toBe(.2);
});

test('a lent tell draws the ring, lane or wedge its channels name with its owner\'s own geometry, and hides', async () => {
  const module = await compileScriptV2(LANTERN, { lane: 'view', ioBytes: 4096 });
  const restore = bindFlatTerrain({ heightAt: (x: number, z: number) => .1 * x + .05 * z });
  const owner = new Scope('marsh.tells'), scene = new Scene(), make = (kind: 'ring' | 'lane' | 'wedge'): GroundTell =>
    owner.run(() => kind === 'wedge' ? new GroundTell(scene, kind, 0xffffff, { cone: .6, material: new MeshBasicMaterial(), fill: { value: 0 }, alpha: { value: 0 } }) : new GroundTell(scene, kind, 0xffcc00));
  const drawn = { ring: make('ring'), lane: make('lane'), wedge: make('wedge') }, direct = { ring: make('ring'), lane: make('lane'), wedge: make('wedge') };
  const values = { ring: [3, 4, 2.5, .7], lane: [1, 2, 6, 8, 1.5, .6], wedge: [-2, 5, .4, 3, .5, .9] };
  const shapes = ['ring', 'lane', 'wedge'] as const, params = { ring: ['x', 'z', 'radius', 'alpha'], lane: ['x', 'z', 'x1', 'z1', 'width', 'alpha'], wedge: ['x', 'z', 'yaw', 'reach', 'fill', 'alpha'] };
  const tellRows = parse(ViewProgramSchema, { ...rows, samples: [{ kind: 'constant', value: 0 }, ...shapes.flatMap(shape => values[shape].map(value => ({ kind: 'constant', value })))],
    channels: shapes.flatMap(shape => params[shape].map(param => ({ kind: 'tell', tell: `marsh.${shape}`, param }))), transforms: [] });
  const scope = new Scope('marsh.view');
  const ports = { scope, player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, camera: new PerspectiveCamera(), floor: () => null, slots: () => null,
    values: () => null, look: () => undefined, object: (id: string): Object3D => { throw new Error(id); },
    tell: (id: string) => { const shape = shapes.find(row => `marsh.${row}` === id); if (shape === undefined) throw new Error(id); return drawn[shape]; } };
  const program = viewProgram(module, tellRows, ports); if (program === null) throw new Error('Missing program');
  try {
    program.frame(1 / 60, 0);
    const [rx, rz, rr, ra] = values.ring, [lx, lz, lx1, lz1, lw, la] = values.lane, [wx, wz, wy, wr, wf, wa] = values.wedge;
    direct.ring.ring(rx ?? 0, rz ?? 0, rr ?? 0, ra ?? 0); direct.lane.lane(lx ?? 0, lz ?? 0, lx1 ?? 0, lz1 ?? 0, lw ?? 0, la ?? 0); direct.wedge.wedge(wx ?? 0, wz ?? 0, wy ?? 0, wr ?? 0, wf ?? 0, wa ?? 0);
    for (const shape of shapes) {
      const a = drawn[shape].mesh, b = direct[shape].mesh;
      expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(Array.from(b.geometry.getAttribute('position').array));
      expect(a.visible).toBe(true);
    }
    expect(() => parse(ViewProgramSchema, { ...tellRows, channels: [{ kind: 'tell', tell: 'marsh.ring', param: 'x' }, { kind: 'tell', tell: 'marsh.ring', param: 'width' }] })).toThrow();
  } finally { scope.dispose(); }
  for (const shape of shapes) expect(drawn[shape].mesh.visible).toBe(false);
  owner.dispose(); restore();
});
