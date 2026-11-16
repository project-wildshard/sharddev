import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { legacySwordDebris } from '@wildshard/kit/legacyCombat';

/** Copy each older source's cap and sword policies into ordinary declarations; explicit rows remain authoritative. */
export function expandCombatSource(source: Shardfile, warn: (message: string) => void = console.warn): Shardfile {
  const copied = new Set<string>(), exemptions = source.manifest?.fight?.capExempt ?? [];
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
      return { ...move, debris: legacySwordDebris(source.rows.species) };
    };
    return { ...row, profile: { ...profile, moves: { combo: profile.moves.combo.map(fill), heavy: fill(profile.moves.heavy) } } };
  });
  if (copied.size === 0) return source;
  const expanded = parseShardfile({ ...source, rows: { ...source.rows, species }, items: { ...source.items, rows } });
  for (const name of copied) warn(`${name}: copied original source combat policy; declare it explicitly`);
  return expanded;
}
