import { HeldEquipmentSchema } from '@wildshard/format/heldEquipment';
import tuning from '../src/shards/pine-hollow/data/heldTuning.json' with {type:'json'};
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { FirearmWeaponProfileSchema, parseHeldFirearmRows, parseHeldFirearmView, parseHeldModelRows, parseHeldPresentation } from '@wildshard/format/weaponProfiles';
import rifle from './fixtures/nalati-rifle-original.json' with { type: 'json' };
import items from '../src/shards/nalati-grasslands/data/items.json' with { type: 'json' };
import model from '../src/shards/nalati-grasslands/data/heldRifle.json' with { type: 'json' };
import { AR15 } from './fixtures/weapon-oracle/nalatiRifleProfile';
import { heldFirearmSettings } from '../src/client/game/plugin/heldEquipment';
import leverDetails from '../src/shards/pine-hollow/data/leverDetails.json' with { type: 'json' };
import { pineItems as pineItemsSection } from '../src/shards/pine-hollow/generators/channelSections';

// GR8: called, not read from a scheduler job's output
const pineItems = pineItemsSection();

test('generated carbine keeps every native profile, model and playback value', () => {
  const item = items.rows.find(row => row.id === 'weapon.rifle');
  const profile = { ...v.parse(FirearmWeaponProfileSchema, item?.profile), ...rifle.feel };
  expect(Object.fromEntries(Object.keys(AR15).map(key => [key, Reflect.get(profile, key)]))).toEqual(AR15);
  const rows = parseHeldFirearmRows(rifle.rows);
  expect(parseHeldModelRows(rows)).toEqual({ ...parseHeldModelRows(model), brass: { geometry: 'case', material: 'brass' } });
  expect(rows.presentation).toEqual(parseHeldPresentation(model.presentation));
  expect(rows.playback).toEqual(model.playback);
  expect(rows.playback.schedule).toEqual({ frame: 'frame', sight: 'sight', pose: 'pose', action: ['parts'], grip: [] });
});

test('lever admission retains additional view and timing fields read by playback', () => {
  const details = {rows:{view:v.parse(HeldEquipmentSchema.entries.firearm.entries.rows.entries.view,leverDetails.rows.view)}};
  const item = pineItems.rows.find(row => row.id === 'weapon.lever');
  const { view } = heldFirearmSettings(item !== undefined && 'profile' in item ? item.profile : undefined, details.rows.view,tuning.firearmTuning);
  expect(parseHeldFirearmView(view)).toEqual(view);
  expect(parseHeldFirearmView(rifle.view)).toEqual(rifle.view);
});

test('malformed mounts, output owners and camera tuples refuse', () => {
  expect(() => parseHeldFirearmRows({ ...rifle.rows, mount: 'missing' })).toThrow();
  expect(() => parseHeldFirearmRows({ ...rifle.rows, playback: { ...rifle.rows.playback,
    outputs: [{ group: 'frame', rows: [], target: 'missing' }] } })).toThrow();
  expect(() => parseHeldFirearmView({ ...rifle.view, port: [0, 0] })).toThrow();
});
