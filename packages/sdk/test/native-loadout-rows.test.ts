// oxlint-disable-next-line import/no-nodejs-modules -- The native slot oracle uses the shipped Rapier bytes.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseNativeLoadoutRow } from '@wildshard/format/nativeItems';
import { parseItems, parseNativeSweptMeleeBinding } from '@wildshard/format/items';
import { bindNativeLoadout, createNativeLoadout } from '../src/server/game/plugin/simulation';
import { createNativeCombatFrame } from '../src/server/game/plugin/nativeItems';
import { createSimHost } from '../src/server/engine/sim';
import { loadRapier } from '../src/shared/engine/physics/rapier';
import { SIM_LEVEL } from './fixtures/sim-level/level';
import { PINE_NATIVE_LOADOUT } from './fixtures/weapon-oracle/nativeLoadout';
import { aimShare } from './fixtures/weapon-oracle/headlessRanged';
import { pineItems } from '../src/shards/pine-hollow/generators/channelSections';
import { DRIFTWOOD_ITEMS as DW_ITEMS } from './fixtures/driftwood-items';
import DW_POLICY from '../src/shards/driftwood-isle/data/nativeSwords.json' with { type: 'json' };

// GR8: called, not read from a scheduler job's output
const PINE_ITEMS = pineItems();

const pine = parseItems(PINE_ITEMS).loadout.native;
if (pine?.input === undefined) throw new Error('Missing authored native input rows');
const policy = pine, input = pine.input;

test('both real kits declare their unchanged slot order, clocks and ownership', () => {
  expect({ slots: policy.slots, initial: policy.initial, lower: policy.lower, raise: policy.raise }).toEqual(PINE_NATIVE_LOADOUT);
  expect(policy.ownership).toEqual([null, 'owned:lever-rifle', 'paid:king']);
  const { row } = parseNativeSweptMeleeBinding(DW_POLICY, DW_ITEMS.rows);
  expect(row.selection).toEqual({ slots: [0, 1], initial: 0, lower: 0, raise: 0, ownership: [null, null] });
  if (row.selection === undefined) throw new Error('Missing swept selection rows');
  const kit = createNativeLoadout(row.selection, { locked: () => false });
  kit.select(1); expect(kit.snapshot()).toEqual({ held: 1, swap: null });
  expect(() => parseNativeSweptMeleeBinding({ ...DW_POLICY, selection: policy }, DW_ITEMS.rows)).toThrow();
});

test('1,200 frames preserve old swaps, explicit pick priority, live locks, aim and publication order', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  const host = createSimHost(SIM_LEVEL, { rapier }), frame = createNativeCombatFrame(), live = frame.live;
  let locked = false, took = false, consumed = 0;
  const old = createNativeLoadout<number>(PINE_NATIVE_LOADOUT, { owned: slot => slot === 0 || host.flags.has(slot === 1 ? 'owned:lever-rifle' : 'paid:king'), locked: () => locked });
  const current = bindNativeLoadout(host, policy, { flags: host.flags, frame, locked: () => locked,
    step: { id: input.step, phase: input.phase, pick: () => {
      const picked = frame.scripts.get(input.command) ?? null, pickup = took; consumed++;
      return picked ?? (pickup ? 1 : null);
    } } });
  const seen: number[][] = [];
  host.onStep('test.items', () => { seen.push([...frame.live]); }, undefined, 'afterBodies');
  try {
    for (let tick = 0; tick < 1200; tick++) {
      if (tick === 80) host.flags.set('owned:lever-rifle');
      if (tick === 160) host.flags.set('paid:king');
      locked = tick % 79 < 13; took = tick % 41 === 0;
      const pick = tick % 17 === 0 ? Math.floor(tick / 17) % 4 : null;
      const aim = [undefined, Number.NaN, -0.4, 0.8, 1.7, 2][tick % 6];
      frame.scripts.clear(); if (pick !== null) frame.scripts.set(input.command, pick);
      if (aim !== undefined) frame.scripts.set(input.publication.aim.command, aim);
      old.step(1 / 60, pick === null ? took ? 1 : null : pick === 3 ? null : pick);
      host.step();
      expect(current.snapshot()).toEqual(old.snapshot());
      expect(frame.aim).toBe(aimShare(aim ?? 0.5));
      expect(frame.live).toBe(live); expect([...frame.live]).toEqual(policy.slots.filter(slot => old.live(slot)));
      expect(seen[tick]).toEqual([...frame.live]); expect(consumed).toBe(tick + 1);
      locked = !locked; expect(current.live(current.held())).toBe(old.live(old.held())); locked = !locked;
      if (tick === 330) { current.restore(old.snapshot()); expect(current.snapshot()).toEqual(old.snapshot()); }
    }
    const before = current.snapshot(); expect(() => current.restore({ held: 31, swap: null })).toThrow(); expect(current.snapshot()).toEqual(before);
    expect(host.adapters.get(input.step)?.snapshot()).toEqual(before);
    expect(host.adapters.has(input.publication.step)).toBe(false);
  } finally { host.dispose(); }
});

test('strict slot/input preflight rejects malformed ownership and aim before registering any step', async () => {
  for (const row of [ { ...policy, slots: [0, 0, 2] }, { ...policy, ownership: [null] },
    { ...policy, input: { ...input, publication: { ...input.publication, aim: { ...input.publication.aim, min: 1 } } } },
    { ...policy, ownership: [null, '', null] }, { ...policy, lower: Number.NaN } ]) expect(() => parseNativeLoadoutRow(row)).toThrow();
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  const host = createSimHost(SIM_LEVEL, { rapier });
  try {
    expect(() => bindNativeLoadout(host, policy, { flags: host.flags, locked: () => false,
      step: { id: input.step, phase: input.phase, pick: () => null } })).toThrow('combat frame');
    expect(host.adapters.has(input.step)).toBe(false);
    expect(() => createNativeLoadout(policy, { locked: () => false })).toThrow('flags');
  } finally { host.dispose(); }
});
