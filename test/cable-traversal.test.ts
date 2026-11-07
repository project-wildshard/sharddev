// oxlint-disable-next-line import/no-nodejs-modules -- The native carry check uses the shipped Rapier module.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { CableTraversal, ZiplineDriver, ZiplineTrolley } from '@wildshard/engine/sim/cableTraversal';
import { Flags } from '@wildshard/engine/world/interact/flags';
import { createSimHost } from '@wildshard/engine/sim';
import { loadRapier } from '@wildshard/engine/physics/rapier';
import { Scope } from '@wildshard/engine/app/scope';
import { installCableModes, cableModes } from '@wildshard/engine/player/modes';
import { parseModes } from '@wildshard/format/modes';
import { PINE_MODES } from '../src/shards/pine-hollow/generators/zipline';
import { DRIFTWOOD_MODES } from '../src/shards/driftwood-isle/generators/modes';
import { SIM_LEVEL } from './fixtures/sim-level/level';
import { leadPlayer } from '@wildshard/engine/sim/leadPlayer';

const rows = [...PINE_MODES.traverse, ...DRIFTWOOD_MODES.traverse].filter(row => row.kind === 'zipline');
test('mode setup installs once, isolates page/native scopes and refuses missing owners', () => {
  const page = new Scope('cable-page'), native = new Scope('cable-native'), flags = new Flags('cable-modes', false);
  try {
    expect(() => cableModes(page)).toThrow('not installed');
    const owner = installCableModes(page, rows, flags);
    expect(cableModes(page)).toBe(owner);
    expect(installCableModes(page, rows, flags)).toBe(owner);
    expect(() => installCableModes(page, [], flags)).toThrow('another declaration');
    expect(() => installCableModes(page, rows, new Flags('other', false))).toThrow('flags owner');
    const separate = installCableModes(native, rows, flags);
    const row = rows[0]; if (row === undefined) throw new Error('Missing cable row');
    owner.start(row.id);
    expect(separate.state(row.id).riding).toBe(false);
    expect(separate.declaration(row.id)).toEqual(row);
  } finally { page.dispose(); native.dispose(); }
  expect(() => cableModes(page)).toThrow('not installed');
  expect(() => installCableModes(page, rows, flags)).toThrow('disposed');
});
for (const row of rows) test(`${row.id}: page carry, wind, trolley, release and silent continuation`, () => {
  const flags = new Flags('cable-test', false), owner = new CableTraversal([row], flags);
  const rider = { position: new Vector3(), velocity: new Vector3(), carried: false }, expected = { position: new Vector3(), velocity: new Vector3(), carried: false };
  const object = new Group(), oldObject = new Group(), camera = new PerspectiveCamera();
  const old = new ZiplineDriver(row, row.profile, row.landing);
  const prompt = owner.bindView(row.id, object, rider, { position: new Vector3(), radius: 2.4, label: 'Ride' }, camera);
  const carriage = new ZiplineTrolley(old, row.presentation?.park ?? 0.6, oldObject,
    { position: new Vector3(), radius: 2.4, label: 'Ride' }, () => old.isRiding, () => { old.start(); });
  expect(() => owner.state('missing')).toThrow('Unknown cable');
  expect(() => owner.start('missing')).toThrow('Unknown cable');
  expect(prompt.radius).toBe(2.4);
  prompt.onInteract(); old.start();
  expect(owner.takeTransitions(row.id)).toEqual([true]);
  expect(prompt.radius).toBe(0);
  expect(rider.carried).toBe(row.lifecycle?.carry === 'start');
  let roll = 0, cameraZ = 0, ticks = 0;
  while (old.isRiding && ticks++ < 2400) {
    const holding = old.update(1 / 60, expected); expected.carried = holding;
    carriage.follow(old.distance);
    if (row.presentation?.wind !== undefined) {
      roll += 1 / 60;
      cameraZ += Math.sin(roll * row.presentation.wind.frequency) * row.presentation.wind.amplitude * (old.speed / row.maxSpeed);
    }
    if (!holding) carriage.park();
    owner.update(row.id, 1 / 60);
    expect(rider).toEqual(expected);
    expect(object.position).toEqual(oldObject.position);
    expect(object.quaternion.toArray()).toEqual(oldObject.quaternion.toArray());
    expect(camera.rotation.z).toBe(cameraZ);
    expect(owner.snapshot(row.id)).toEqual(old.snapshot());
    if (ticks === 40) {
      const saved = owner.snapshot(row.id);
      owner.restore(row.id, saved);
      expect(owner.takeTransitions(row.id)).toEqual([]);
      expect(() => owner.restore(row.id, { ...saved, v: 33 })).toThrow();
      expect(owner.snapshot(row.id)).toEqual(saved);
    }
  }
  expect(ticks).toBeLessThan(2400);
  expect(owner.takeTransitions(row.id)).toEqual([false]);
  expect(owner.state(row.id)).toEqual({ riding: false, atEnd: true });
  expect(flags.has(row.lifecycle?.endFlag ?? '')).toBe(true);
  expect(prompt.radius).toBe(2.4);
  const restored = new CableTraversal([row], flags);
  // Pine's old idle envelope is null; its declared completion flag remains authoritative after loading it.
  restored.restore(row.id, row.profile === undefined ? old.snapshot() : { riding: false, s: 0, v: 0 });
  expect(restored.state(row.id)).toEqual({ riding: false, atEnd: true });
  expect(restored.takeTransitions(row.id)).toEqual([]);
});

test('both native carry policies keep release positions, impulses and original save envelopes', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  for (const row of rows) {
    const host = createSimHost(SIM_LEVEL, { rapier }), flags = new Flags('cable-native', false);
    try {
      const owner = installCableModes(host.scope, [row], flags);
      owner.bindNative(host);
      const rider = owner.nativeRider(row.id);
      const reference = new ZiplineDriver(row, row.profile, row.landing), expected = { position: new Vector3(), velocity: new Vector3() };
      owner.start(row.id); reference.start();
      for (let tick = 0; reference.isRiding && tick < 2400; tick++) {
        reference.update(1 / 60, expected);
        owner.updateNative(row.id, 1 / 60, host);
        expect(leadPlayer(host).position).toEqual(expected.position);
        expect(owner.snapshot(row.id)).toEqual(reference.snapshot());
        if (tick === 40) {
          const legacy = reference.snapshot(), current = owner.snapshot(row.id);
          const oldEnvelope = row.profile === undefined ? legacy : { s: legacy.s, v: legacy.v };
          const newEnvelope = row.profile === undefined ? current : { s: current.s, v: current.v };
          expect(newEnvelope).toEqual(oldEnvelope);
          owner.restore(row.id, legacy);
        }
      }
      expect(reference.isRiding).toBe(false);
      expect(flags.has(row.lifecycle?.endFlag ?? '')).toBe(true);
      if (row.lifecycle?.native === 'motor') expect(leadPlayer(host).impulse).toEqual(expected.velocity);
      else expect(rider.velocity).toEqual(expected.velocity);
      expect(owner.takeTransitions(row.id)).toEqual([]);
    } finally { host.dispose(); }
  }
});

test('rejects unbounded cable lifecycle/profile data before installing a driver', () => {
  const row = rows[0]; if (row === undefined) throw new Error('Missing cable fixture');
  for (const edit of [{ profile: { ...row.profile, start: 11 } }, { landing: { x: 999, y: 0, z: 0 } },
    { lifecycle: { endFlag: '../bad', carry: 'start', native: 'position' } }, { presentation: { park: -1 } }]) {
    expect(() => parseModes({ traverse: [{ ...row, ...edit }] })).toThrow();
  }
});
