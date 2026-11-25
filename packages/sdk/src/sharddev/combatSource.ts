import { compileIncomingCapPolicy } from '@wildshard/format/incomingCapPolicy';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { legacySwordDebris } from '@wildshard/kit/legacyCombat';

/** The species a sword's contact debris reads: the ordinary declarations (FORMAT-PRUNE FP20 retired the native programs). */
function contactSpecies(source: Shardfile): readonly Readonly<{id: string; kind: string}>[] {
  return source.rows.species;
}

/** Copy each older source's cap and sword policies into ordinary declarations; explicit rows remain authoritative. */
export function expandCombatSource(source: Shardfile, warn: (message: string) => void = console.warn, sections?: ReadonlyMap<string, unknown>): Shardfile {
  const copied = new Set<string>(), contacts = contactSpecies(source);
  const fight = source.manifest?.fight, capExemptTags = compileIncomingCapPolicy(fight ?? {});
  const compileFight = fight !== undefined && fight.capExemptTags === undefined;
  if (compileFight) copied.add('manifest exact cap tags');
  const species = source.rows.species.map(row => {
    if (row.capExempt !== undefined || capExemptTags.length > 0) return row;
    copied.add(`species ${row.id} cap policy`);
    return { ...row, capExempt: false };
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
  const expanded = parseShardfile({ ...source,
    ...(compileFight && source.manifest !== undefined ? { manifest: { ...source.manifest, fight: { ...fight, capExemptTags } } } : {}), rows: { ...source.rows, species }, items: { ...source.items, rows } }, sections);
  for (const name of copied) warn(`${name}: copied original source combat policy; declare it explicitly`);
  return expanded;
}
