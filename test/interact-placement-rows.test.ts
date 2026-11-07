import { expect, test } from 'vitest';
import { autoFlag, createQuestPlacements, bindInteractPlacements, readInteractPlacements, type InteractTable } from '../src/shared/engine/world/interact/types';
import { bindInteractionState, Flags } from '../src/shared/engine/world/interact/flags';
import { bindInteractionPlacements, readInteractionPlacements } from '../src/sharddev/interactions';
import { pineTableFromPlacements } from '../src/shards/pine-hollow/generators/questTable';
import { pineSpots } from '../src/shards/pine-hollow/generators/spots';
import { DRIFTWOOD_SPOTS as driftwood } from '../src/shards/driftwood-isle/generators/spots';
import { DRIFTWOOD_INTERACT } from '../src/shards/driftwood-isle/generators/interactables';

// GR8: called, not read from a scheduler job's output
const pine = pineSpots();

test('authored rest sites preserve quest laws and order; malformed or foreign sites refuse before building', () => {
  const table: InteractTable = { external: ['met'], rows: [
    { kind: 'lever', id: 'handle', label: 'Pull', at: { poi: 'world', x: 1, z: 2 }, requires: { all: ['met'] }, latch: true },
    { kind: 'door', id: 'gate', look: 'sluice', w: 2, h: 2, at: { poi: 'world', x: 2, z: 3 }, opensWhen: { all: ['lever:handle'] } },
  ] };
  const placements = [{ id: 'gate', kind: 'door', x: 20, y: 4, z: 30, yaw: 1 }, { id: 'handle', kind: 'lever', x: 10, y: 3, z: 20, yaw: 0 }];
  const bound = bindInteractionPlacements(table, placements), flags = new Flags('rest-sites', false);
  expect(bound).toEqual(bindInteractPlacements(table, placements));
  expect(JSON.stringify(bound)).toBe(JSON.stringify(bindInteractPlacements(table, placements)));
  expect(bound.rows.map(row => row.id)).toEqual(table.rows.map(row => row.id));
  const handle = bound.rows.find(row => row.id === 'handle'); if (handle?.kind !== 'lever') throw new Error('Missing handle');
  expect(handle.label).toBe('Pull'); expect(handle.at).toMatchObject({ poi: 'world', x: 10, y: 3, z: 20 });
  const state = bindInteractionState(handle, flags); expect(state.locked()).not.toBeNull(); flags.set('met'); expect(state.locked()).toBeNull();
  expect(autoFlag(handle)).toBe('lever:handle'); expect(table.rows[0]?.at).toEqual({ poi: 'world', x: 1, z: 2 });
  expect(() => bindInteractPlacements(table, placements.slice(0, 1))).toThrow();
  expect(() => bindInteractPlacements(table, [...placements, placements[0]])).toThrow();
  expect(() => bindInteractPlacements(table, [{ ...placements[0], id: 'foreign' }, placements[1]])).toThrow();
  expect(() => bindInteractPlacements(table, [{ ...placements[0], kind: 'key' }, placements[1]])).toThrow();
  expect(() => readInteractPlacements([{ id: 'bad', kind: 'lever', x: Infinity, y: 0, z: 0, yaw: 0 }])).toThrow();
  expect(() => readInteractPlacements({})).toThrow();
  for (const input of [placements.slice(0, 1), [...placements, placements[0]],
    [{ ...placements[0], id: 'foreign' }, placements[1]], [{ ...placements[0], kind: 'key' }, placements[1]]]) {
    expect(() => bindInteractionPlacements(table, input)).toThrow();
  }
  expect(() => readInteractionPlacements([{ id: 'bad', kind: 'lever', x: Infinity, y: 0, z: 0, yaw: 0 }])).toThrow();
  expect(() => readInteractionPlacements({})).toThrow();

  const grove = pineTableFromPlacements(pine.rows), island = bindInteractPlacements(DRIFTWOOD_INTERACT, driftwood.rows);
  expect(grove.rows.some(row => row.id === 'dam-sluice' && row.kind === 'door' && row.opensWhen?.all?.includes('lever:dam-log-b'))).toBe(true);
  expect(grove.rows.some(row => row.id.startsWith('resin-') && row.kind === 'pickup' && row.touch === true && row.item === 'amber-resin')).toBe(true);
  expect(island.rows.map(row => row.id)).toEqual(DRIFTWOOD_INTERACT.rows.map(row => row.id));
  expect(island.rows.find(row => row.id === 'hold-key')?.showWhen?.all).toContain('dead:sailor');
  expect(island.rows.find(row => row.id === 'castaway-chest')?.requires?.all).toContain('talked:castaway');
});


