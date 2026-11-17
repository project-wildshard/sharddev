// AUTHORING-PARITY AP7: a shard whose only source is a three.js scene (generators/world.ts).
import { slice } from './generators/shard';

/** The scene shard: its generator and its describe() for `wildshard watch`. */
export const generate: typeof slice = slice;
// oxlint-disable-next-line import/no-default-export -- The author CLI executes this project entry.
export default generate;
