/**
 * AUTHORING-PARITY: `@wildshard/sdk/scene/shard`, the author's entry for a shard written as three.js source.
 *
 * ```ts
 * import * as THREE from 'three';
 * import { defineShard } from '@wildshard/sdk/scene/shard';
 * import { paint, solid, Water } from '@wildshard/sdk/scene/author';
 * export default defineShard({ slug: 'mossgate', name: 'Mossgate Hollow' }, (world) => {
 *   world.part('hut', (hut) => hut.add(solid(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.3), stone))));
 * });
 * ```
 *
 * `wildshard build` runs the default export as the shard's generator (the shardfile back end, `shardfile.ts`);
 * `wildshard watch` calls its `describe()` and streams the parts to a running page (`../watch`).
 */
import type { ProjectGenerationContext, GeneratedProject } from '../projectGeneration';
import type { ShardWorld } from './author';
import type { ShardIdentityInput, ShardScene } from './description';
import { lowerShard } from './lower';
import { compileShardfile, type ShardfileOptions } from './shardfile';
import { liveShell } from '../watch/encode';


/** A shard written as a scene: the generator `wildshard build` runs, plus the scene `wildshard watch` reads. */
export interface SceneShard {
  (ctx: ProjectGenerationContext): Promise<GeneratedProject>;
  /** Run the author's build once on a fresh scene and read it (compile time only). */
  readonly describe: () => ShardScene;
  readonly identity: ShardIdentityInput;
}

/** Declare a shard as a three.js scene. The build function runs at compile time only, never in a page or on a server. */
export function defineShard(identity: ShardIdentityInput, build: (world: ShardWorld) => void, options: ShardfileOptions = {}): SceneShard {
  const describe = (): ShardScene => lowerShard(identity, build);
  // `wildshard watch` builds the page's shell only: the dev scene host draws the parts (SHARD-SOURCE AP6)
  const generate = (ctx: ProjectGenerationContext): Promise<GeneratedProject> => compileShardfile(process.env['WILDSHARD_SCENE_LIVE'] === '1' ? liveShell(describe()) : describe(), ctx, options);
  return Object.assign(generate, { describe, identity });
}
