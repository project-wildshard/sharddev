import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { authorFormatSchema, namedJsonSchema } from '@wildshard/engine/host/formatJsonSchema';
import { ContractBoardPageSchema } from '@wildshard/format/contracts';
import { QuestPageTalksSchema } from '@wildshard/format/npcs';
import { BodySlotsSchema } from '@wildshard/format/bodySlots';
import { SceneFloorSchema } from '@wildshard/format/sceneDressing';
import { HEADLESS_ASSEMBLY_JSON_SCHEMA } from '@wildshard/format/namedJsonContracts';
import { PracticeSceneSchema, PracticeControllerSchema } from '@wildshard/format/practiceCourseRows';
import { nativeBodySchema, nativeColliderRecordSchema } from '@wildshard/format/nativePhysics';
import { ClaimedPickupSchema } from '@wildshard/format/lootEconomy';

test('claimed pickup composition keeps the complete native validator and JSON grammar', () => {
  const pickup = authorFormatSchema('lootEconomy.ClaimedPickupSchema');
  expectTypeOf<typeof pickup>().toEqualTypeOf<typeof ClaimedPickupSchema>();
  expect(pickup).toBe(ClaimedPickupSchema);
  const current = v.strictObject({ one: pickup }), native = v.strictObject({ one: ClaimedPickupSchema });
  expect(namedJsonSchema(current)).toEqual(namedJsonSchema(native));
  for (const bad of [{}, { one: { unique: 'true' } }, { one: {}, extra: {} }]) {
    expect(v.safeParse(current, bad).success).toBe(false);
    expect(v.safeParse(native, bad).success).toBe(false);
  }
});

test('pure native physics grammar factories retain complete signatures and defining identity', () => {
  const body = authorFormatSchema('nativePhysics.nativeBodySchema'), collider = authorFormatSchema('nativePhysics.nativeColliderRecordSchema');
  expectTypeOf<typeof body>().toEqualTypeOf<typeof nativeBodySchema>();
  expectTypeOf<typeof collider>().toEqualTypeOf<typeof nativeColliderRecordSchema>();
  expect(body).toBe(nativeBodySchema);
  expect(collider).toBe(nativeColliderRecordSchema);
});

test('practice validators retain complete native types and defining object identity', () => {
  const scene = authorFormatSchema('practiceCourseRows.PracticeSceneSchema'), controller = authorFormatSchema('practiceCourseRows.PracticeControllerSchema');
  expectTypeOf<typeof scene>().toEqualTypeOf<typeof PracticeSceneSchema>();
  expectTypeOf<typeof controller>().toEqualTypeOf<typeof PracticeControllerSchema>();
  expect(scene).toBe(PracticeSceneSchema);
  expect(controller).toBe(PracticeControllerSchema);
});

test('checked board projections retain exact object types, entries and original validators', () => {
  const board = authorFormatSchema('contracts.ContractBoardPageSchema');
  expectTypeOf<typeof board>().toEqualTypeOf<typeof ContractBoardPageSchema>();
  expect(board).toBe(ContractBoardPageSchema);
  expect(board.entries.store).toBe(ContractBoardPageSchema.entries.store);
  const owned = v.omit(board, ['contracts', 'panel', 'store']), native = v.omit(ContractBoardPageSchema, ['contracts', 'panel', 'store']);
  expect(owned.entries).toEqual(native.entries);
  expect(authorFormatSchema('npcs.QuestPageTalksSchema')).toBe(QuestPageTalksSchema);
});

test('composed author metadata and custom admission retain defining identity', () => {
  const slots = authorFormatSchema('bodySlots.BodySlotsSchema'), floor = authorFormatSchema('sceneDressing.SceneFloorSchema');
  expectTypeOf<typeof slots>().toEqualTypeOf<typeof BodySlotsSchema>();
  expectTypeOf<typeof floor>().toEqualTypeOf<typeof SceneFloorSchema>();
  expect(slots).toBe(BodySlotsSchema); expect(floor).toBe(SceneFloorSchema);
  const current = v.strictObject({ slots, floors: v.array(floor) }), native = v.strictObject({ slots: BodySlotsSchema, floors: v.array(SceneFloorSchema) });
  expect(namedJsonSchema(current)).toEqual(namedJsonSchema(native));
  for (const bad of [{}, { slots: { executable: () => 1 }, floors: [] }, { slots: {}, floors: [{ x: Number.POSITIVE_INFINITY }] }]) {
    expect(v.safeParse(current, bad).success).toBe(v.safeParse(native, bad).success);
    expect(v.safeParse(current, bad).success).toBe(false);
  }
  expect(authorFormatSchema('namedJsonContracts.HEADLESS_ASSEMBLY_JSON_SCHEMA')).toBe(HEADLESS_ASSEMBLY_JSON_SCHEMA);
});

test('the finite author surface refuses unknown and prototype selectors', () => {
  for (const key of ['unknown', '__proto__', 'constructor', 'toString'])
    expect(() => { Reflect.apply(authorFormatSchema, undefined, [key]); }).toThrow('Unknown author format');
});
