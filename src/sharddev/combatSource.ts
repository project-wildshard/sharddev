import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { readSpeciesPrograms } from '@wildshard/format/speciesPrograms';
import { legacySwordDebris } from '@wildshard/kit/legacyCombat';

/** Ordinary declarations retain their identity; native declarations complete
 * the same namespace before the kit writes explicit item effects. */
function contactSpecies(source: Shardfile, sections: ReadonlyMap<string, unknown> | undefined): readonly Readonly<{id: string; kind: string}>[] {
  const rows = new Map(source.rows.species.map(row => [row.id, row] as const));
  const payload = sections?.get('actors/species-programs');
  if (payload === undefined) return [...rows.values()];
  const native = readSpeciesPrograms(payload);
  const roster: Readonly<{id: string; kind: string}>[] = [...rows.values()];
  const known = new Set(rows.keys());
  for (const row of [...native.page, ...native.native, ...native.program?.species ?? []]) {
    if (known.has(row.id)) continue;
    known.add(row.id); roster.push(row);
  }
  return roster;
}

/** Copy each older source's cap and sword policies into ordinary declarations; explicit rows remain authoritative. */
export function expandCombatSource(source: Shardfile, warn: (message: string) => void = console.warn, sections?: ReadonlyMap<string, unknown>): Shardfile {
  const copied = new Set<string>(), contacts = contactSpecies(source, sections), exemptions = source.manifest?.fight?.capExempt ?? [];
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
      copied.add(`item ${row.id} contact debris`);
      return { ...move, debris: legacySwordDebris(contacts) };
    };
    return { ...row, profile: { ...profile, moves: { combo: profile.moves.combo.map(fill), heavy: fill(profile.moves.heavy) } } };
  });
  if (copied.size === 0) return source;
  const expanded = parseShardfile({ ...source, rows: { ...source.rows, species }, items: { ...source.items, rows } }, sections);
  for (const name of copied) warn(`${name}: copied original source combat policy; declare it explicitly`);
  return expanded;
}
