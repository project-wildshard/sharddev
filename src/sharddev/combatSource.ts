import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { readSpeciesPrograms } from '@wildshard/format/speciesPrograms';
import { legacySwordDebris } from '@wildshard/kit/legacyCombat';

/** Native contacts retain their original policy until every effect target has an admitted ordinary row. */
function nativeContactsNeedMigration(source: Shardfile, sections: ReadonlyMap<string, unknown> | undefined): boolean {
  const payload = sections?.get('actors/species-programs');
  if (payload === undefined) return false;
  const native = readSpeciesPrograms(payload), known = new Set(source.rows.species.map(row => row.id));
  return [...native.page, ...native.native, ...native.program?.species ?? []].some(row =>
    !known.has(row.id) && (legacySwordDebris([row]).overrides?.length ?? 0) > 0);
}

/** Copy each older source's cap and sword policies into ordinary declarations; explicit rows remain authoritative. */
export function expandCombatSource(source: Shardfile, warn: (message: string) => void = console.warn, sections?: ReadonlyMap<string, unknown>): Shardfile {
  const copied = new Set<string>(), retained = new Set<string>(), native = nativeContactsNeedMigration(source, sections), exemptions = source.manifest?.fight?.capExempt ?? [];
  const species = source.rows.species.map(row => {
    if (row.capExempt !== undefined) return row;
    copied.add(`species ${row.id} cap policy`);
    return { ...row, capExempt: exemptions.includes(row.kind) || exemptions.includes(`creature.${row.kind}`) };
  });
  const rows = source.items.rows.map(row => {
    if (row.kind !== 'weapon' || row.profile?.family !== 'melee') return row;
    const profile = row.profile;
    const fill = (move: typeof profile.moves.heavy): typeof profile.moves.heavy => {
      if (move.debris !== undefined) return move;
      if (native) { retained.add(row.id); return move; }
      copied.add(`item ${row.id} contact debris`);
      return { ...move, debris: legacySwordDebris(source.rows.species) };
    };
    return { ...row, profile: { ...profile, moves: { combo: profile.moves.combo.map(fill), heavy: fill(profile.moves.heavy) } } };
  });
  for (const id of retained) warn(`item ${id}: retained native contact policy until its target rows migrate`);
  if (copied.size === 0) return source;
  const expanded = parseShardfile({ ...source, rows: { ...source.rows, species }, items: { ...source.items, rows } }, sections);
  for (const name of copied) warn(`${name}: copied original source combat policy; declare it explicitly`);
  return expanded;
}
