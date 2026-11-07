import { expect, test } from 'vitest';
import { Scene, Vector3 } from 'three';
import * as v from 'valibot';
import { DynamicBodySlots } from '../src/shared/engine/physics/bodies';
import { BodyLaunchSchema } from '@wildshard/format/nativeItems';
import { ClaimedPickupSchema, parseLootEconomy } from '@wildshard/format/lootEconomy';
import { parseItems } from '@wildshard/format/items';
import { ClaimedPickupRoster } from '../src/client/game/loot/runtime';
import { DRIFTWOOD_SWORDS } from '../src/shards/driftwood-isle/generators/items';
import { DRIFTWOOD_LOOT } from '../src/shards/driftwood-isle/generators/loot';
import pickups from '../src/shards/pine-hollow/data/skinPickups.json' with { type: 'json' };
import { WEAPON_FINISHES } from '../src/shards/pine-hollow/generators/weaponFinishes';

test('aimed and radial launch profiles reproduce the original equations exactly', () => {
  const row = parseItems(DRIFTWOOD_SWORDS).launches?.['coconut'];
  if (row === undefined) throw new Error('Missing authored launch');
  const out = new Vector3();
  for (let i = 0; i < 1200; i++) {
    const from = new Vector3(Math.sin(i) * 12, i % 5, -i / 7), to = new Vector3(i % 33, i % 9, Math.cos(i) * 25);
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const time = Math.max(.8, Math.min(1.5, Math.hypot(dx, dz) / 9));
    DynamicBodySlots.velocity(row, from, to, i / 37, out);
    expect(out.toArray()).toEqual([dx / time, dy / time + .5 * 9.81 * time, dz / time]);
    const phase = i / 37;
    for (const toss of [pickups.ironhide.toss, { horizontal: 1.1, up: 3.4 }]) {
      DynamicBodySlots.velocity({ kind: 'radial', ...toss }, from, from, phase, out);
      expect(out.toArray()).toEqual([Math.sin(phase) * toss.horizontal, toss.up, Math.cos(phase) * toss.horizontal]);
    }
  }
  expect(() => v.parse(BodyLaunchSchema, { ...row, time: [2, 1] })).toThrow();
  expect(() => v.parse(BodyLaunchSchema, { ...row, speed: 0 })).toThrow();
  expect(() => v.parse(BodyLaunchSchema, { ...row, gravity: Infinity })).toThrow();
});

test('death policy preserves first-match ownership, player-side hat placement and Pine source height', () => {
  const rows = parseLootEconomy(DRIFTWOOD_LOOT.economy).pickups;
  if (rows === undefined) throw new Error('Missing authored pickups');
  const held = new Set<string>();
  const ports = { scene: new Scene(), has: (id: string) => held.has(id),
    model: (): never => { throw new Error('Planning must not construct a model'); }, take: () => undefined,
    random: (): never => { throw new Error('Planning must not advance a stream'); } };
  const roster = new ClaimedPickupRoster(rows, ports), player = new Vector3(1, 2, 3);
  const actor = { kind: 'captain', position: new Vector3(9, -3, 3) };
  expect(roster.death(actor, player, ['captain-hat'])).toEqual({ id: 'captain-hat', at: new Vector3(2.5, -3, 3), floor: 'ground' });
  actor.position.copy(player);
  expect(roster.death(actor, player)?.at).toEqual(player);
  held.add('captain-hat'); expect(roster.death(actor, player)).toBeNull();
  expect(roster.death({ kind: 'bear', variant: 'other', position: player }, player)).toBeNull();
  const finish = WEAPON_FINISHES.ironhide;
  const pine = new ClaimedPickupRoster({ ironhide: v.parse(ClaimedPickupSchema, {
    ...pickups.ironhide, death: { ...finish.dropsFrom, floor: 'max' },
  }) }, ports);
  expect(pine.death({ ...finish.dropsFrom, position: actor.position }, player)).toEqual({ id: 'ironhide', at: actor.position, floor: 'max' });
  expect(() => v.parse(ClaimedPickupSchema, { ...pickups.ironhide, death: { ...finish.dropsFrom, floor: 'unknown' } })).toThrow();
});