test('quest placements borrow live floors and anchors without changing authored precedence', () => {
  let registered = 24;
  const registry = { floorAt: () => registered };
  const hollow = createQuestPlacements({ terrain: () => 4, registry, registryReach: 20 });
  const world = { poi: 'world' as const, x: 5, z: 7, dy: 1 };
  expect(hollow.place(world).y).toBe(5); // Exactly at the strict reach is not a walkable placement.
  registered = 23; expect(hollow.place(world).y).toBe(24);
  expect(hollow.place({ ...world, y: 9 }).y).toBe(9);
  const model = { anchors: { door: { x: 30, z: 40, yaw: 0.2 } } };
  const island = createQuestPlacements({ terrain: () => 4, platforms: [() => 10], registry,
    frames: { hut: { x: 12, z: 15, rot: Math.PI / 2 } }, pois: { hut: model } });
  expect(island.place({ poi: 'hut', x: 2, z: 3, yaw: 0.1 })).toMatchObject({ x: 15, y: 23, z: 13 });
  const door = { poi: 'hut' as const, x: 0, z: 0, anchor: 'hut.door', dy: 2 };
  expect(island.place(door)).toMatchObject({ x: 30, y: 25, z: 40, yaw: 0.2 });
  model.anchors.door.x = 31; expect(island.place(door).x).toBe(31);
  island.setAnchor('hut.door', { x: 8, z: 9 });
  expect(island.place(door)).toEqual({ x: 8, y: 23, z: 9, yaw: 0 }); // Own override ignores dy.
  island.setAnchor('hut.door', { x: 8, y: 7, z: 9, yaw: 0.8 });
  expect(island.place(door)).toEqual({ x: 8, y: 7, z: 9, yaw: 0.8 });
  expect(() => island.place({ ...door, anchor: 'hut.__proto__' })).toThrow();
  expect(() => island.setAnchor('bad', { x: Infinity, z: 0 })).toThrow();
  expect(() => island.place({ poi: 'wreck', x: 0, z: 0 })).toThrow();
  expect(() => island.place({ ...world, dy: Number.NaN })).toThrow();
  expect(() => createQuestPlacements({ terrain: () => 0, registryReach: 0 })).toThrow();
});


test('quest frames use authored names and refuse inherited or unsafe frame identities', () => {
  const resolver = createQuestPlacements({ terrain: () => 3,
    frames: { orchard: { x: 10, z: 20, rot: Math.PI / 2 } },
    pois: { orchard: { anchors: { gate: { x: 12, y: 8, z: 24, yaw: .3 } } } } });
  expect(resolver.place({ poi: 'orchard', x: 2, z: 3, yaw: .1 })).toEqual({ x: 13, y: 3, z: 18, yaw: Math.PI / 2 + .1 });
  expect(resolver.place({ poi: 'orchard', x: 0, z: 0, anchor: 'orchard.gate' })).toEqual({ x: 12, y: 8, z: 24, yaw: .3 });
  expect(() => resolver.place({ poi: 'missing', x: 0, z: 0 })).toThrow('Missing quest frame');
  expect(() => resolver.place({ poi: 'constructor', x: 0, z: 0 })).toThrow('Invalid quest anchor path');
  expect(() => createQuestPlacements({ terrain: () => 0, frames: { constructor: { x: 0, z: 0, rot: 0 } } })).toThrow();
  expect(() => createQuestPlacements({ terrain: () => 0, frames: Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [`frame-${i}`, { x: 0, z: 0, rot: 0 }])) })).toThrow('Too many quest frames');
});
