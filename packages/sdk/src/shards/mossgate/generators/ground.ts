// MOSSGATE-ZONE MZ10 (J452, Jake 2026-11-19: "We should use way more the 500 by 500 meter"): ground across the cell. Each
// region of the cell map (layout.ts) has its own relief: the meadow rolls, the thicket is hummocky, the downs swell, the bog
// sinks into hollows, the quarry is a dug pit with a rim, and the ridge climbs to the lookout. Between regions the wilds roll
// gently. The yard stays the cleanroom's flat floor; the four entry roads stay at road height for their last 60 m and every
// cell edge fades to 0, so the grid's seams and the cook's 50 m entry walks meet flat ground. North is -z.
import * as THREE from 'three';
import { ENTRIES, HALF, PATHS, PLACES, REGIONS, type Rect } from './layout';
import * as T from './textures';

const noise = T.makeNoise(410);
const sstep = THREE.MathUtils.smoothstep;
/** How far past its rect a region's relief fades into the wilds. */
const FEATHER = 28;
/** The yard's flat floor: the cleanroom's ground ends 48 m from (4, -2), and the relief is whole by 72 m. */
const YARD = { x: 4, z: -2, flat: 48, whole: 72 };

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no place ${id}`);
  return found;
};
const LOOKOUT = place('ridge.lookout'), PIT = place('quarry.pit'), MERE = place('bog.mere'), BARROW = place('downs.barrow');

/** Outward distance from (x, z) to `rect` (0 inside). */
function outside(rect: Rect, x: number, z: number): number {
  return Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1));
}

/** Rolling ground about 0 m: amplitude `amp`, features about 1 / `freq` metres across. */
const roll = (x: number, z: number, freq: number, amp: number, off: number): number => (noise.fbm(x * freq + off, z * freq + off * 0.7, 3) - 0.47) * 2 * amp;

/** Each region's relief at (x, z), in metres. */
const RELIEF: Record<string, (x: number, z: number) => number> = {
  yard: () => 0,
  // long low swells, a picnic of a walk
  meadow: (x, z) => 0.8 + roll(x, z, 0.014, 3, 11) + roll(x, z, 0.04, 0.8, 13),
  // hummocks under the trees, rougher and closer
  thicket: (x, z) => 1.2 + roll(x, z, 0.03, 3.4, 23) + roll(x, z, 0.012, 1.6, 31),
  // broad downs rising east, the barrow ring on a level crown
  downs: (x, z) => {
    const rise = 2 + 4 * sstep(x, 80, 200) + roll(x, z, 0.011, 2.4, 41);
    const crown = 1 - sstep(Math.hypot(x - BARROW.x, z - BARROW.z), 16, 34);
    return rise * (1 - crown) + 4.2 * crown;
  },
  // sunk below the yard: hollows of standing water and dry hummocks, Wisp Mere the deepest
  bog: (x, z) => {
    const mere = 1 - sstep(Math.hypot(x - MERE.x, z - MERE.z), 8, 34);
    return -1.3 + roll(x, z, 0.045, 1.1, 53) - 1.6 * mere;
  },
  // a dug pit with a raised spoil rim; the road from the yard runs down its north side
  quarry: (x, z) => {
    const d = Math.hypot(x - PIT.x, z - PIT.z);
    return 0.5 + roll(x, z, 0.035, 1.4, 61) - 6.5 * (1 - sstep(d, 14, 40)) + 2.2 * sstep(d, 32, 44) * (1 - sstep(d, 46, 64));
  },
  // a ridge climbing north-west to the lookout's level top
  ridge: (x, z) => {
    const d = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z), top = 15;
    return top * (1 - sstep(d, 10, 120)) + roll(x, z, 0.03, 1.8, 71) * sstep(d, 8, 20);
  },
};

/** The wilds between regions: a gentle roll. */
const wilds = (x: number, z: number): number => 0.6 + roll(x, z, 0.018, 3.2, 83) + roll(x, z, 0.05, 0.6, 89);

/** Distance from (x, z) to segment a-b. */
function segment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz, t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
const LINES: (readonly [number, number, number, number])[] = [
  ...ENTRIES.map((e) => [e.gate[0], e.gate[1], e.to[0], e.to[1]] as const),
  ...PATHS.flatMap((p) => p.points.slice(1).map((b, i) => { const a = p.points[i] ?? b; return [a[0], a[1], b[0], b[1]] as const; })),
];
/** Distance to the nearest road or path (layout.ts). */
export function roadDistance(x: number, z: number): number {
  let best = Infinity;
  for (const [ax, az, bx, bz] of LINES) best = Math.min(best, segment(x, z, ax, az, bx, bz));
  return best;
}

/** How much of the relief stands at (x, z): 0 on the yard floor, the cell's edges and the entry roads' last 60 m, else 1. */
export function reliefShare(x: number, z: number): number {
  const yard = sstep(Math.hypot(x - YARD.x, z - YARD.z), YARD.flat, YARD.whole);
  const edge = sstep(HALF - Math.max(Math.abs(x), Math.abs(z)), 2, 32);
  // the cook walks 50 m in from each gate within 3.65 m of its axis; the lattice interpolates a 2 m step past that
  const lane = Math.min(...ENTRIES.map((e) => {
    const across = e.gate[0] === 0 ? Math.abs(x) : Math.abs(z), along = e.gate[0] === 0 ? HALF - Math.abs(z) : HALF - Math.abs(x);
    const sameSide = e.gate[0] === 0 ? Math.sign(z) === Math.sign(e.gate[1]) : Math.sign(x) === Math.sign(e.gate[0]);
    return sameSide ? 1 - (1 - sstep(across, 7, 20)) * (1 - sstep(along, 60, 80)) : 1;
  }));
  return yard * edge * lane;
}

/** The region relief at (x, z), before the yard, edge and road fades: each region's own shape, feathered into the wilds. */
export function regionRelief(x: number, z: number): number {
  const relief = baseRelief(x, z);
  // roads and paths keep the regional shape but lose the small bumps: a rider's line stays smooth
  const road = 1 - sstep(roadDistance(x, z), 2, 9);
  return road <= 0 ? relief : relief - road * 0.5 * (relief - smoothRelief(x, z));
}

/** The relief averaged over a 6 m cross, what a road levels its bumps toward. */
function smoothRelief(x: number, z: number): number {
  let s = 0;
  for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]] as const) s += baseRelief(x + dx, z + dz);
  return s / 5;
}
function baseRelief(x: number, z: number): number {
  let sum = 0, weight = 0;
  for (const region of REGIONS) {
    const w = 1 - sstep(outside(region.rect, x, z), 0, FEATHER);
    if (w > 0) { sum += w * (RELIEF[region.id]?.(x, z) ?? 0); weight += w; }
  }
  return weight > 1 ? sum / weight : sum + (1 - weight) * wilds(x, z);
}

/** The ground's tint per region (linear rgb multipliers on the moss): the bog darker and wetter, the quarry and the ridge's
 *  heights stonier, the downs paler grass. */
const TINT: Record<string, readonly [number, number, number]> = {
  yard: [1, 1, 1], meadow: [1.04, 1.06, 0.95], thicket: [0.86, 0.9, 0.8], downs: [1.12, 1.1, 0.9],
  bog: [0.7, 0.78, 0.74], quarry: [1.25, 1.12, 1.0], ridge: [1.1, 1.05, 1.0],
};
export function regionTint(x: number, z: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  let weight = 0;
  for (const region of REGIONS) {
    const w = 1 - sstep(outside(region.rect, x, z), 0, FEATHER);
    if (w <= 0) continue;
    const t = TINT[region.id] ?? [1, 1, 1];
    out[0] += w * t[0]; out[1] += w * t[1]; out[2] += w * t[2]; weight += w;
  }
  if (weight > 1) return [out[0] / weight, out[1] / weight, out[2] / weight];
  return [out[0] + 1 - weight, out[1] + 1 - weight, out[2] + 1 - weight];
}
