import * as v from 'valibot';
import { CreatureStrikeSchema } from '@wildshard/format/creatures';
import { readSpecies, readSpeciesProgram, SpeciesSchema } from '@wildshard/format/speciesPrograms';
import { SocketRigCreatureSchema } from '@wildshard/format/socketRigCreature';

/** The same strict portable strike admission used by native and page population rows. */
export const StrikeSchema: typeof CreatureStrikeSchema = CreatureStrikeSchema;
/** Serializable native strike accepted by the SDK, without an authored callback. */
export type StrikeData = v.InferOutput<typeof StrikeSchema>;
/** Validate a serializable native strike before its trusted engine adapter is constructed. */
export function strike(data: unknown): StrikeData { return v.parse(StrikeSchema, data); }
/** Gameplay-only species fields; the defining declaration lives in the format layer. */
export type SpeciesData = ReturnType<typeof readSpecies>;
/** Refuse malformed species data before registration, actor construction or view creation. */
export function species(data: unknown): SpeciesData { return readSpecies(data); }

/** Admit complete native species, strike and module declarations before compiling actors. */
export function speciesProgramRows(input: unknown): ReturnType<typeof readSpeciesProgram> { return readSpeciesProgram(input); }

/** Prepare a strict reader for selected defining species fields. Only native
 * field names are accepted; original validators, defaults and issue order remain. */
export function speciesFieldReader<const Keys extends v.ObjectKeys<typeof SpeciesSchema>>(keys: Keys):
  (input: unknown) => v.InferOutput<ReturnType<typeof v.pick<typeof SpeciesSchema, Keys>>> {
  const schema = v.pick(SpeciesSchema, keys);
  return input => v.parse(schema, input);
}

/** Admit a socket-dressed creature card, coat and model metadata without constructing a live body. */
export function socketRigCreatureRows(input: unknown): v.InferOutput<typeof SocketRigCreatureSchema> { return v.parse(SocketRigCreatureSchema, input); }
