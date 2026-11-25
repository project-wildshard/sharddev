// The shard is one three.js scene module: `generators/world.ts`. `wildshard build` runs it as the generator;
// `wildshard watch` reads its describe() and streams each saved edit to a running page.
import { shard } from './generators/shard';

export const generate: typeof shard = shard;
// oxlint-disable-next-line import/no-default-export -- The author CLI executes this project entry.
export default generate;
