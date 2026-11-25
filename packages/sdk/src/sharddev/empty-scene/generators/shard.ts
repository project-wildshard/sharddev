import { defineShard, type SceneShard } from '@wildshard/sdk/scene/shard';
import identity from '../identity.json' with { type: 'json' };
import { buildWorld } from './world';

/** This shard: the scene `world.ts` builds, under this project's identity (`identity.json`). */
export const shard: SceneShard = defineShard(identity, buildWorld);
