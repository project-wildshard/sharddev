import { expect, it } from 'vitest';
import { actorMoveRules, parseActorMoves } from '@wildshard/format/actorMoves';
import { validateOutputSection } from '@wildshard/format/outputIndex';
import { formatJsonSchemas } from '@wildshard/sdk/formatJsonSchema';
import { emitPlatformSections } from '@wildshard/sdk/platformSections';
import { ActorMoveRunner, diveSteering, orbitSteering, stalkSteering, takeoffSteering, type MoveBody, type MoveObservation, type MoveSteering } from '@wildshard/engine/ai/moves';
import {onFault, type Fault} from '@wildshard/engine/core/faults';

const body = () => ({ position: { x: 13, y: 18, z: 0 }, yaw: 0 });
const target = { x: 2, y: 0, z: 5 };
const orbit = { id: 'test.lap', kind: 'orbit', center: [0, 0], r: 13, y: 18, speed: 10, turn: 2 };
const stalk = { id: 'test.over', kind: 'stalk', standOff: 2.5, above: 10, speed: 12, turn: 3, ready: { kind: 'over', radius: 4, height: 2 } };
function skipped(runner: ActorMoveRunner, observation: MoveObservation, message: string): void {
  const before = runner.snapshot(), faults: Fault[] = [], off = onFault(fault => {faults.push(fault);});
  try {
    expect(runner.step(observation)).toEqual({}); expect(runner.snapshot()).toEqual(before);
    expect(faults).toHaveLength(1); expect(faults[0]).toMatchObject({system: 'ai.move', verdict: 'retry', error: {message: expect.stringContaining(message)}});
  } finally {off();}
}
function advance(actor: ReturnType<typeof body>, steer: MoveSteering): void {
  const off = Math.atan2(Math.sin(steer.yaw - actor.yaw), Math.cos(steer.yaw - actor.yaw));
  actor.yaw += Math.max(-steer.turn / 60, Math.min(steer.turn / 60, off));
  actor.position.x += Math.sin(actor.yaw) * steer.speed / 60; actor.position.z += Math.cos(actor.yaw) * steer.speed / 60;
  actor.position.y += Math.max(-0.15, Math.min(0.1, steer.altitude - actor.position.y));
}

it('emits actors/moves with its defining disk schema and resolves actual references', () => {
  const rows = parseActorMoves([orbit, stalk, { id: 'test.lift', kind: 'takeoff', perch: 'test.perch', altitude: 18, seconds: 4, speed: 1.6, turn: 0.15, bank: 0.35 }]);
  expect(actorMoveRules(rows, { spots: new Set(['test.perch']), strikes: new Set(), fields: new Set() })).toEqual([]);
  expect(actorMoveRules(rows, { spots: new Set(), strikes: new Set(), fields: new Set() })).toContain('move perch resolves in world spots');
  const emitted = emitPlatformSections(new Map([['actors/moves', rows]]));
  expect(emitted.sections).toMatchObject([{ name: 'actors/moves', path: 'sections/actors/moves.json' }]);
  expect(validateOutputSection('actors/moves', rows)).toEqual(rows);
  expect(formatJsonSchemas()['actorMoves.ActorMoves']?.type).toBe('array');
  for (const bad of [[orbit, orbit], [{ ...orbit, r: 0 }], [{ ...orbit, r: 1e-300 }], [{ ...orbit, speed: Infinity }],
    [{ ...stalk, altitude: 2 }], [{ ...stalk, above: undefined }], [{ ...orbit, decide: true }]]) expect(() => parseActorMoves(bad)).toThrow();
  let reads = 0;
  const accessor = Object.defineProperty({}, 'id', { enumerable: true, get: () => { reads++; return 'test'; } });
  expect(() => new ActorMoveRunner(accessor, body())).toThrow('plain JSON'); expect(reads).toBe(0);
});

