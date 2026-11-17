/** The loop road centreline half-size, in metres. */
export const LOOP = 60;
/** Asphalt plus edge stripe half-width, in metres. */
export const ROAD_HALF: number = 8 / 2 + 0.5;

const smooth = (edge0: number, edge1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/**
 * The terrain finish (generators/terrain.ts and the props bake share it): everything outside the yard (the loop, the
 * roads, the entry plazas, the hub corners and pass 2's districts) is levelled to y = 0, blending back to the authored
 * noise over a few metres just inside the loop. The yard inside the loop is untouched.
 */
export function cellGround(x: number, z: number, h: number): number {
  return h * (1 - smooth(LOOP - ROAD_HALF - 9, LOOP - ROAD_HALF - 2, Math.max(Math.abs(x), Math.abs(z))));
}
