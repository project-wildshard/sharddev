import type { GeneratedProject, ProjectGenerationContext } from '@wildshard/sdk/projectGeneration';
import { parseShardfile } from '@wildshard/engine/host/shardfile';
import { inkProduct } from './product';
import { inkMapPixels } from './mapProgram';
import { inkWorld } from './bake';

/** GR9 (G783): the ink valley's terrain, props, map and declaration, baked together in the build; only immutable
 *  cache / product files are emitted (no launcher writes the source tree). */
export async function generate(ctx: ProjectGenerationContext): Promise<GeneratedProject> {
  const files = await ctx.cached({ id: 'world-product', native: true }, async () => {
    const world = inkWorld(), pixels = await inkMapPixels(world.files);
    const assets = [...world.files].filter(([path]) => path.startsWith('assets/')).map(([path, bytes]) => [path.slice('assets/'.length), bytes] as const);
    return new Map([['map.rgba', pixels], ['shard.json', new TextEncoder().encode(JSON.stringify(inkProduct(world.terrain, world.props)))], ...assets]);
  });
  const metadata = files.get('shard.json'), pixels = files.get('map.rgba');
  if (metadata === undefined || pixels === undefined) throw new Error('Missing Ink world or map lattice');
  for (const [hash, bytes] of files) if (hash !== 'shard.json' && hash !== 'map.rgba' && ctx.asset(bytes) !== hash) throw new Error('Ink asset hash differs');
  return { shard: parseShardfile(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata))), output: {}, map: { pixels } };
}