it('matches the old raptor/phased steering over 600-step headless traces', () => {
  // Frozen formulas from pre-KA5 diver.ts (d3cf09823): no decision/strike implementation is duplicated here.
  const cases: { name: string; newSteer: (actor: MoveBody, tick: number) => MoveSteering; oldSteer: (actor: MoveBody, tick: number) => MoveSteering }[] = [
    { name: 'clock orbit', newSteer: (a, tick) => orbitSteering({ center: [0, 0], r: 13, y: 18, speed: 10, turn: 2, ground: false }, a, tick / 60 * 10 / 13),
      oldSteer: (a, tick) => ({ yaw: Math.atan2(Math.cos(tick / 60 * 10 / 13) * 13 - a.position.x, Math.sin(tick / 60 * 10 / 13) * 13 - a.position.z), speed: 10, altitude: 18, turn: 2, ground: false }) },
    { name: 'bearing orbit', newSteer: a => orbitSteering({ center: [0, 0], r: 22, y: 24, lead: 0.5, speed: 8, turn: 1.1, ground: false }, a, 0),
      oldSteer: a => { const around = Math.atan2(a.position.x, a.position.z) + 0.5; return { yaw: Math.atan2(Math.sin(around) * 22 - a.position.x, Math.cos(around) * 22 - a.position.z), speed: 8, altitude: 24, turn: 1.1, ground: false }; } },
    { name: 'retreat band', newSteer: a => stalkSteering({ standOff: 14, altitude: 7, retreat: true, constantSpeed: false, ready: { kind: 'band', tolerance: 3 }, speed: 12, turn: 3, ground: false }, a, target).steering,
      oldSteer: a => { const d = Math.hypot(target.x - a.position.x, target.z - a.position.z); return { yaw: Math.atan2(target.x - a.position.x, target.z - a.position.z) + (d < 14 ? Math.PI : 0), speed: Math.min(12, Math.abs(d - 14) * 1.5), altitude: 7, turn: 3, ground: false }; } },
    { name: 'chest dive', newSteer: a => diveSteering({ slope: 0.4, skim: 4, altitude: 24, aimHeight: 1.2, speed: 18, turn: 2.4, ground: false }, a, target),
      oldSteer: a => ({ yaw: Math.atan2(target.x - a.position.x, target.z - a.position.z), speed: 18,
        altitude: Math.max(4, Math.min(24, Math.hypot(target.x - a.position.x, target.y + 1.2 - a.position.y, target.z - a.position.z) * 0.4)), turn: 2.4, ground: false }) },
    { name: 'departure', newSteer: (a, tick) => takeoffSteering({ altitude: 18, bank: 0.35, speed: 1.6, turn: 0.15, ground: false }, a, target, 4, Math.min(1, tick / 240)).steering,
      oldSteer: (a, tick) => { const k = Math.min(1, tick / 240); return { yaw: Math.atan2(target.x - a.position.x, target.z - a.position.z), speed: 1.6 * k, altitude: 4 + 14 * k, turn: 0.15, ground: false }; } },
  ];
  for (const sample of cases) {
    const before = body(), after = body(); let maxDistance = 0;
    for (let tick = 1; tick <= 600; tick++) {
      advance(before, sample.oldSteer(before, tick)); advance(after, sample.newSteer(after, tick));
      maxDistance = Math.max(maxDistance, Math.hypot(before.position.x - after.position.x, before.position.y - after.position.y, before.position.z - after.position.z));
    }
    expect(maxDistance, sample.name).toBeLessThan(0.001);
  }
});

