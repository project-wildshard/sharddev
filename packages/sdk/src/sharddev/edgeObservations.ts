// SHARD-COMPAT PR6f2, the SDK half: the built shard file says what stands at each of its four boundaries (`world/edge`'s
// `edgeObservations`, format PR6f1), so the engine's road strips read the file instead of guessing from its own registry.
import type { EdgeObservationsRows } from '@wildshard/format/edgeObservations';
import type { Shardfile } from '@wildshard/format/shardSchema';

const SIDES = ['north', 'east', 'south', 'west'] as const;

/** Each side's observation, from the file's own data, by the engine's registry rule (engine `grid/edgeSources.ts`):
 *  `void` when the world is structures with no terrain under them, else `ground`; open water where the map declares one at
 *  0 m or above (a sea at exactly 0 is kept; below 0 none is reported). */
export function edgeObservationsOf(source: Pick<Shardfile, 'manifest' | 'terrain'>): EdgeObservationsRows {
  const geometry = source.manifest?.ground?.structures === true && source.terrain === null ? 'void' : 'ground';
  const level = source.manifest?.minimap.openWater?.level;
  const row = level === undefined || !Number.isFinite(level) || level < 0 ? { geometry } : { geometry, waterSurface: level };
  return Object.fromEntries(SIDES.map(side => [side, { ...row }])) as unknown as EdgeObservationsRows;
}

/** Write the observations into a product that lacks them; a product that declares its own keeps them. */
export function withEdgeObservations<T extends Pick<Shardfile, 'manifest' | 'terrain' | 'edgeObservations'>>(source: T): T {
  if (source.edgeObservations === undefined) source.edgeObservations = edgeObservationsOf(source);
  return source;
}
