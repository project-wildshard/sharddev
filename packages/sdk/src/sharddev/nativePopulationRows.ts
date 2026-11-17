import * as v from 'valibot';
import { NativeGroupRowsSchema, PageGroupRowsSchema, PopulationKnockdownSchema } from '@wildshard/format/creatures';
import { WildlifePopulationSchema } from '@wildshard/format/wildlifePopulation';
import { ForagerPopulationSchema, ForagerContinuation } from '@wildshard/format/ambientLife';
import { PopulationFieldSchema } from '@wildshard/format/populationEnvironment';
import { parseNativePopulationRows } from '@wildshard/format/populationRoster';
import { nameBlob, type NamedBlob } from './blobs';
import { encodeCanonicalJson } from './immutable';
import { namedJsonSchema, registeredJsonSchema } from './formatJsonSchema';

/** Admit complete native fauna/encounter/pose roster data with its original identity and resource checks. */
export function parseNativePopulationRoster(input: unknown): ReturnType<typeof parseNativePopulationRows> { return parseNativePopulationRows(input); }

/** Admit data-only native group ownership, ordered steps and guest bindings without a live world. */
export function parseNativeGroupRows(input: unknown): v.InferOutput<typeof NativeGroupRowsSchema> { return v.parse(NativeGroupRowsSchema, input); }
/** Admit native habitat fields through the same bounded runtime schema. */
export function parsePopulationField(input: unknown): v.InferOutput<typeof PopulationFieldSchema> { return v.parse(PopulationFieldSchema, input); }
/** Admit page-owned group metadata, contacts and effects. */
export function parsePageGroupRows(input: unknown): v.InferOutput<typeof PageGroupRowsSchema> { return v.parse(PageGroupRowsSchema, input); }
/** Admit the complete native wildlife population declaration. */
export function parseWildlifePopulation(input: unknown): v.InferOutput<typeof WildlifePopulationSchema> { return v.parse(WildlifePopulationSchema, input); }
/** Preserve the required population/frame/knockdown envelope when reading authored motion metadata. */
export function parsePopulationKnockdownSource(input: unknown): v.InferOutput<typeof PopulationKnockdownSchema> {
  return v.parse(v.object({ population: v.object({ frame: v.object({ knockdown: PopulationKnockdownSchema }) }) }), input).population.frame.knockdown;
}
/** Preserve the required population/forager/row envelope without installing its native host. */
export function parsePopulationForagerSource(input: unknown): v.InferOutput<typeof ForagerPopulationSchema> {
  return v.parse(v.object({ population: v.object({ forager: v.object({ row: ForagerPopulationSchema }) }) }), input).population.forager.row;
}

/** Name an authored canopy/ledge/forager habitat with its exact row counts and
 * native continuation grammar. Limits belong to the supplied source inventory,
 * and both author admission and the emitted reader retain the same schema. */
export function namePopulationHabitat(name: string, input: unknown, treeCount: number, maxLedges: number): NamedBlob {
  if (!Number.isSafeInteger(treeCount) || treeCount < 0 || !Number.isSafeInteger(maxLedges) || maxLedges < 0)
    throw new Error('Invalid population habitat limits');
  const number = v.pipe(v.number(), v.finite());
  const schema = v.strictObject({
    trees: v.pipe(v.array(v.tuple([number, number, v.pipe(number, v.minValue(0))])), v.length(treeCount)),
    tops: v.pipe(v.array(number), v.length(treeCount)),
    ledges: v.pipe(v.array(v.strictObject({ x: number, y: number, z: number, r: v.pipe(number, v.minValue(0)) })), v.maxLength(maxLedges)),
    marmots: ForagerContinuation,
  });
  const rows = v.parse(schema, input), defining = registeredJsonSchema(name);
  return nameBlob(name, 'json', new TextEncoder().encode(encodeCanonicalJson(rows)), { jsonSchema: defining ?? namedJsonSchema(schema) });
}
