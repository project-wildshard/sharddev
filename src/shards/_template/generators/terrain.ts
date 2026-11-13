import { templateHeightAt } from './landscape';
import { bakeTerrain, type BakedTerrain } from '@wildshard/sdk/bake/terrain';
import { Color } from 'three';
import layout from '../data/layout.json' with { type: 'json' };

/** Trusted build-time landscape: the legacy seed/noise/trail/pool, levelled under G220's roads and plazas (`cellGround`); no callback enters the shardfile. */
export function templateTerrain(): BakedTerrain & { sites: { door: [number, number, number]; braziers: [number, number, number][]; lamplighter: [number, number, number] } } {
  const heightAt = templateHeightAt();
  const colour = new Color(0x7e8388);
  return { ...bakeTerrain({ heightAt, colourAt: () => [colour.r, colour.g, colour.b], family: 'pbr' }), sites: { door: [layout.HUT.x, heightAt(layout.HUT.x, layout.HUT.z) + 1.2, layout.HUT.doorZ], braziers: braziers(heightAt),
    // MH-5: the Lamplighter's feet, on the ground (a talk's `at` is where its figure stands)
    lamplighter: [layout.LAMPLIGHTER.x, heightAt(layout.LAMPLIGHTER.x, layout.LAMPLIGHTER.z), layout.LAMPLIGHTER.z] } };
}
/** Braziers A, B and C's use points (MH-2, MH-3), 1.7 m over their pads: above the stand's collider (1.5 m), or the prompt's sight line hits it. */
function braziers(heightAt: (x: number, z: number) => number): [number, number, number][] {
  return layout.BRAZIERS.map(([x = 0, z = 0]): [number, number, number] => [x, heightAt(x, z) + 1.7, z]);
}
