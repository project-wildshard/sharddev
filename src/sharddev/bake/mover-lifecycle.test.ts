import { expect, it } from 'vitest';
import { Scope } from '@wildshard/engine/app/scope';
import { MoverLifecycle, moverEndState } from '@wildshard/engine/sim/moverLifecycle';
import { parseMovers } from '@wildshard/format/movers';
import { lowerMoverMotion } from '@wildshard/format/moverMotion';
import { compileMoverMotion } from '../movers';
import { compileMoverDriver } from '@wildshard/sharddev/compileMovers';
import { createMoverHost, MoverRuntime } from '@wildshard/engine/game/shardfile/moverRuntime';

const rest = { at: { x: 0, y: 3, z: 2 }, euler: { x: -1, y: -Math.PI / 4, z: 0 } };
function ownedMotion(input: unknown, pose: Parameters<typeof compileMoverMotion>[1]): ReturnType<typeof compileMoverMotion> {
  const rows = compileMoverMotion(input, pose);
  expect(rows).toEqual(lowerMoverMotion(input, pose));
  return rows;
}
function hinge() {
  const motion = { driver: { kind: 'winch', mode: 'hinge', speed: 0.5 }, trigger: { kind: 'interact', permission: 3 },
    track: { clip: 'raise', duration: 2, loop: 'once', speed: 1, times: [0, 2], quaternion: [[Math.sin(-0.5), 0, 0, Math.cos(-0.5)], [0, 0, 0, 1]] } };
  return { id: 'test.bridge', entity: 1, kind: 'platform', ...rest, enabled: false,
    boxes: [{ x: 0, y: 0, z: 0, hx: 1, hy: 0.1, hz: 2, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ...ownedMotion(motion, rest), ...motion, atEnd: { field: 5, equals: 1 }, restoreFrom: { flag: 'quest.raised', action: 'end' } };
}
function channel() {
  const base = { at: { x: 0, y: -3, z: 0 }, euler: { x: 0, y: 0, z: 0 } };
  const motion = { driver: { kind: 'track' }, trigger: { kind: 'interact', permission: 0 },
    track: { clip: 'haul', duration: 1.2, loop: 'once', speed: 1, times: [0, 1.2], position: [[0, -3, 0], [0, 1.35, 0]] } };
  return { id: 'test.bucket', entity: 1, kind: 'channel', ...base, enabled: true, boxes: [],
    ...ownedMotion(motion, base), ...motion, atEnd: { field: 5, equals: 1 }, restoreFrom: { flag: 'quest.oil', action: 'end' } };
}
const modules = new Map<string, Promise<Uint8Array>>();
function compile(kind: 'hinge' | 'clip'): Promise<Uint8Array> {
  let value = modules.get(kind); if (value === undefined) { value = compileMoverDriver(kind); modules.set(kind, value); } return value;
}
async function runtime(input: unknown, flags: ReadonlySet<string>) {
  const rows = parseMovers([input]), row = rows[0]; if (row === undefined) throw new Error('Missing mover fixture');
  const host = await createMoverHost(rows, new Map([[row.module, await compile(row.kind === 'channel' ? 'clip' : 'hinge')]]), () => []);
  const scope = new Scope('mover-lifecycle-test');
  const mover = new MoverRuntime(rows, { host, scope, physics: () => { throw new Error('Collision-free/adopted fixture must not allocate physics'); },
    ...(row.kind === 'channel' ? {} : { adopt: () => ({ pose: () => undefined }) }), restoreFlags: flags });
  return { host, mover, scope, row };
}

it('admits only real one-shot endpoint restoration and collision-free tracks', () => {
  const admitted = parseMovers([hinge()])[0]; if (admitted === undefined) throw new Error('Missing hinge fixture');
  expect(moverEndState(admitted)).toMatchObject({ position: [0, 3, 2], fields: { 1: 0, 2: -Math.PI / 4, 3: 0, 4: 1, 5: 1, 6: 0 } });
  const raw = channel();
  for (const change of [{ boxes: hinge().boxes }, { driver: { kind: 'pendulum', axis: 'x', amplitude: 0.1, period: 1 } },
    { atEnd: { field: 5, equals: 2 } }, { atEnd: { field: 5, equals: 0 } }, { restoreFrom: { flag: 'quest.oil', action: 3 } },
    { track: { ...raw.track, loop: 'repeat' } }]) expect(() => parseMovers([{ ...raw, ...change }])).toThrow();
});

it('preserves endpoint latches and undelivered events without replay on restore', () => {
  const rows = [{ id: 'bridge', atEnd: { field: 5, equals: 1 } }], events = new MoverLifecycle(rows);
  events.observe('bridge', { 5: 0 }); events.observe('bridge', { 5: 1 }); events.observe('bridge', { 5: 1 });
  expect(events.atEnd('bridge')).toBe(true); expect(()=>events.atEnd('missing')).toThrow();
  const saved = events.snapshot(), restored = new MoverLifecycle(rows); restored.restore(saved);
  expect(restored.drain()).toEqual([{ mover: 'bridge', atEnd: true }]); expect(restored.drain()).toEqual([]);
  restored.observe('bridge', { 5: 1 }); expect(restored.drain()).toEqual([]);
  restored.observe('bridge', { 5: 0 }); expect(restored.drain()).toEqual([{ mover: 'bridge', atEnd: false }]);
  const before = restored.snapshot(); expect(() => restored.restore({ ...saved, ends: [{ mover: 'foreign', atEnd: true }] })).toThrow(); expect(restored.snapshot()).toEqual(before);
  expect(() => restored.observe('bridge', {})).toThrow(); expect(restored.snapshot()).toEqual(before);
  restored.seed('bridge', { 5: 1 }); expect(restored.drain()).toEqual([]);
  for (let i = 0; i < 64; i++) restored.observe('bridge', { 5: i % 2 });
  expect(() => restored.observe('bridge', { 5: 0 })).toThrow('overflow');
});

it('observes a real headless hinge trace and restores its endpoint without a guest tick', async () => {
  const live = await runtime(hinge(), new Set());
  try {
    live.mover.command(live.row.id, 1);
    for (let tick = 1; tick <= 125; tick++) { live.host.beginTick(tick); live.mover.step(tick, new Map([[live.row.id, 3]])); }
    expect(live.host.failureCount).toBe(0);
    expect(live.mover.pose(live.row.id).euler.x).toBeCloseTo(0, 10);
    expect(live.mover.atEnd(live.row.id)).toBe(true);
    expect(live.mover.drainEndEvents()).toEqual([{ mover: live.row.id, atEnd: true }]);
    live.host.beginTick(126); live.mover.step(126); expect(live.mover.drainEndEvents()).toEqual([]);
    const loaded = await runtime(hinge(), new Set(['quest.raised']));
    try {
      expect(loaded.host.checkpoint().tick).toBe(-1);
      expect(loaded.mover.pose(loaded.row.id)).toEqual(live.mover.pose(live.row.id)); expect(loaded.mover.drainEndEvents()).toEqual([]);
      loaded.host.beginTick(1); loaded.mover.step(1); expect(loaded.mover.drainEndEvents()).toEqual([]);
    } finally { loaded.scope.dispose(); }
  } finally { live.scope.dispose(); }
});

it('continues the bucket track across a native checkpoint and restores oil directly at its endpoint', async () => {
  const live = await runtime(channel(), new Set());
  try {
    live.mover.command(live.row.id, 1);
    for (let tick = 1; tick <= 36; tick++) { live.host.beginTick(tick); live.mover.step(tick); }
    const saved = { mover: live.mover.snapshotState(), host: live.host.checkpoint(), entities: live.host.world.state() };
    const resume = await runtime(channel(), new Set());
    try {
      resume.host.world.restore(saved.entities); resume.host.restoreState(saved.host); resume.mover.restoreState(saved.mover); resume.mover.reconnect();
      for (let tick = 37; tick <= 75; tick++) {
        live.host.beginTick(tick); live.mover.step(tick); resume.host.beginTick(tick); resume.mover.step(tick);
        expect(resume.mover.pose(resume.row.id)).toEqual(live.mover.pose(live.row.id));
        expect(resume.mover.drainEndEvents()).toEqual(live.mover.drainEndEvents());
      }
      expect(live.mover.pose(live.row.id).position.y).toBeCloseTo(1.35, 12);
      // Pre-lifecycle saves seed from restored host fields and do not replay completion.
      resume.host.world.restore(saved.entities); // native adapters may restore before their script/world adapter
      resume.mover.restoreState(JSON.stringify({ pending: resume.mover.snapshot(), bodies: resume.mover.snapshotBodies() }));
      resume.host.world.restore(live.host.world.state()); resume.mover.reconnect();
      resume.host.beginTick(76); resume.mover.step(76); expect(resume.mover.drainEndEvents()).toEqual([]);
      const loaded = await runtime(channel(), new Set(['quest.oil']));
      try {
        expect(loaded.host.checkpoint().tick).toBe(-1); expect(loaded.mover.pose(loaded.row.id).position.y).toBe(1.35);
        expect(loaded.mover.drainEndEvents()).toEqual([]); expect(loaded.mover.snapshotBodies()).toEqual([]);
        loaded.host.beginTick(1); loaded.mover.step(1); expect(loaded.mover.drainEndEvents()).toEqual([]);
      } finally { loaded.scope.dispose(); }
    } finally { resume.scope.dispose(); }
  } finally { live.scope.dispose(); }
});
