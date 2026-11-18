import { pastelHeightAt } from './landscape';
import { bakeTerrain, type BakedTerrain } from '@wildshard/sdk/bake/terrain';
import { Color } from 'three';
import layout from '../data/layout.json' with { type: 'json' };

/** Trusted build-time landscape, bound to the `ground` preset material (SF59 / G169): the legacy seed/noise/trail/pool, levelled under G220's roads and plazas (`cellGround`); no callback enters the shardfile. */
export function pastelTerrain(): BakedTerrain & { sites: { door: [number, number, number] } } {
  const heightAt = pastelHeightAt();
  const colour = new Color(0x7e8388);
  return { ...bakeTerrain({ heightAt, colourAt: () => [colour.r, colour.g, colour.b], family: 'ground' }), sites: { door: [layout.HUT.x, heightAt(layout.HUT.x, layout.HUT.z) + 1.2, layout.HUT.doorZ] } };
}
