// MIRROR-SALT-ZONE MSZ5: the vehicles example, a salt buggy and a land-sail docked on a flat (generators/world.ts).
import { vehicles } from './generators/shard';

/** The scene shard: its generator and its describe() for `wildshard watch`. */
export const generate: typeof vehicles = vehicles;
// oxlint-disable-next-line import/no-default-export -- The author CLI executes this project entry.
export default generate;
