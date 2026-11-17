import { registerWeaponFamily } from '@wildshard/engine/game/plugin/weaponFamily';

/** runtime/ only: register an existing constructor in the explicit session-local registry. */
export function weaponFamilyExample(
  registry: Parameters<typeof registerWeaponFamily>[0],
  existingFamily: Parameters<typeof registerWeaponFamily>[2],
) {
  registerWeaponFamily(registry, 'template.practice', existingFamily);
  return registry;
}
