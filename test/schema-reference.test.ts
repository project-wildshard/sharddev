// oxlint-disable-next-line import/no-nodejs-modules -- Run the actual Node schema reader from its source root.
import { cwd } from 'node:process';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { schemaInventory } from '../scripts/docs/schema-reference.mjs';
import { HeldFirearmViewSchema, HeldBowRowsSchema } from '@wildshard/format/weaponProfiles';

test('the firearm view reference covers open objects and their declared nested fields', () => {
  const rows = schemaInventory(HeldFirearmViewSchema);
  expect(rows.find(row => row.path === '$')).toMatchObject({ type: 'loose_object', constraints: ['unknown fields are preserved'] });
  expect(rows.map(row => row.path)).toEqual(expect.arrayContaining(['$.sight.muzzleZ', '$.timing.autoReloadDelay', '$.timing.autoReloadClose', '$.hip.scale']));
  expect(rows.find(row => row.path === '$.timing.autoReloadClose')?.wrappers).toEqual([{ kind: 'exact_optional', default: 'undefined' }]);
});

test('public specimen schemas load through the renderer-free reference reader', async () => {
  const { referenceData } = await import('../scripts/docs/gen-shardfile-reference.mjs');
  const reference = referenceData(cwd());
  expect(reference.fields.some(row => typeof row === 'object' && row !== null && 'path' in row && typeof row.path === 'string' && row.path.startsWith('$format["./specimenCatalogue"].SpecimenCatalogueSchema'))).toBe(true);
});

test('intersection references preserve every branch without executing checks', () => {
  let checks = 0;
  const schema = v.intersect([
    v.pipe(v.object({ left: v.string() }), v.check(() => { checks++; return false; })),
    v.object({ right: v.number() }),
  ]);
  const rows = schemaInventory(schema);
  expect(rows.map(row => row.path)).toEqual(['$', '$&<0>', '$&<0>.left', '$&<1>', '$&<1>.right']);
  expect(rows[0]).toMatchObject({ type: 'intersect', constraints: ['every intersection branch must pass'] });
  expect(rows[1]?.constraints).toEqual(['check [function; not executed]']);
  expect(checks).toBe(0);
  const unknown = v.intersect([v.string(), v.number()]);
  Object.defineProperty(unknown.options[1], 'type', { value: 'unreviewed' });
  expect(() => schemaInventory(unknown)).toThrow('Unsupported schema');
});


test('empty hull part arrays retain their never item contract in the reference', () => {
  const parts = v.array(v.never());
  expect(v.safeParse(parts, []).success).toBe(true);
  expect(v.safeParse(parts, [{}]).success).toBe(false);
  expect(schemaInventory(parts)).toMatchObject([{ path: '$', type: 'array' }, { path: '$[]', type: 'never' }]);
});


test('strict tuples retain exact arity and expose every indexed child to the reference', () => {
  const strict = v.strictTuple([v.number(), v.strictObject({ enabled: v.boolean() })]);
  const ordinary = v.tuple([v.number(), v.strictObject({ enabled: v.boolean() })]);
  const rows = schemaInventory(strict);
  expect(rows[0]).toMatchObject({ path: '$', type: 'strict_tuple' });
  expect(rows.slice(1)).toEqual(schemaInventory(ordinary).slice(1));
  expect(rows.map(row => row.path)).toEqual(['$', '$[0]', '$[1]', '$[1].enabled']);
  expect(v.safeParse(strict, [1, { enabled: true }]).success).toBe(true);
  expect(v.safeParse(strict, [1, { enabled: true }, 2]).success).toBe(false);
});


test('bounded record entries retain minimum and maximum constraints in the reference', () => {
  const styles = v.pipe(v.record(v.string(), v.string()), v.minEntries(1), v.maxEntries(8));
  expect(schemaInventory(styles)[0]).toMatchObject({ type: 'record', constraints: ['min_entries 1', 'max_entries 8'] });
  expect(v.safeParse(styles, {}).success).toBe(false);
  expect(v.safeParse(styles, { plain: 'paint' }).success).toBe(true);
  expect(v.safeParse(styles, Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index), 'paint']))).success).toBe(false);
  expect(schemaInventory(HeldBowRowsSchema).find(row => row.path === '$.styles')).toMatchObject({
    type: 'record', constraints: ['min_entries 1 "Invalid held bow styles"', 'max_entries 8 "Invalid held bow styles"'],
  });
});
