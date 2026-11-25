// A bare scene: a blue sky over flat green ground, lit by a sky and a sun. `defineShard` (shard.ts) runs it at build time.
import { Color, DirectionalLight, HemisphereLight } from 'three';
import { max, mix, smoothstep, vec3 } from 'three/tsl';
import { skyRay, type ShardWorld } from '@wildshard/sdk/scene/author';
import type { GraphValue } from '@wildshard/sdk/materials';

/** Sky colours, linear RGB: pale at the horizon, deep blue overhead. */
const HORIZON = new Color('#bfe0ff');
const ZENITH = new Color('#2f74d0');
/** The grass colour every point of the ground takes. */
const GRASS: [number, number, number] = [0.32, 0.62, 0.24];

/** A plain blue gradient along the view ray. */
function blueSky(): GraphValue {
  const up = max(skyRay.y, 0);
  return mix(vec3(HORIZON.r, HORIZON.g, HORIZON.b), vec3(ZENITH.r, ZENITH.g, ZENITH.b), smoothstep(0, 0.6, up));
}

/** Sky, light, flat ground and the spawn point. */
export function buildWorld(world: ShardWorld): void {
  world.sky(blueSky(), { environment: { intensity: 0.5, ground: GRASS } });
  world.part('light', part => {
    part.add(new HemisphereLight(new Color('#cfe6ff'), new Color('#4a6a2c'), 0.9));
    const sun = new DirectionalLight(new Color('#fff4e0'), 2.4);
    sun.position.set(-30, 40, 20);
    sun.castShadow = true;
    part.add(sun, sun.target);
  });
  world.ground(() => 0, { colourAt: () => GRASS });
  world.spawn(0, 0, 0, 0);
}
