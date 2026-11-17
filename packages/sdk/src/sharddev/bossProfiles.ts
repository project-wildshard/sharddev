import { parseBossProfile as parse, type BossProfile } from '@wildshard/format/bossProfiles';
import { parseRoamingEncounter } from '@wildshard/format/bossEncounter';
import { RoamingCombatSchema } from '@wildshard/format/roamingCombat';
import { RoamingBossProjectionSchema } from '@wildshard/format/roamingBossProjection';
import { parse as admit } from 'valibot';

/** Admit data-only arena, roaming, spawned, held and script boss policies through the defining runtime schema.
 * This authoring boundary constructs no fight, body, level or service. */
export function parseBossProfile(input: unknown): BossProfile { return parse(input); }

/** Admit encounter resources against the caller's original boss profile, without a fight owner. */
export function roamingEncounterRows(...args: Parameters<typeof parseRoamingEncounter>): ReturnType<typeof parseRoamingEncounter> {
  return parseRoamingEncounter(...args);
}
/** Admit complete combat policy, projection and presentation without installing runtime systems. */
export function roamingCombatRows(input: unknown): ReturnType<typeof admit<typeof RoamingCombatSchema>> { return admit(RoamingCombatSchema, input); }
/** Admit complete rig/effect projection data with the native strict field and numeric rules. */
export function roamingProjectionRows(input: unknown): ReturnType<typeof admit<typeof RoamingBossProjectionSchema>> { return admit(RoamingBossProjectionSchema, input); }
