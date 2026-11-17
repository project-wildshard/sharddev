// oxlint-disable-next-line import/no-nodejs-modules -- The native item oracle uses the actual shipped Rapier module.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createSimHost, type SimHost } from '../src/server/engine/sim';
import { snapshotSimHost } from '../src/shared/engine/sim/snapshot';
import { restoreSimHost } from '../src/server/engine/sim/restore';
import { loadRapier } from '../src/shared/engine/physics/rapier';
import { createNativeCombatFrame, installNativeItems } from '../src/server/game/plugin/nativeItems';
import { fillNativeCombatFrame } from '../src/sdk/headlessRuntime';
import { parseItems } from '@wildshard/format/items';
import { pineItems } from '../src/shards/pine-hollow/generators/channelSections';
import { GustContinuation } from '../src/shared/engine/world/weatherContinuation';
import weatherProgram from '../src/shards/pine-hollow/data/weather.json' with { type: 'json' };
import { installPineCrossbow, boltFlight } from './fixtures/weapon-oracle/headlessCrossbow';
import { installPineLongbow } from './fixtures/weapon-oracle/nativeLongbow';
import { installPineLever } from './fixtures/weapon-oracle/nativeLever';
import { SIM_LEVEL } from './fixtures/sim-level/level';

// GR8: called, not read from a scheduler job's output
const PINE_ITEMS = pineItems();

const items = parseItems(PINE_ITEMS);
const declaration = (id: string) => {
  const item = items.rows.find(row => row.id === id);
  if (item?.kind !== 'weapon' || item.ranged === undefined || item.profile === undefined) throw new Error('Missing fixture weapon');
  return { policy: item.ranged, profile: item.profile };
};
function fixtureLevel(z: number): typeof SIM_LEVEL {
  const level = structuredClone(SIM_LEVEL);
  for (const row of level.entities) { row.at.z = z; row.spec.hp = 1e6; }
  return level;
}
test('combat lending retains attacks, first ranged hold, last melee release and last script without stale input', () => {
  const frame = createNativeCombatFrame(), attacks = frame.attacks, scripts = frame.scripts;
  fillNativeCombatFrame(frame, [
    { kind: 'player', moveX: 1, moveZ: 0, yaw: 1, attack: { targetId: 'a' }, heavy: { targetId: 'held' } },
    { kind: 'script', actorId: 'pick', value: 2 },
    { kind: 'player', moveX: 0, moveZ: 1, yaw: 2, attack: { targetId: 'b' } },
    { kind: 'script', actorId: 'pick', value: 0 },
  ]);
  expect(frame.attacks).toEqual(['a', 'b']); expect(frame.heavy).toEqual({ targetId: 'held' });
  expect(frame.melee).toEqual({ attack: 'b', heavy: false, heavyTarget: null, swing: false, pitch: null, sprint: false, seq: 0, viewTick: 0 });
  expect(frame.scripts.get('pick')).toBe(0); expect([frame.moveX, frame.moveZ, frame.yaw]).toEqual([0, 1, 2]);
  fillNativeCombatFrame(frame, []);
  expect(frame.attacks).toBe(attacks); expect(frame.scripts).toBe(scripts);
  expect(frame.attacks).toEqual([]); expect(frame.heavy).toBeNull(); expect(frame.scripts.size).toBe(0);
  expect(frame.melee).toEqual({ attack: null, heavy: false, heavyTarget: null, swing: false, pitch: null, sprint: false, seq: 0, viewTick: 0 });
  expect(() => { fillNativeCombatFrame(frame, Array.from({ length: 1025 }, () => ({ kind: 'script', actorId: 'pick', value: 0 }))); }).toThrow();
});