it('keeps completion/strike one-shot, gives up, and restores without emitting', () => {
  const actor = body(), runner = new ActorMoveRunner({ ...stalk, giveUp: 0.01 }, actor);
  expect(runner.step({ body: actor, target })).toMatchObject({ done: false }); expect(runner.step({ body: actor, target })).toEqual({});
  const dive = { id: 'test.dive', kind: 'dive', speed: 18, turn: 2, slope: 0.4, skim: 4, altitude: 24, aimHeight: 1.2, maxSeconds: 5, strike: 'test.maw' };
  const flight = new ActorMoveRunner(dive, actor), saved = flight.snapshot();
  expect(flight.step({ body: actor, target, reach: true })).toMatchObject({ done: true, strike: 'test.maw' });
  expect(flight.step({ body: actor, target, reach: true })).toEqual({});
  flight.restore(saved); expect(flight.snapshot()).toEqual(saved);
  const fresh = new ActorMoveRunner(dive, actor); fresh.restore(saved);
  expect(flight.step({ body: actor, target })).toEqual(fresh.step({ body: actor, target }));
  const state = flight.snapshot(); expect(() => flight.restore({ ...state, contract: 'other' })).toThrow(); expect(flight.snapshot()).toEqual(state);
  skipped(flight, {body: actor, target: {...target, y: Number.NaN}}, 'Nonfinite'); expect(flight.snapshot()).toEqual(state);
});

it('runs grounded/airborne stalks, timed climb and perch/takeoff through data requests', () => {
  const actor = body();
  const range = new ActorMoveRunner({ id: 'test.ground', kind: 'stalk', standOff: 3, altitude: 18, speed: 2.4, turn: 4, ready: { kind: 'range' }, ground: true }, actor);
  const state = range.snapshot(); skipped(range, {body: actor, target}, 'range'); expect(range.snapshot()).toEqual(state);
  expect(range.step({ body: actor, target: actor.position, range: 5 })).toMatchObject({ done: true, steering: { ground: true } });
  const climb = new ActorMoveRunner({ id: 'test.climb', kind: 'climb', speed: 8, speedBonus: 3, turn: 1, altitude: 24, seconds: 0.02 }, actor);
  expect(climb.step({ body: actor })).toMatchObject({ steering: { speed: 11, altitude: 24 } }); expect(climb.step({ body: actor })).toMatchObject({ done: true });
  const perch = { ...actor.position, yaw: 1 };
  expect(new ActorMoveRunner({ id: 'test.perch', kind: 'perch', perch: 'test.spot', speed: 10, turn: 2 }, actor).step({ body: actor, perch })).toMatchObject({ done: true, steering: { yaw: 1, speed: 0 } });
  const launch = new ActorMoveRunner({ id: 'test.launch', kind: 'takeoff', perch: 'test.spot', altitude: 24, seconds: 4, speed: 1.6, turn: 0.15, bank: 0.35 }, actor);
  skipped(launch, {body: actor, target}, 'perch');
  expect(launch.step({ body: actor, target, perch })).toMatchObject({ steering: { speed: 1.6 / 240 } });
});

it('continues orbit/ring motion and normalized burrow/surface fields without Wasm per body step', () => {
  const actor = body(), runner = new ActorMoveRunner(orbit, actor);
  for (let i = 0; i < 60; i++) { const frame = runner.step({ body: actor }); expect(frame.done).toBeUndefined(); if (frame.steering !== undefined) advance(actor, frame.steering); }
  expect(Math.hypot(actor.position.x - 13, actor.position.z)).toBeGreaterThan(1);
  const ring = new ActorMoveRunner({ id: 'test.ring', kind: 'ring-run', radius: 4, angle: 1, speed: 3, turn: 8, ground: true }, actor);
  expect(ring.step({ body: actor, target })).toMatchObject({ steering: { speed: 3, ground: true } });
  for (const kind of ['burrow', 'surface']) {
    const motion = new ActorMoveRunner({ id: 'test.depth', kind, field: 'test.burrow', rate: 3 }, actor);
    skipped(motion, {body: actor}, 'field');
    const frame = motion.step({ body: actor, field: kind === 'burrow' ? 0.99 : 0.01 });
    expect(frame).toEqual({ field: { id: 'test.burrow', value: kind === 'burrow' ? 1 : 0 }, done: true });
  }
  for (const kind of ['rise', 'lie']) {
    const motion = new ActorMoveRunner({ id: 'test.height', kind, from: 17, to: 18, rate: 60, yawLead: 0.4, speed: 3, turn: 0.6 }, actor);
    expect(motion.step({ body: actor })).toMatchObject({ done: true, steering: { altitude: 18, yaw: actor.yaw + 0.4 } });
  }
});

