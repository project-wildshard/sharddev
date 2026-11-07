import { GrassField, type GrassFieldPorts } from '@wildshard/engine/game/systems/looks/grassField';

/** An owned eight-channel native lattice snapshot and the original query state that produced it. */
export interface NativeMeadowField {
  readonly resolution: number;
  /** Row-major z rows: height, tone, flower drift, drift species, ground RGB, bloom. */
  readonly values: Float32Array;
  readonly baseHeightAt: (x: number, z: number, trailDistance?: number, exact?: boolean) => number;
  readonly sample: (x: number, z: number, channel: number) => number;
  readonly trailGrass: (height: number, trailDistance: number) => number;
}

/** Bake all original four-metre meadow corners from trusted explicit native samplers.
 * Own the numeric snapshot and query state without selecting a page, installing a field or retaining scene objects.
 * Snapshot edits never change the queries; separate builds share no mutable samples.
 * The author includes every supplied policy/sampler in its native source cache key. */
export function bakeMeadowField(source: GrassFieldPorts): NativeMeadowField {
  if (!Number.isSafeInteger(source.seed) || !Number.isFinite(source.half) || source.half <= 0 || source.half > 250)
    throw new Error('Native meadow requires a finite seed and at most one 500 m chunk');
  const resolution = Math.ceil(source.half * 2 / 4) + 1;
  const field = new GrassField(source), values = new Float32Array(resolution * resolution * 8);
  for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) for (let ch = 0; ch < 8; ch++) {
    values[(z * resolution + x) * 8 + ch] = field.sample(x * 4 - source.half, z * 4 - source.half, ch);
  }
  return { resolution, values, baseHeightAt: (x, z, td, exact) => field.baseHeightAt(x, z, td, exact),
    sample: (x, z, channel) => field.sample(x, z, channel), trailGrass: (height, td) => field.trailGrass(height, td) };
}
