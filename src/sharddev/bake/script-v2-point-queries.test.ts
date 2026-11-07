import { beforeAll, expect, test } from 'vitest';
import { Scope } from '@wildshard/engine/app/scope';
import { GroupStepV2 } from '@wildshard/engine/script/groupStepV2';
import { QueryRingV2 } from '@wildshard/engine/script/queriesV2';
import { Physics } from '@wildshard/engine/physics/Physics';
import { loadRapier } from '@wildshard/engine/physics/rapier';
import { resolvePhysicsQueriesV2, type V2QueryWorld } from '@wildshard/engine/physics/queryBatchV2';
import { parseGroupStepV2, groupStepLayoutV2 } from '@wildshard/format/scriptGroupStepV2';
import { validateV2QueryRequest, prepareV2QueryReplies, type V2QueryBinding, type V2QueryRequest } from '@wildshard/format/scriptQueriesV2';
import { compileScriptV2 } from './compileScriptV2';
import { v2CoreSource } from '../as/wsV2';
import { fixtureBytes } from '@wildshard/engine/test/nativeBytes';

const rows = parseGroupStepV2({ bank: [{ kind: 'number', name: 'grassSum' }, { kind: 'number', name: 'normalSum' }],
  columns: [], members: 1, signals: ['step','overQuota'], actions: [], outputs: 1, pages: 1, fuel: 400000, queries: { pending: 2, scalars: 32 } });
const layout = groupStepLayoutV2(rows), binding: V2QueryBinding = { identity: 'group', handle: 8, observed: new Map(), operations: new Set([12, 13]) };
const rights = new Map([['group', { pending: 2, operations: new Map([[12, 16], [13, 16]] as const) }]]);
const byHandle = new Map([[8, binding]]), byName = new Map([['group', binding]]), due = new Set(['group']);
let bytes: Uint8Array;
beforeAll(async () => {
  bytes = await compileScriptV2(`import * as ws from './sdk/as/wsV2';
    export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
    export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
    export function ws_project(fuel:i32):i32{ws.beginState();assert(ws.beginBinding(0));
      if(ws.currentTick()==0){const points:usize=memory.data(256);
        for(let i=0;i<16;i++){store<f64>(points+usize(i)*16,f64(i));store<f64>(points+usize(i)*16+8,f64(-i));}
        ws.queryPoints(12,1,points,16);ws.queryPoints(13,2,points,16);
        if(ws.parameter(0)==2)ws.queryPoints(12,3,points,16);
      }else for(let i=0;i<ws.count(12);i++){
        assert(ws.replyStatus(i)==1);let sum:f64=0;
        for(let j=0;j<16;j++)sum+=ws.replyData(i,j);
        ws.setState(i,sum);
      }
      ws.endBinding();return fuel;}`, { lane: 'project', ioBytes: layout.bytes, sources: { 'sdk/as/wsV2.ts': v2CoreSource(0) } });
});
function ring(): QueryRingV2 { return new QueryRingV2(layout, rights); }
function at(index: number): number { const region = layout.regions[index - 1];if (region === undefined) throw new Error('Missing fixture region');return layout.io + region.offset; }
function request(op: 12 | 13 = 12): V2QueryRequest {
  return { binding: 'group', id: op - 11, op, target: null, atTick: 0, values: [16, 0, 0, 0, 0, 0, 0],
    points: Array.from({ length: 16 }, (_, index) => [index, index === 0 ? 0 : -index] as const) };
}
/** Independently encode the documented wire to test suffix refusal without
 * changing or mocking the compiled guest's production writer. */
