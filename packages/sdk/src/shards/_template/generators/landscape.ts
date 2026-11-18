import { roadSocketMetrics } from '@wildshard/sdk/entries';
import layout from '../data/layout.json' with { type: 'json' };
import { cellGround } from './ground';
import { templateNoise } from './landscapeNoise';
import { Color, SRGBColorSpace } from 'three';

// Retained authored entry grading: 15 m road, reaching 60 m into the cell.
const ROAD_WIDTH = 15, ROAD_LENGTH = 60;
/** Half the 500 m cell, from the platform's road-socket dimensions. */
const CHUNK_HALF = roadSocketMetrics().half;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function trailDistance(x: number, z: number): number {
  let distance = Infinity;
  for (const poly of layout.TRAIL) for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    if (a === undefined || b === undefined) continue;
    const [ax, az] = a, [bx, bz] = b;
    if (ax === undefined || az === undefined || bx === undefined || bz === undefined) throw new Error('Template trail requires coordinate pairs');
    const vx = bx - ax, vz = bz - az, wx = x - ax, wz = z - az;
    const length = vx * vx + vz * vz;
    const t = length > 0 ? Math.min(1, Math.max(0, (wx * vx + wz * vz) / length)) : 0;
    const dx = x - (ax + vx * t), dz = z - (az + vz * t);
    distance = Math.min(distance, dx * dx + dz * dz);
  }
  return Math.sqrt(distance);
}

/** TEMPLATES-CLEANROOM M2: the pond is the cleanroom's rounded rectangle (layout.POND: centre, half extents, corner radius;
 * data/water.json is the same outline as a 32-point polygon). Its bowl shelves from −0.375 m at the water's edge down to −3 m
 * at 37°, so the 257² lattice keeps a beach inside the edge (shallower than the swim's 1.05 m stand-up). An old cliff at the
 * edge smeared into a pit wall too steep to climb: Jake, 2026-11-12, "glitched into the pond cant use shift to surface". */
export const POND = { ...layout.POND, bed: -3, edge: -0.375, shelf: 0.75 } as const;
/** Signed distance to the pond's edge in metres: negative in the water, positive on the bank. */
export function pondSDF(x: number, z: number): number {
  const qx = Math.abs(x - POND.x) - POND.hx + POND.r, qz = Math.abs(z - POND.z) - POND.hz + POND.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - POND.r;
}
/** The pond's floor at signed distance `d` from its edge. */
export const pondFloor = (d: number): number => Math.max(POND.bed, POND.edge + d * POND.shelf);
/** The point on the pond's edge in direction `a` (radians from +x) from its centre, `out` metres past it. */
export function pondEdge(a: number, out = 0): [number, number] {
  let r = Math.min(POND.hx, POND.hz);
  for (let k = 0; k < 40; k++) r -= (pondSDF(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r) - out) * 0.8;
  return [POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r];
}

/** The retained Template author height law: seeded yard, pool, trail bed, flat roads and entry ramps.
 * No runtime field, registry, render service or captured height grid is read. */
export function templateHeightAt(seed = 357): (x: number, z: number) => number {
  const noise = templateNoise(seed);
  return (x, z) => {
    let height = Math.min(noise(x * 0.015, z * 0.015) * 0.5, pondFloor(pondSDF(x, z)));
    height -= smoothstep(9, 2.5, trailDistance(x, z)) * 0.35;
    height = cellGround(x, z, height);
    const half = ROAD_WIDTH / 2 + 3;
    const along = (a: number, b: number): number => smoothstep(half + 22, half, Math.abs(a))
      * smoothstep(CHUNK_HALF - ROAD_LENGTH - 25, CHUNK_HALF - ROAD_LENGTH + 5, Math.abs(b));
    const road = Math.max(along(x, z), along(z, x));
    if (road > 0) {
      const inward = CHUNK_HALF - Math.max(Math.abs(x), Math.abs(z));
      const ramp = smoothstep(ROAD_LENGTH - 15, ROAD_LENGTH + 30, inward);
      height = lerp(lerp(0, height, ramp), height, 1 - road);
    }
    return height;
  };
}

/**
 * TEMPLATES-CLEANROOM M2: the cleanroom's moss floor as vertex colours (no texture): dark, mid and light olive moss mixed
 * by a broad and a clumpy noise, a warm dirt ring round the pond. sRGB palette, returned linear.
 */
export function mossFloor(): (x: number, z: number) => [number, number, number] {
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

type Site = [number, number, number];
/** Where the gameplay rows stand on this ground: the hut door, braziers A to C, the NPCs' feet and the props' prompts. */
export function templateSites(heightAt: (x: number, z: number) => number): { door: Site; braziers: Site[]; lamplighter: Site; chest: Site; hermit: Site; rack: Site; lever: Site } {
  return { door: [layout.HUT.x, heightAt(layout.HUT.x, layout.HUT.z) + 1.2, layout.HUT.doorZ],
    // MH-2, MH-3: braziers A, B and C's use points, 1.7 m over their pads: above the stand's collider (1.5 m), or the prompt's sight line hits it
    braziers: layout.BRAZIERS.map(([x = 0, z = 0]): Site => [x, heightAt(x, z) + 1.7, z]),
    // MH-5: the Lamplighter's feet, on the ground (a talk's `at` is where its figure stands)
    lamplighter: [layout.LAMPLIGHTER.x, heightAt(layout.LAMPLIGHTER.x, layout.LAMPLIGHTER.z), layout.LAMPLIGHTER.z],
    // TC-M5: the old chest's lid, where its prompt stands
    chest: [layout.CHEST.x, heightAt(layout.CHEST.x, layout.CHEST.z) + 0.6, layout.CHEST.z],
    // TC-M6: the Pond Hermit's feet, on the pond's north bank
    hermit: [layout.HERMIT.x, heightAt(layout.HERMIT.x, layout.HERMIT.z), layout.HERMIT.z],
    // TC-M5b (J361): the iron sword's rack by the yard, where its prompt stands
    rack: [layout.RACK.x, heightAt(layout.RACK.x, layout.RACK.z) + 1, layout.RACK.z],
    // TC-M4: the south gate's lever, inside the yard by the south wall, where its prompt stands
    lever: [layout.LEVER.x, heightAt(layout.LEVER.x, layout.LEVER.z) + 1, layout.LEVER.z] };
}
