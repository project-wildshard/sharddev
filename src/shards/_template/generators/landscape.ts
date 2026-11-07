import { roadSocketMetrics } from '@wildshard/sharddev/entries';
import layout from '../data/layout.json' with { type: 'json' };
import { cellGround } from './ground';
import { templateNoise } from './landscapeNoise';

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

/** The retained Template author height law: seeded yard, pool, trail bed, flat roads and entry ramps.
 * No runtime field, registry, render service or captured height grid is read. */
export function templateHeightAt(seed = 357): (x: number, z: number) => number {
  const noise = templateNoise(seed);
  return (x, z) => {
    let height = Math.hypot(x - 25, z - 20) < 5 ? -3 : noise(x * 0.015, z * 0.015) * 0.5;
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