function frame(): DataView {
  const view = new DataView(new ArrayBuffer(65536));
  for (let block = -1; block < 6; block++) {
    const base = at(11) + (block + 1) * 80;
    [8, 1, 12, block < 0 ? 0 : 1, 0, 0].forEach((value, index) => view.setUint32(base + index * 4, value, true));
    if (block < 0) view.setFloat64(base + 24, 16, true);
    else for (let point = 0; point < 3 && block * 3 + point < 16; point++) {
      const value = block * 3 + point;view.setFloat64(base + 24 + point * 16, value, true);view.setFloat64(base + 32 + point * 16, -value, true);
    }
  }
  return view;
}
test('actual AS lists use the original native field owners, ordered replies and existing pending/ready saves', async () => {
  const scope = new Scope('point-queries');
  const R = await loadRapier(Uint8Array.from(fixtureBytes(new URL('../../../node_modules/@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm', import.meta.url)))), physics = new Physics(R);
  const grassCalls: number[][] = [], groundCalls: number[][] = [];
  const grass = { base: 2, calls: grassCalls, grassHeightAt(x: number, z: number): number { this.calls.push([x, z]);return this.base + x * .1 - z * .2; } };
  const ground = { calls: groundCalls, normalY(x: number, z: number): number { this.calls.push([x, z]);return Math.cos(x * .03) * Math.cos(z * .05); } };
  const world: V2QueryWorld = { physics, navmesh: null, bodies: new Map(), sees: ['WORLD'], as: 'PLAYER', grass, ground };
  try {
    const runner = new GroupStepV2(bytes, rows, scope), state = new Float64Array(2), initial = ring();
    const prepare = (queries: QueryRingV2, tick: number) => runner.prepare({ group: 'group', handle: 8, signal: 'step', tick,
      state, members: [], references: [], queries: { ring: queries, binding } });
    const step = prepare(initial, 0);expect(initial.snapshot().entries).toHaveLength(0);step.accept();
    const pending = initial.snapshot(), restored = ring(), pendingWire = JSON.stringify(pending);restored.restore(JSON.parse(pendingWire), new Map([['group', new Set<string>()]]));
    expect(restored.snapshot()).toStrictEqual(pending);expect(pending.entries).toHaveLength(2);
    expect(pending.entries[0]?.request.points).toStrictEqual(request().points);
    const inspection = restored.openAfterBodies(0);
    try { expect(Object.isFrozen(inspection.requests[0]?.points)).toBe(true); } finally { inspection.release(); }
    // Use a fresh restored owner after the explicit inspection loan is released.
    const active = ring();active.restore(pending, new Map([['group', new Set<string>()]]));
    active.afterBodies(0, requests => resolvePhysicsQueriesV2(requests.map(value => ({ module: 'module', request: value })), new Map([['module', new Map([['group', world]])]])));
    expect(grass.calls).toStrictEqual(request().points);expect(ground.calls).toStrictEqual(request().points);
    expect(active.delivery(0, byName, due).consumed).toHaveLength(0);
    const ready = active.snapshot(), resumed = ring(), readyWire = JSON.stringify(ready);resumed.restore(JSON.parse(readyWire), new Map([['group', new Set<string>()]]));
    expect(resumed.snapshot()).toStrictEqual(ready);expect(grass.calls).toHaveLength(16);
    const next = prepare(resumed, 1);expect(Array.from(state)).toStrictEqual([0, 0]);expect(resumed.snapshot().entries).toHaveLength(2);
    next.accept();
    expect(state[0]).toBe(request().points?.reduce((sum, [x, z]) => sum + (grass.base + x * .1 - z * .2), 0));
    expect(state[1]).toBe(request().points?.reduce((sum, [x, z]) => sum + Math.cos(x * .03) * Math.cos(z * .05), 0));
    expect(resumed.snapshot().entries).toHaveLength(0);expect(physics.world.bodies.len()).toBe(0);
  } finally { scope.dispose();physics.dispose(); }
});
test('malformed continuation records and suffix padding cannot publish a valid prefix', () => {
  const changes: ((view: DataView) => void)[] = [
    view => view.setUint32(at(11) + 80, 9, true),
    view => view.setUint32(at(11) + 84, 2, true),
    view => view.setUint32(at(11) + 88, 13, true),
    view => view.setUint32(at(11) + 92, 0, true),
    view => view.setUint32(at(11) + 96, 1, true),
    view => view.setUint32(at(11) + 100, 1, true),
    view => view.setFloat64(at(11) + 24, 17, true),
    view => view.setFloat64(at(11) + 32, -0, true),
    view => view.setFloat64(at(11) + 6 * 80 + 40, 1, true),
    view => view.setFloat64(at(11) + 6 * 80 + 72, Number.NaN, true),
  ];
  for (const change of changes) {
    const query = ring(), view = frame(), before = query.snapshot();change(view);
    expect(() => query.prepareFrame(view, 7, 0, byHandle)).toThrow();expect(query.snapshot()).toStrictEqual(before);
  }
  expect(() => ring().prepareFrame(frame(), 6, 0, byHandle)).toThrow('Incomplete');
  const orphan = frame();new Uint8Array(orphan.buffer, at(11) + 7 * 80, 80).set(new Uint8Array(orphan.buffer, at(11) + 80, 80));
  expect(() => ring().prepareFrame(orphan, 8, 0, byHandle)).toThrow('Undeclared');
});
test('point requests, reply arity and normal bounds share the same live and restored admission', () => {
  for (const malformed of [{ ...request(), points: [] }, { ...request(), target: 'body' },
    { ...request(), points: [...(request().points ?? []), [1, 2] as const] }, { ...request(), values: [0, 0, 0, 0, 0, 0, 0] as const },
    { ...request(13), points: [[Number.NaN, 0] as const] }, { ...request(), op: 4 as const }]) expect(() => validateV2QueryRequest(malformed)).toThrow();
  const query = ring();query.prepareFrame(frame(), 7, 0, byHandle)();const before = query.snapshot();
  expect(() => query.afterBodies(0, () => [{ status: 1, kind: 'grass', samples: [1] }])).toThrow('Incomplete');
  expect(query.snapshot()).toStrictEqual(before);
  const invalid = { ...before, entries: before.entries.map(row => ({ ...row, request: { ...row.request, points: [] } })) };
  expect(() => query.restore(invalid, new Map([['group', new Set<string>()]]))).toThrow();expect(query.snapshot()).toStrictEqual(before);
  expect(() => prepareV2QueryReplies(layout, 1, [{ request: request(13), atTick: 0, answer: { status: 1, kind: 'normal', samples: Array.from({ length: 16 }, () => 2) } }], byName)).toThrow('normal');
});
test('field authority, finite samples and callable identity are checked before any reply publication', async () => {
  const R = await loadRapier(Uint8Array.from(fixtureBytes(new URL('../../../node_modules/@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm', import.meta.url)))), physics = new Physics(R);
  const world: V2QueryWorld = { physics, navmesh: null, bodies: new Map(), sees: ['WORLD'], as: 'PLAYER' };
  const resolve = (value: V2QueryWorld) => resolvePhysicsQueriesV2([{ module: 'module', request: request() }], new Map([['module', new Map([['group', value]])]]));
  try {
    expect(resolve(world)).toStrictEqual([{ status: 3 }]);
    expect(() => resolve({ ...world, grass: { grassHeightAt: () => Number.NaN } })).toThrow('sample');
    const grass = { grassHeightAt: (_x: number, _z: number) => { grass.grassHeightAt = () => 1;return 0; } };
    expect(() => resolve({ ...world, grass })).toThrow('Replaced');
  } finally { physics.dispose(); }
});

