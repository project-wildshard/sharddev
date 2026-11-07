import * as v from 'valibot';
import { CommonsCostSchema as costSchema, CommonsCostsSchema as costsSchema, assertCommonsCosts as assertCosts, type CommonsCosts as Costs } from '@wildshard/format/commonsCosts';

/** Pinned commons bytes declare exact decoded/GPU bytes and triangle/draw counts as nonnegative safe integers. */
export const CommonsCostSchema: v.SchemaWithPipe<readonly [typeof costSchema]> = v.pipe(costSchema);
/** Bounded hash-addressed metadata for at most 1024 distinct required commons assets. */
export const CommonsCostsSchema: v.SchemaWithPipe<readonly [typeof costsSchema]> = v.pipe(costsSchema);
/** Parsed exact residency and geometry costs keyed by the pinned commons content hash. */
export type CommonsCosts = Costs;
/** Refuse missing, extra or malformed cost rows before reading any immutable asset. */
export function assertCommonsCosts(commons: readonly string[], input: unknown): Costs { return assertCosts(commons, input); }
