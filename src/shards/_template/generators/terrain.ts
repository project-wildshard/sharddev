import { templateHeightAt } from './landscape';
import { bakeTerrain, type BakedTerrain } from '@wildshard/sharddev/bake/terrain';
import { Color } from 'three';
import layout from '../data/layout.json' with { type: 'json' };

/** Trusted build-time landscape: the legacy seed/noise/trail/pool, levelled under G220's roads and plazas (`cellGround`); no callback enters the shardfile. */
export function templateTerrain(): BakedTerrain & { sites: { door: [number, number, number]; brazierA: [number, number, number] } } {
  const heightAt = templateHeightAt();
  const colour = new Color(0x7e8388);
  return { ...bakeTerrain({ heightAt, colourAt: () => [colour.r, colour.g, colour.b], family: 'pbr' }), sites: { door: [layout.HUT.x, heightAt(layout.HUT.x, layout.HUT.z) + 1.2, layout.HUT.doorZ], brazierA: brazierA(heightAt) } };
}
/** Brazier A's use point (MH-2), 1.7 m over its pad: above the stand's collider (1.5 m), or the prompt's sight line hits it. */
function brazierA(heightAt: (x: number, z: number) => number): [number, number, number] {
  const [x = 3, z = -6] = layout.BRAZIERS[0] ?? []; return [x, heightAt(x, z) + 1.7, z];
}