test('the compiled list writer bounds all wire records before publishing a request prefix', () => {
  const scope = new Scope('point-overflow'), runner = new GroupStepV2(bytes, rows, scope), queries = ring(), state = new Float64Array(2);
  try {
    expect(() => runner.prepare({ group: 'group', handle: 8, signal: 'overQuota', tick: 0, state, members: [], references: [], queries: { ring: queries, binding } })).toThrow();
    expect(Array.from(state)).toStrictEqual([0, 0]);expect(queries.snapshot().entries).toHaveLength(0);
  } finally { scope.dispose(); }
});
test('logical request quotas and complete answer banks account for every list sample', () => {
  const view = frame();new Uint8Array(view.buffer, at(11) + 7 * 80, 7 * 80).set(new Uint8Array(view.buffer, at(11), 7 * 80));
  for (let row = 7; row < 14; row++) { view.setUint32(at(11) + row * 80 + 4, 2, true);view.setUint32(at(11) + row * 80 + 8, 13, true); }
  const query = ring();query.prepareFrame(view, 14, 0, byHandle)();const before = query.snapshot();
  expect(() => query.afterBodies(0, () => [{ status: 1, kind: 'grass', samples: Array.from({ length: 16 }, () => 1) },
    { status: 1, kind: 'normal', samples: Array.from({ length: 16 }, () => 2) }])).toThrow('normal');
  expect(query.snapshot()).toStrictEqual(before);
  const smaller = groupStepLayoutV2({ ...rows, queries: { pending: 2, scalars: 31 } }), full = new QueryRingV2(smaller, rights);
  expect(() => full.prepareFrame(view, 14, 0, byHandle)).toThrow('reservation');expect(full.snapshot().entries).toHaveLength(0);
});
