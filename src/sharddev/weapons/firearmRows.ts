import * as v from 'valibot';
import { FirearmWeaponProfileSchema, parseHeldFirearmRows as parseRows, parseHeldFirearmView as parseView } from '@wildshard/format/weaponProfiles';

/** Admit numeric firearm timing, action, ammunition and range policy through its defining strict schema. */
export function parseFirearmProfile(input: unknown): v.InferOutput<typeof FirearmWeaponProfileSchema> {
  return v.parse(FirearmWeaponProfileSchema, input);
}
/** Admit owned firearm model, mount and playback metadata without a renderer or weapon service. */
export function parseHeldFirearmRows(input: unknown): ReturnType<typeof parseRows> { return parseRows(input); }
/** Admit native presentation clocks and transforms without installing a view. */
export function parseHeldFirearmView(input: unknown): ReturnType<typeof parseView> { return parseView(input); }
