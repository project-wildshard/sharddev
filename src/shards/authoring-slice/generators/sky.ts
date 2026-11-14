// The cleanroom's sunset sky dome (mossgate-cleanroom src/sky.js `makeSky`, 9cb4dc6) in TSL, line for line (SHARD-SOURCE
// AP14): periwinkle zenith, mauve, rose, a wide peach horizon glow, the low sun, small puffy clouds lit coral from below
// and a few stars. `world.sky(...)` compiles it to the dome's graph; the same value noise as the cleanroom's GLSL, so the
// clouds sit where the cleanroom's do. The detail and underside noise drop their finest octaves (weights 0.012 and 0.03 of
// the cloud shape) to fit the sky's budget (format look-sky, 1,024 instructions). Its `dusk` is 0 (the slice is the golden hour), so the night mix drops out.
import * as THREE from 'three';
import { dot, floor, fract, max, mix, normalize, pow, sin, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { skyRay } from '@wildshard/sdk/scene/author';
import type { GraphValue } from '@wildshard/sdk/materials';

type V = ReturnType<typeof vec3>;
type F = ReturnType<typeof dot>;
type P = ReturnType<typeof vec2>;

/** The cleanroom's SKY colours (linear, as its uniforms hold them). */
const SKY = { zenith: '#2c3282', upper: '#5652a2', mid: '#b06ea2', low: '#f88c80', horizon: '#ffb878', sun: '#ffe6b0' };
const lin = (hex: string): V => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
/** Where the sun sits: just over the skyline behind the hut (cleanroom main.js `sunVisible`). */
export const SUN_DIRECTION = new THREE.Vector3(0.32, 0.035, -1).normalize();

const hash = (p: P): F => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
function noise(p: P): F {
  const i = floor(p), f = fract(p), u = f.mul(f).mul(f.mul(-2).add(3));
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
}
/** The cleanroom's five-octave fbm; `octaves` below 5 drops the finest (each is half the weight of the one before). */
function fbm(start: P, octaves = 5): F {
  let sum: F = noise(start).mul(0.5), p = start, a = 0.5;
  for (let octave = 1; octave < octaves; octave++) { p = p.mul(2.07).add(13.1); a *= 0.5; sum = sum.add(noise(p).mul(a)); }
  return sum;
}

/** The sky colour along the view ray. */
export function sunsetSky(): GraphValue {
  const d = skyRay, h = d.y, e = max(h, 0);
  const sun = vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  // the glow toward the sun's side is wider and warmer
  const sd = max(dot(d, sun), 0);
  const az = pow(max(dot(normalize(d.xz.add(1e-4)), normalize(vec2(SUN_DIRECTION.x, SUN_DIRECTION.z))), 0), 2);
  const lift = az.mul(0.06).add(0.06); // the peach band climbs higher on the sun side
  let col: V = lin(SKY.horizon);
  col = mix(col, lin(SKY.low), smoothstep(lift.sub(0.02), lift.add(0.1), e));
  col = mix(col, lin(SKY.mid), smoothstep(lift.add(0.06), 0.26, e));
  col = mix(col, lin(SKY.upper), smoothstep(0.22, 0.42, e));
  col = mix(col, lin(SKY.zenith), smoothstep(0.4, 0.75, e));
  col = mix(col, lin(SKY.horizon).mul(0.92), smoothstep(0, -0.08, h)); // under the skyline: haze
  // sun: wide warm wash, halo, disc sitting on the horizon
  col = col.add(vec3(1, 0.62, 0.36).mul(pow(sd, 6).mul(0.4).mul(smoothstep(0, 0.4, e).oneMinus())));
  col = col.add(lin(SKY.sun).mul(pow(sd, 120).mul(0.35)));
  col = col.add(vec3(1, 0.85, 0.6).mul(smoothstep(0.99935, 0.9997, sd).mul(0.9)));
  // puffy clouds: a plane projection, small cumulus clumps in a band
  const cp = d.xz.div(max(h.add(0.08), 0.04)).mul(1.6);
  const band = smoothstep(0.04, 0.1, h).mul(smoothstep(0.3, 0.5, h).oneMinus());
  const shape = fbm(cp.mul(0.55).add(4)).mul(0.75).add(fbm(cp.mul(2.4).add(9), 4).mul(0.38));
  const cloud = smoothstep(0.57, 0.68, shape).mul(band);
  const underside = smoothstep(0.2, 0.75, fbm(cp.mul(2.4).add(vec2(0, 0.6)).add(9), 3)); // lit from below
  const lit = mix(vec3(1, 0.46, 0.46), vec3(1, 0.56, 0.32), pow(sd, 2)).mul(0.86);
  const shade = mix(lin(SKY.mid), lin(SKY.upper), 0.45).mul(0.95);
  const cloudCol = mix(lit, shade, underside.mul(0.35)).mul(mix(1, 0.72, smoothstep(0.14, 0.45, e))); // high clouds sit in shade
  col = mix(col, cloudCol, cloud.mul(0.92));
  // stars, faint at the golden hour (dusk 0)
  const st = step(0.9965, hash(floor(d.xz.div(max(h, 0.15)).mul(260)))).mul(smoothstep(0.35, 0.8, e));
  return col.add(vec3(st, st, st).mul(0.15)).mul(0.95);
}
