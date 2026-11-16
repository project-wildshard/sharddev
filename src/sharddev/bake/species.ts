import { commonSpeciesRows as kitSpeciesRows } from '@wildshard/kit/species';
import { withBodyGeometry } from '@wildshard/kit/geometry/common';
import type { Paint } from '@wildshard/kit/geometry/loft';
import type { VariantDef } from '@wildshard/kit/geometry/types';
import { readSpecies, SpeciesSchema, type SpeciesData } from '@wildshard/format/speciesPrograms';

/** Build-only extraction of gameplay fields from a resolved species. Visual variants stay with their look;
 * a species with native think/act callbacks refuses instead of silently discarding its behaviour. */
export function bakeSpecies(row: { variants: readonly SpeciesData['variants'][number][]; spawnOnly?: readonly SpeciesData['variants'][number][]; think?: unknown; act?: unknown }, speciesId: string): SpeciesData {
  if (row.think !== undefined || row.act !== undefined) throw new Error('Species programmes require callback-free gameplay rows');
  const fields: Record<string, unknown> = { id: speciesId };
  for (const key of Object.keys(SpeciesSchema.entries)) {
    if (key === 'id' || key === 'variants' || key === 'spawnOnly' || !Object.hasOwn(row, key)) continue;
    const value: unknown = Reflect.get(row, key); fields[key] = value;
  }
  const variant = ({ id, label, weight, rarity, scale, hp, mods }: SpeciesData['variants'][number]): SpeciesData['variants'][number] =>
    ({ id, label, weight, rarity, scale, ...(hp === undefined ? {} : { hp }), ...(mods === undefined ? {} : { mods }) });
  fields['variants'] = row.variants.map(variant);
  if (row.spawnOnly !== undefined) fields['spawnOnly'] = row.spawnOnly.map(variant);
  return readSpecies(fields);
}

/** Admit fresh shared boar/bear gameplay metadata; no live species or parent identity escapes. */
export function commonSpeciesRows(kind: 'boar' | 'bear', speciesId: string): SpeciesData {
  return kitSpeciesRows(kind, speciesId);
}

/** Derive callback-free author data, preserving inherited fields and the original tuning merge. */
export function deriveSpeciesRows(parent: SpeciesData, patch: Partial<SpeciesData> & { id: string }): SpeciesData {
  const row = { ...parent, ...patch };
  if (parent.tuning !== undefined && patch.tuning !== undefined) row.tuning = { ...parent.tuning, ...patch.tuning };
  return readSpecies(row);
}


/** Existing author recipes build in the kit's explicit low-poly context. */
export function withSpeciesGeometry<T>(paints: Readonly<Record<string, (variant?: VariantDef) => Paint>>, run: () => T): T {
  return withBodyGeometry(true, paints, run);
}