it('a continuing dive requests its admitted strike once in range, including after restore', () => {
  const actor = body(), row = { id: 'test.continuing', kind: 'dive', speed: 19, turn: 2.4, slope: 0.4, skim: 4.2,
    altitude: 18, aimHeight: 1.2, maxSeconds: 5.5, strike: 'test.maw', contactCompletes: false };
  const owner = new ActorMoveRunner(row, actor), far = { x: 100, y: 0, z: 0 };
  expect(owner.step({ body: actor, target: far, reach: true, range: 10 }).strike).toBeUndefined();
  const near = { x: actor.position.x, y: actor.position.y - 1.2, z: actor.position.z + 1 };
  expect(owner.step({ body: actor, target: near, reach: true, range: 10 })).toMatchObject({ strike: 'test.maw' });
  const resumed = new ActorMoveRunner(row, actor); resumed.restore(owner.snapshot());
  for (const move of [owner, resumed]) {
    const frame = move.step({ body: actor, target: near, reach: true, range: 10 });
    expect(frame.strike).toBeUndefined(); expect(frame.done).toBeUndefined(); expect(frame.steering?.speed).toBe(19);
  }
});

it('field steering admits finite bounded controls and keeps the fixed-step continuation', () => {
  const actor = body(), row = parseActorMoves([{ id: 'marsh.steer', kind: 'steer', ground: true, speed: 4, turn: 2,
    fields: { yaw: 'heading', speed: 'pace', turn: 'turn' } }])[0];
  if (row === undefined) throw new Error('Missing motion');
  expect(actorMoveRules([row], { spots: new Set(), strikes: new Set(), fields: new Set(['heading', 'pace', 'turn']) })).toEqual([]);
  expect(actorMoveRules([row], { spots: new Set(), strikes: new Set(), fields: new Set() })).toHaveLength(1);
  const runner = new ActorMoveRunner(row, actor), controls = { yaw: 0.6, speed: 3, turn: 1.5 };
  expect(runner.step({ body: actor, controls })).toEqual({ steering: { ...controls, altitude: 18, ground: true } });
  const saved = runner.snapshot(), restored = new ActorMoveRunner(row, actor); restored.restore(saved);
  expect(restored.step({ body: actor, controls })).toEqual(runner.step({ body: actor, controls }));
  for (const invalid of [{ ...controls, speed: 5 }, { ...controls, speed: -1 }, { ...controls, turn: 3 }, { ...controls, yaw: Number.NaN }])
    skipped(new ActorMoveRunner(row, actor), {body: actor, controls: invalid}, 'bounds');
});

it('a bad movement frame cannot consume clocks or completion/strike edges and reports only once', () => {
  const actor = body(), row = {id: 'test.bound', kind: 'steer', speed: 4, turn: 2, fields: {yaw: 'heading', speed: 'pace', turn: 'turn'}};
  const runner = new ActorMoveRunner(row, actor), healthy = new ActorMoveRunner(row, actor), faults: Fault[] = [];
  const before = runner.snapshot(), off = onFault(fault => {faults.push(fault);});
  try {
    for (let frame = 0; frame < 3; frame++) {
      expect(runner.step({body: actor, controls: {yaw: 0, speed: 5, turn: 1}})).toEqual({});
      expect(runner.snapshot()).toEqual(before);
    }
    expect(faults).toHaveLength(1);
    const observation = {body: actor, controls: {yaw: .4, speed: 3, turn: 1}};
    expect(runner.step(observation)).toEqual(healthy.step(observation)); expect(runner.snapshot()).toEqual(healthy.snapshot());
  } finally {off();}
});
