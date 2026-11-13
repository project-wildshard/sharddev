import { templateProduct } from './product';
import { templateTerrain } from './terrain';
import { templatePropRows } from './props';
import type { ProjectGenerationContext, GeneratedProject } from '@wildshard/sdk/projectGeneration';
import { parseShardfile } from '@wildshard/engine/host/shardfile';
import { templateBehaviour } from './behaviour';
import { templateBoss, TEMPLATE_BOSS_INPUTS } from './boss';
import { templateOutput } from './productOutput';
import { rasterGroundMap } from '@wildshard/sdk/bake/groundMap';
import mapSettings from '../data/map.json' with { type: 'json' };

// Edit the build-time declaration to author this project's data.
export async function generate(ctx: ProjectGenerationContext): Promise<GeneratedProject> {
  const behaviour = await templateBehaviour(ctx), boss = await templateBoss(ctx);
  const files = await ctx.cached({ id: 'world-product', inputs: TEMPLATE_BOSS_INPUTS }, async () => {
    const produced = templateTerrain(), { assets, ...terrain } = produced;
    const props = templatePropRows();
    const map = await rasterGroundMap(produced, props, mapSettings.style);
    return new Map([['map.rgba', map.pixels], ['shard.json', new TextEncoder().encode(JSON.stringify(templateProduct(terrain, props, behaviour, boss)))], ...assets, ...props.assets]);
  });
  const metadata = files.get('shard.json');
  if (metadata === undefined) throw new Error('Terrain cache misses shard rows');
  const shard = parseShardfile(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata)));
  for (const [hash, bytes] of files) if (hash !== 'shard.json' && hash !== 'map.rgba' && ctx.asset(bytes) !== hash) throw new Error('Terrain asset hash differs');
  const pixels = files.get('map.rgba'); if (pixels === undefined) throw new Error('Missing generated map lattice');
  return { shard, output: templateOutput(boss), map: { pixels, name: 'ui/map' } };
}
