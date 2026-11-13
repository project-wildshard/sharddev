// A species row and its declared brain, as the SDK defines them (SHARD-AUTHORING SA12). The row is gameplay data and the
// brain one platform archetype with its shard-format data; `test/sdk-engine-types.test.ts` keeps both equal to the engine's
// (game/plugin/brain), so a drift in either fails the test.
import type * as v from 'valibot';
import type { BorrowedDecision } from '@wildshard/format/decisionScripts';
import type { ScriptSpeciesSchema } from '@wildshard/format/speciesScripts';
import type { CreatureBodyRecipe } from '@wildshard/format/creatures';
import type { GrazerSchema, ChallengeGrazerSchema } from '@wildshard/format/grazers';
import type { DiverSchema, PatrolDiverSchema } from '@wildshard/format/flyers';
import type { StalkerSchema, GuardianPatternsSchema, SkirmisherSchema, GuardianSchema, PerchHunterSchema } from '@wildshard/format/brains';
import { admitSpeciesProgram, type SpeciesBrains } from '@wildshard/engine/game/plugin/brain';

import type { StrikeData } from './species';

/**
 * A species row's declared brain (SHARD-PLATFORM SF27): `{ archetype, data }`, one platform archetype and its data. A
 * challenge grazer's circling phase is the actor seed's slot in `[0, phaseSlots)`, so a pack spreads round its home. A
 * `decision` brain lends its body to an admitted guest while the existing encounter owns its memory marks.
 */
export type SpeciesBrain =
  | { readonly archetype: 'grazer'; readonly data: Extract<v.InferInput<typeof GrazerSchema>, { pattern: 'wander-ram' }> }
  | { readonly archetype: 'grazer'; readonly data: Extract<v.InferInput<typeof GrazerSchema>, { pattern: 'circle-challenge' }>; readonly phaseSlots: number }
  | { readonly archetype: 'diver'; readonly data: v.InferInput<typeof DiverSchema> }
  | { readonly archetype: 'decision'; readonly data: BorrowedDecision }
  | { readonly archetype: 'challenge-grazer'; readonly data: v.InferInput<typeof ChallengeGrazerSchema>; readonly phaseSlots: number }
  | { readonly archetype: 'patrol-diver'; readonly data: v.InferInput<typeof PatrolDiverSchema> }
  | { readonly archetype: 'script'; readonly data: v.InferInput<typeof ScriptSpeciesSchema> }
  | { readonly archetype: 'stalker'; readonly data: v.InferInput<typeof StalkerSchema> }
  | { readonly archetype: 'skirmisher'; readonly data: v.InferInput<typeof SkirmisherSchema> }
  | { readonly archetype: 'guardian'; readonly data: v.InferInput<typeof GuardianSchema> | v.InferInput<typeof GuardianPatternsSchema> }
  | { readonly archetype: 'perch-hunter'; readonly data: v.InferInput<typeof PerchHunterSchema> };

/** A variant's rarity. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** Per-variant gameplay multipliers, applied at spawn on top of the species' hunt tuning. */
export interface VariantMods {
  /** × runSpeed / trotSpeed / charge speed (1 = species baseline) */
  speed: number;
  /** × panicDist (the charge trigger) and the "turns on you when hit" distance */
  chargeDist: number;
  /** × damage taken by BODY hits (headshots always land in full) */
  damageTaken: number;
  /** damage dealt to the player by one charge contact (species default 25) */
  chargeDamage: number;
  /** charges last 3× longer, cool down in 1/3 the time, and a hit always provokes one */
  relentless: boolean;
}

/** One variant of a species: gameplay data only, never a builder, palette or hull. */
export interface SpeciesVariant {
  id: string; label: string; weight: number; rarity: Rarity; scale: [number, number];
  hp?: number; mods?: Partial<VariantMods>;
}

/** One animal kind's hunting-loop numbers (m, s, rad, awareness/s). Player speeds: crouch 2.2, walk 4.3, sprint 7.2 m/s. */
export interface HuntTuning {
  hp: number;
  sightRange: number; sightRangeGraze: number; sightCone: number;
  hearStill: number; hearCrouch: number; hearWalk: number; hearSprint: number;
  noticeRate: number; forgetRate: number; alertAt: number; boltAt: number;
  freezeMin: number; freezeMax: number; relaxAfter: number; panicDist: number;
  runSpeed: number; trotSpeed: number; fleeMinTime: number; fleeUntil: number; fleeUntilMax: number; fleeMaxTime: number;
  lookBack: number; waryTime: number; waryBoost: number;
  herdAlertRadius: number; herdBoltDelayMin: number; herdBoltDelayMax: number;
  impactSpook: number; impactAlert: number;
  /** Hunters: the alert turns into a pursuit ('stalk') instead of a bolt. */
  stalk?: {
    detect: number; speed: number; giveUp: number; rechargeCd: number; huffMin: number; huffMax: number;
    /** sound played at the start of a charge */
    roar: string;
    fleeBelowHp: number; fleeChance: number;
  } | undefined;
}

/** A flying species' altitude and climb, dive and bank limits. */
export interface SpeciesFlight {
  altitude: number;
  /** Ground-relative by default; a missing/distant floor falls back to world altitude. */
  above?: 'ground' | 'world';
  climbRate: number; diveRate: number;
  /** Lock acquire distance in metres (eye → body edge); default 24 m, release at 1.5×. */
  lockRange?: number;
  /** The largest roll into a turn, radians (0 < bank < π/2); omitted, the body flies level. */
  bank?: number;
}

/** Species gameplay data with an optional `brain`; a row without one keeps its runtime's own policy. */
export interface BrainedSpecies {
  id: string; kind: string; label: string;
  variants: SpeciesVariant[]; spawnOnly?: SpeciesVariant[];
  aggressive?: boolean; walkSpeed?: number; chargeSpeed?: number; chargeDamage?: number;
  /** s / m / m: the charge's wind-up, the ring a charger circles on, the grass track it flattens */
  chargeWindup?: number; ringRadius?: number; trampleRadius?: number;
  tuning?: HuntTuning;
  sounds?: { call: string; hurt: string; callVariants?: string[]; callEvery?: [number, number] };
  tick?: 'ai' | 'always';
  corpseFade?: number; blood?: boolean;
  flight?: SpeciesFlight;
  /** LOCK / target taps: omitted ground species are not lockable; omitted flight species are. */
  lockable?: boolean;
  readonly brain?: SpeciesBrain;
  readonly body?: CreatureBodyRecipe;
}

/**
 * Admit a shard's species catalogue and its strike rows (SF27): each strike passes the SDK's strict strike schema, each
 * declared brain its archetype's schema, and every strike a brain names resolves, before any row or policy is built; a
 * `script` brain's module comes in `modules` (a plain row: its SHA-256 → the base64 its bake wrote) and is admitted on its own
 * ScriptHost. The admitted catalogue is the engine's runtime (game/plugin/brain `SpeciesBrains`), not author data.
 */
export function speciesBrains(species: readonly BrainedSpecies[], strikes: readonly StrikeData[], modules: Readonly<Record<string, string>> = {}): SpeciesBrains {
  return admitSpeciesProgram({ species, strikes, modules });
}
