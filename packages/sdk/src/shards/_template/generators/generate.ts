// SHARD-SOURCE AP36a: the Template's generator. The world is three.js scene source (scene.ts: the ground and its 22 pieces as
// parts, on the sdk's scene API, Brasscap's shape); the gameplay is rows (data/, behaviour/), added over the scene's
// shardfile by `templateRows`. `wildshard build` runs `generate`; `wildshard watch` reads its describe() and gameplay().
import type { Shardfile } from '@wildshard/format/shardSchema';
import type { GeneratedProject, ProjectGenerationContext } from '@wildshard/sdk/projectGeneration';
import { defineShard, type SceneShard } from '@wildshard/sdk/scene/shard';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { rasterGroundMap } from '@wildshard/sdk/bake/groundMap';
import mapSettings from '../data/map.json' with { type: 'json' };
// SHARD-SOURCE AP37b: the shard's identity is data; `wildshard new` writes a project's own here
import IDENTITY from '../data/identity.json' with { type: 'json' };
import { templateBehaviour, type TemplateBehaviour } from './behaviour';
import { templateBoss } from './boss';
import { templateRows } from './product';
import { templateOutput } from './productOutput';
import { buildTemplate, templateColliders } from './scene';

/** The scripts the last build compiled: `wildshard watch` reads the gameplay rows after its shell's build. */
let compiled: { behaviour: TemplateBehaviour; boss: { hash: string; compressed: number } } | null = null;

function fail(): never { throw new Error('template: the gameplay rows need a build first (its scripts)'); }
/** The rows over the scene's shardfile, with the scripts the last build compiled. */
const rows = (shard: Shardfile): Shardfile => templateRows(shard, compiled?.behaviour ?? fail(), compiled?.boss ?? fail(), templateColliders());
const watched = defineShard(IDENTITY, buildTemplate, { extend: rows });

/** Compile the scripts, build the scene with the rows over it, then paint the map from its ground, tiles and panels. */
async function build(ctx: ProjectGenerationContext): Promise<GeneratedProject> {
  compiled = { behaviour: await templateBehaviour(ctx), boss: await templateBoss(ctx) };
  const { shard, assets } = await builtSceneShardfile(watched.describe(), ctx.compileScript, { extend: rows });
  for (const [hash, bytes] of assets) if (ctx.asset(bytes) !== hash) throw new Error('template: an asset hash differs from the product store');
  if (shard.terrain === null || shard.props === null) throw new Error('template: the scene wrote no terrain or props');
  const map = await rasterGroundMap({ terrain: shard.terrain, assets }, { props: shard.props, assets }, mapSettings.style);
  return { shard, output: templateOutput(compiled.boss), map: { pixels: map.pixels, name: 'ui/map' } };
}

/** The generator `wildshard build` runs, with the scene's describe() and gameplay() for `wildshard watch`. */
export const generate: SceneShard = Object.assign(build, { describe: watched.describe, identity: watched.identity, gameplay: watched.gameplay });
