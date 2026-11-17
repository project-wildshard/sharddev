// SHARD-SOURCE AP15: Mossgate Hollow whole, a shard whose only source is a three.js scene (generators/world.ts).
import { mossgate } from './generators/shard';

/** The scene shard: its generator and its describe() for `wildshard watch`. */
export const generate: typeof mossgate = mossgate;
// oxlint-disable-next-line import/no-default-export -- The author CLI executes this project entry.
export default generate;
