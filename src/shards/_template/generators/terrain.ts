import { pondSDF, templateHeightAt } from './landscape';
import { templateNoise } from './landscapeNoise';
import { bakeTerrain, type BakedTerrain } from '@wildshard/sdk/bake/terrain';
import { Color, SRGBColorSpace } from 'three';
import layout from '../data/layout.json' with { type: 'json' };

/** Trusted build-time landscape: the legacy seed/noise/trail/pool, levelled under G220's roads and plazas (`cellGround`); no callback enters the shardfile. */
export function templateTerrain(): BakedTerrain & { sites: { door: [number, number, number]; braziers: [number, number, number][]; lamplighter: [number, number, number] } } {
  const heightAt = templateHeightAt();
  const colourAt = mossFloor();
  return { ...bakeTerrain({ heightAt, colourAt, family: 'pbr' }), sites: { door: [layout.HUT.x, heightAt(layout.HUT.x, layout.HUT.z) + 1.2, layout.HUT.doorZ], braziers: braziers(heightAt),
    // MH-5: the Lamplighter's feet, on the ground (a talk's `at` is where its figure stands)
    lamplighter: [layout.LAMPLIGHTER.x, heightAt(layout.LAMPLIGHTER.x, layout.LAMPLIGHTER.z), layout.LAMPLIGHTER.z] } };
}
/** Braziers A, B and C's use points (MH-2, MH-3), 1.7 m over their pads: above the stand's collider (1.5 m), or the prompt's sight line hits it. */
function braziers(heightAt: (x: number, z: number) => number): [number, number, number][] {
  return layout.BRAZIERS.map(([x = 0, z = 0]): [number, number, number] => [x, heightAt(x, z) + 1.7, z]);
}

/**
 * TEMPLATES-CLEANROOM M2: the cleanroom's moss floor as vertex colours (no texture): dark, mid and light olive moss mixed
 * by a broad and a clumpy noise, a warm dirt ring round the pond. sRGB palette, returned linear.
 */
function mossFloor(): (x: number, z: number) => [number, number, number] {
  const big = templateNoise(11), clump = templateNoise(12), drift = templateNoise(13);
  const dark = [72, 90, 36], mid = [102, 120, 48], lite = [134, 146, 64], dirt = [120, 104, 80];
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  const mix = (a: number[], b: number[], t: number): number[] => a.map((x, i) => x + ((b[i] ?? 0) - x) * t);
  const c = new Color();
  return (x, z) => {
    const b = big(x * 0.06, z * 0.06) * 0.5 + 0.5, k = clump(x * 0.21, z * 0.21) * 0.5 + 0.5, w = drift(x * 0.018, z * 0.018) * 0.5 + 0.5;
    let col = mix(dark, mid, clamp(b * 1.5 - 0.15));
    col = mix(col, lite, clamp((k - 0.5) * 2.5));
    const tint = [0.96 + (b - 0.5) * 0.3, 0.98 + (b - 0.5) * 0.22, 0.86 + (w - 0.5) * 0.3];
    col = col.map((v, i) => v * (tint[i] ?? 1) * (0.9 + k * 0.15));
    const shore = pondSDF(x, z); // the water's edge (data/water.json)
    if (shore < 1.2) col = mix(col, dirt, clamp((1.2 - shore) / 1.6));
    c.setRGB(clamp((col[0] ?? 0) / 255), clamp((col[1] ?? 0) / 255), clamp((col[2] ?? 0) / 255), SRGBColorSpace);
    return [c.r, c.g, c.b];
  };
}
