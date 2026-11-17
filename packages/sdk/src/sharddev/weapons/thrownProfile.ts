import { parse, type InferOutput } from 'valibot';
import { ThrownWeaponProfileSchema } from '@wildshard/format/weaponProfiles';

/** Numeric thrown policy with the legacy item identity, shared with its existing owner. */
export type ThrownProfile = Omit<InferOutput<typeof ThrownWeaponProfileSchema>, 'family'> & { id: `weapon.${string}` };

/** Admit complete finite throwing, flight, damage and pickup policy before authoring its view. */
export function parseThrownWeaponProfile(input: unknown): InferOutput<typeof ThrownWeaponProfileSchema> {
  return parse(ThrownWeaponProfileSchema, input);
}
