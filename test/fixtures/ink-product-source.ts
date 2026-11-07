import { inkProduct } from '../../src/shards/ink-cel-valley/generators/product';
import { inkWorld } from '../../src/shards/ink-cel-valley/generators/bake';

const world = inkWorld();
/** GR9: the ink valley's declaration as the build makes it (generate.ts): its baked terrain and props. */
const product: ReturnType<typeof inkProduct> = inkProduct(world.terrain, world.props);
/** The bytes the bake made (`assets/<hash>`, the map painter's names), for proofs that boot the declaration. */
export const inkFiles: ReadonlyMap<string, Uint8Array> = world.files;
// oxlint-disable-next-line import/no-default-export -- The default-product consumer test imports each shard's product as a default.
export default product;
