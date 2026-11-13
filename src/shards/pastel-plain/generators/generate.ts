import type { GeneratedProject, ProjectGenerationContext } from '@wildshard/sdk/projectGeneration';
import { parseShardfile } from '@wildshard/engine/host/shardfile';
import { bakeProps } from '@wildshard/sdk/bake/props';
import { rasterGroundMap } from '@wildshard/sdk/bake/groundMap';
import { pastelTerrain } from './terrain';
import { pastelProps } from './props';
import { pastelProduct } from './product';
import { pastelBehaviour, PASTEL_BEHAVIOUR_INPUTS } from './behaviour';
import mapSettings from '../data/map.json' with { type: 'json' };

/** Execute the original author laws once; only immutable cache/product files are emitted. */
export async function generate(ctx: ProjectGenerationContext): Promise<GeneratedProject> {
  const behaviour = await pastelBehaviour(ctx);
  const files = await ctx.cached({ id: 'world-product', inputs: PASTEL_BEHAVIOUR_INPUTS }, async () => {
    const produced = pastelTerrain(), { assets, ...terrain } = produced, fixture = pastelProps(20);
    try {
      const props = bakeProps(fixture.source), map = await rasterGroundMap(produced, props, mapSettings.style);
      return new Map([['map.rgba', map.pixels], ['shard.json', new TextEncoder().encode(JSON.stringify(pastelProduct(terrain, props, behaviour)))], ...assets, ...props.assets]);
    } finally { fixture.dispose(); }
  });
  const metadata = files.get('shard.json'), pixels = files.get('map.rgba');
  if (metadata === undefined || pixels === undefined) throw new Error('Missing Pastel world or map lattice');
  for (const [hash, bytes] of files) if (hash !== 'shard.json' && hash !== 'map.rgba' && ctx.asset(bytes) !== hash) throw new Error('Pastel asset hash differs');
  return { shard: parseShardfile(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata))), output: {}, map: { pixels } };
}
