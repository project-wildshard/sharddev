import { expect, test } from 'vitest';
import { ItemCatalogue } from '../src/shared/game/loadout/itemCatalogue';
import { parseItems } from '@wildshard/format/items';
import { pineItems } from '../src/shards/pine-hollow/generators/channelSections';
import { DRIFTWOOD_ITEMS as DRIFTWOOD_SWORDS } from './fixtures/driftwood-items';
import NINE_ITEMS from '../src/shards/nine-dragon-stack/data/items.json' with { type: 'json' };
import { CROSSBOW, LEVER, LONGBOW } from '../src/shards/pine-hollow/generators/equipment';
import { SWORD_WOOD, SWORD_IRON } from '../src/shared/game/weapons/starterMeleeProfile';

// GR8: called, not read from a scheduler job's output
const PINE_ITEMS = pineItems();

test('admitted equipment preserves the five shipping rows across canonical product JSON', () => {
  const pine: unknown = structuredClone(PINE_ITEMS);
  for (const original of [CROSSBOW, LEVER, LONGBOW]) {
    const result = new ItemCatalogue(pine).equipment(original.id);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  }
  const island: unknown = structuredClone(DRIFTWOOD_SWORDS);
  for (const [id, original] of [['weapon.driftwood-isle.wood', SWORD_WOOD], ['weapon.driftwood-isle.iron', SWORD_IRON]] as const) {
    const { id: equipmentId, legacySlot, ui, meta, cues, hitStop } = original;
    expect(new ItemCatalogue(island).equipment(id)).toEqual({ id: equipmentId, legacySlot, ui, meta, cues, hitStop });
  }
  expect(() => new ItemCatalogue(pine).equipment('weapon.missing')).toThrow('Missing declared equipment');
  const without = structuredClone(PINE_ITEMS);
  for (const row of without.rows) Reflect.deleteProperty(row, 'equipment');
  expect(() => new ItemCatalogue(without).equipment('weapon.crossbow')).toThrow('Missing declared equipment');
});

test('equipment refuses executable, undeclared and malformed presentation before construction', () => {
  const source = parseItems(PINE_ITEMS), original = new ItemCatalogue(source).equipment('weapon.crossbow');
  const mutate = (equipment: unknown): unknown => ({ ...source, rows: source.rows.map(row => row.id === 'weapon.crossbow' ? { ...row, equipment } : row) });
  for (const equipment of [
    { ...original, pickup: { create: () => null } },
    { ...original, ui: { ...original.ui, icon: 'missing' } },
    { ...original, ui: { ...original.ui, ammo: { label: 'Bolts', segments: Infinity } } },
    { ...original, cues: { fire: 'wrong.fire', reload: 'cue.reload', impact: 'cue.impact' } },
    { ...original, rangedFeel: { kick: { body: -1, head: 0, kill: 0, side: 0, killSide: 0 }, trauma: { kill: 0, head: 0, killKinds: [], headKinds: [] } } },
    { ...original, legacySlot: 'unknown' },
  ]) expect(() => new ItemCatalogue(mutate(equipment)).equipment(original.id)).toThrow();
  expect(new ItemCatalogue(source).equipment(original.id)).toEqual(original);
});

test('tool presentation uses the same reader and retains its tool identity', () => {
  const row = NINE_ITEMS.rows.find(item => item.kind === 'tool');
  if (row === undefined) throw new Error('Missing authored tool');
  expect(new ItemCatalogue(NINE_ITEMS).equipment(row.id)).toEqual(row.equipment);
  const bad = structuredClone(NINE_ITEMS);
  for (const item of bad.rows) if (item.id === row.id) item.equipment.id = 'weapon.wrong';
  expect(() => new ItemCatalogue(bad).equipment(row.id)).toThrow();
});
