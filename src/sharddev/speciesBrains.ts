import { admitSpeciesProgram, type BrainedSpecies as PlatformBrainedSpecies, type SpeciesBrain as PlatformSpeciesBrain, type SpeciesBrains as PlatformSpeciesBrains } from "@wildshard/engine/game/plugin/brain";

import type { StrikeData } from './species';

/** A species row's declared brain (SHARD-PLATFORM SF27): `{ archetype, data }`, one platform archetype and its data. */
export type SpeciesBrain = PlatformSpeciesBrain;
/** Species gameplay data with an optional `brain`; a row without one keeps its runtime's own policy. */
export type BrainedSpecies = PlatformBrainedSpecies;
/** A catalogue's admitted brains: browser callbacks (`bind`), the live witness and the headless home policies. */
export type SpeciesBrains = PlatformSpeciesBrains;
/**
 * Admit a shard's species catalogue and its strike rows (SF27): each strike passes the SDK's strict strike schema, each
 * declared brain its archetype's schema, and every strike a brain names resolves, before any row or policy is built; a
 * `script` brain's module comes in `modules` (a plain row: its SHA-256 → the base64 its bake wrote) and is admitted on its own
 * ScriptHost.
 */
export function speciesBrains(species: readonly BrainedSpecies[], strikes: readonly StrikeData[], modules: Readonly<Record<string, string>> = {}): SpeciesBrains {
  return admitSpeciesProgram({ species, strikes, modules });
}