test('native item rows preserve all three old continuations, contacts, RNG, stowed flight and save resume', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  const level = fixtureLevel(-8);
  let rain = 0;
  const frame = createNativeCombatFrame(), gust = new GustContinuation(weatherProgram.air);
  let old = createSimHost(level, { rapier }), current = createSimHost(level, { rapier });
  const install = (host: SimHost): void => {
    installNativeItems(host, frame, { kind: 'bolt', ...declaration('weapon.crossbow') });
    installNativeItems(host, frame, { kind: 'cycle', ...declaration('weapon.lever') });
    installNativeItems(host, frame, { kind: 'bow', ...declaration('weapon.longbow') });
  };
  const installOld = (host: SimHost): void => {
    const bodies = () => [...host.entities.values()];
    installPineCrossbow(host, { shots: () => frame.attacks, enabled: () => frame.live.has(0), bodies, aim: () => frame.aim,
      adsBlend: () => frame.adsBlend, ammunition: () => frame.ammo === 'pitch' ? 'pitch' : frame.ammo === 'broadhead' ? 'broadhead' : 'iron',
      flight: kind => boltFlight(kind, rain) });
    installPineLever(host, { shots: () => frame.attacks, enabled: () => frame.live.has(1), bodies, aim: () => frame.aim,
      adsBlend: () => frame.adsBlend, speedFactor: () => frame.speedFactor ?? 0 });
    installPineLongbow(host, { heavy: () => frame.heavy, enabled: () => frame.live.has(2), bodies, aim: () => frame.aim,
      wind: gust, aimed: () => frame.aimed, speedFactor: () => frame.speedFactor ?? 0, extraSpread: () => frame.extraSpread, mountSpread: () => frame.mountSpread });
  };
  installOld(old); install(current);
  const ids = ['pine.crossbow', 'pine.lever', 'pine.longbow'];
  const state = (host: SimHost) => ids.map(id => host.adapters.get(id)?.snapshot());
  let contacts = 0;
  try {
    current.events.on('damage.dealt', () => { contacts++; }, current.scope);
    for (let tick = 0; tick < 1500; tick++) {
      rain = (tick % 101) / 100; gust.advance(1 / 60, 0.3);
      const wind = gust.snapshot(); frame.rain = rain;
      frame.wind = { clock: { time: wind.time, gust: wind.gust }, field: { x: -0.55, z: 0.83, frontLength: 150, frontSpeed: 11, secondaryLength: 0.61 * 150 }, base: 1.2, scale: 7 };
      frame.aim = tick % 11 === 0 ? 0.8 : 0.5; frame.adsBlend = (tick % 61) / 60; frame.aimed = (tick % 41) / 40;
      frame.speedFactor = (tick % 37) / 36; frame.extraSpread = 0.1; frame.mountSpread = 0.2;
      frame.ammo = tick % 3 === 0 ? 'pitch' : tick % 3 === 1 ? 'broadhead' : 'iron';
      frame.live.clear(); frame.live.add(Math.floor(tick / 180) % 3); frame.armed.clear(); frame.armed.add(Math.floor(tick / 180) % 3);
      frame.attacks.length = 0; if (tick % 7 === 0) frame.attacks.push('absent', 'boar:1', 'boar:1');
      frame.heavy = tick % 110 < 70 ? { targetId: 'boar:1' } : null;
      old.step(); current.step();
      expect(state(current), `item state at tick ${String(tick)}`).toEqual(state(old));
      expect(current.rng.snapshot()).toEqual(old.rng.snapshot());
      expect(current.entities.get('boar:1')?.hp).toBe(old.entities.get('boar:1')?.hp);
      if (tick === 649) {
        const oldSaved = snapshotSimHost(old), saved = snapshotSimHost(current); old.dispose(); current.dispose();
        old = restoreSimHost(level, { rapier }, oldSaved, installOld); current = restoreSimHost(level, { rapier }, saved, install);
        expect(state(current)).toEqual(state(old));
      }
    }
    expect(contacts).toBeGreaterThan(0);
    const adapter = current.adapters.get('pine.lever'); if (adapter === undefined) throw new Error('Missing cycle continuation');
    const before = adapter.snapshot();
    if (typeof before !== 'object' || before === null || Array.isArray(before)) throw new Error('Missing saved cycle fields');
    expect(() => { adapter.restore({ ...before, reserve: -1 }); }).toThrow();
    expect(adapter.snapshot()).toEqual(before);
  } finally { old.dispose(); current.dispose(); }
}, 30_000);

test('the second native user keeps swept phases, synchronous reaction order and its saved wire', async () => {
  const [{ driftwoodItems }, { default: policy }, { installNativeSweptMelee }] = await Promise.all([
    import('../src/shards/driftwood-isle/generators/items'), import('../src/shards/driftwood-isle/data/nativeSwords.json'), import('../src/server/game/plugin/nativeSwept'),
  ]);
  const DRIFTWOOD_SWORDS = driftwoodItems();
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  const level = fixtureLevel(-1.6);
  const frame = createNativeCombatFrame(), expected: string[] = [], actual: string[] = [];
  const old = createSimHost(level, { rapier }), current = createSimHost(level, { rapier });
  const record = (log: string[], host: SimHost, kind: string): void => { log.push(`${String(host.state.tick)}:${kind}:${String(host.entities.get('boar:1')?.hp)}`); };
  const original = installNativeSweptMelee(old, DRIFTWOOD_SWORDS.rows, policy, { input: () => frame.melee,
    alarm: () => { record(expected, old, 'alarm'); }, staggered: () => { record(expected, old, 'stagger'); } });
  current.events.answer('item.reaction', reaction => { record(actual, current, reaction.kind); return reaction; }, current.scope);
  const adopted = installNativeItems(current, frame, { kind: 'swept', policy, items: DRIFTWOOD_SWORDS.rows });
  try {
    for (let tick = 0; tick < 420; tick++) {
      frame.melee.attack = tick % 31 === 0 ? 'boar:1' : null;
      frame.melee.heavy = tick % 120 >= 30 && tick % 120 < 90; frame.melee.heavyTarget = frame.melee.heavy ? 'boar:1' : null;
      if (tick === 210) { original.equip(1); adopted.equip(1); }
      old.step(); current.step();
      expect(current.adapters.get(policy.step)?.snapshot()).toBe(old.adapters.get(policy.step)?.snapshot());
      expect(actual).toEqual(expected); expect(adopted.hits()).toBe(original.hits());
      expect(current.entities.get('boar:1')?.hp).toBe(old.entities.get('boar:1')?.hp);
      if (tick === 190) {
        const before = old.adapters.get(policy.step)?.snapshot();
        if (before === undefined) throw new Error('Missing saved swept state');
        current.adapters.get(policy.step)?.restore(before); expect(current.adapters.get(policy.step)?.snapshot()).toBe(before);
      }
    }
    expect(adopted.hits()).toBeGreaterThan(0); expect(actual.some(entry => entry.includes(':stagger:'))).toBe(true);
  } finally { old.dispose(); current.dispose(); }
});
