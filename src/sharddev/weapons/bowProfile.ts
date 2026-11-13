import { parse, type InferOutput } from 'valibot';
import { BowWeaponProfileSchema, HeldBowFileSchema, type HeldBowFileRows } from '@wildshard/format/weaponProfiles';
import STARTER_BOW from '@wildshard/engine/game/weapons/starterBow.json' with { type: 'json' };

/** Named transitional bow view strategy styles: any name the shard's bow view repaints by (`test/sdk-engine-types.test.ts`
 * keeps it equal to the engine's `combat/view/bowProfile` `BowStyle`). */
export type BowStyle = string;

/** Admit a complete authored bow file before its pool or display strategy is borrowed. */
export function parseHeldBowFile(input: unknown): HeldBowFileRows { return parse(HeldBowFileSchema, input); }

/** Admit numeric draw, flight, spread and ammunition policy without a weapon or view service. */
export function parseBowProfile(input: unknown): InferOutput<typeof BowWeaponProfileSchema> { return parse(BowWeaponProfileSchema, input); }

/** Compile an independent shared numeric bow base from its defining committed author table.
 * No wind owner, runtime profile object or view service enters the author result. */
export function sharedBowAuthorBase(): Omit<typeof STARTER_BOW, 'family'> & { family: 'bow' } {
  if (STARTER_BOW.family !== 'bow') throw new Error('Shared bow author base requires the bow family');
  return structuredClone({ ...STARTER_BOW, family: STARTER_BOW.family });
}
