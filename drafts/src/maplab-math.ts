// Map Lab's numbers (W6, J31, J61): the dry run's terrain_vis.py maths ported to TypeScript, on the blockout's height
// field. Pure functions: the worker runs them, the tests check them against the dry run's measured stats.
//
// The thresholds are the plans', not new ones: 40° is the player's max climb (Jake's pick, AGENTS.md ▸ Physics); 30°
// is the dry run's "gentle ground" (PB1); the 30 m / 80 m bands are R11's close / mid / far (PB2); the viewpoints (every
// 5 m along each road, each place's centre and four rim points at 0.7 r), the 1.7 m eye, 720 rays to 320 m are PB2's
// method as terrain_vis.py ran it.

export const MAX_CLIMB_DEG = 40;
export const GENTLE_DEG = 30;
export const BAND_CLOSE_M = 30;
export const BAND_MID_M = 80;
const EYE_M = 1.7;
const VIEW_STEP_M = 5;
const RAYS = 720;
const RAY_MAX_M = 320;
const RIM = 0.7;

export interface Field {
  res: number;
  size: number;
  heights: Float32Array;
  labels: Uint8Array;
  /** Region index of open water (not land). */
  water: number;
}

export interface PlacePt {
  id: string;
  x: number;
  z: number;
  r: number;
}

export interface Road {
  pts: [number, number][];
}

export interface Numbers {
  landPct: number;
  walkablePct: number;
  gentlePct: number;
  places: Record<string, number>;
  viewpoints: number;
  bands: { close: number; mid: number; far: number; unseen: number };
}

const cellSize = (f: Field): number => f.size / (f.res - 1);

export function cellOf(f: Field, x: number, z: number): [number, number] {
  const d = cellSize(f);
  return [Math.round((x + f.size / 2) / d), Math.round((z + f.size / 2) / d)];
}

/** Slope in degrees per cell, as numpy.gradient (central differences inside, one-sided at the edges). */
export function slopeDeg(f: Field): Float32Array {
  const { res, heights: H } = f;
  const d = cellSize(f);
  const out = new Float32Array(res * res);
  const at = (i: number, j: number): number => H[j * res + i] ?? 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const gx = i === 0 ? (at(1, j) - at(0, j)) / d : i === res - 1 ? (at(i, j) - at(i - 1, j)) / d : (at(i + 1, j) - at(i - 1, j)) / (2 * d);
      const gz = j === 0 ? (at(i, 1) - at(i, 0)) / d : j === res - 1 ? (at(i, j) - at(i, j - 1)) / d : (at(i, j + 1) - at(i, j - 1)) / (2 * d);
      out[j * res + i] = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
    }
  }
  return out;
}

/** The share of land cells within `r` of (x, z) whose slope is gentle. */
export function placeGentlePct(f: Field, slope: Float32Array, x: number, z: number, r: number): number {
  const { res } = f;
  const [cx, cz] = cellOf(f, x, z);
  const rr = Math.trunc(r / cellSize(f));
  let land = 0;
  let gentle = 0;
  for (let j = Math.max(0, cz - rr); j <= Math.min(res - 1, cz + rr); j++) {
    for (let i = Math.max(0, cx - rr); i <= Math.min(res - 1, cx + rr); i++) {
      if (Math.hypot(i - cx, j - cz) > rr) continue;
      const k = j * res + i;
      if (f.labels[k] === f.water) continue;
      land++;
      if ((slope[k] ?? 90) <= GENTLE_DEG) gentle++;
    }
  }
  return land ? Math.round((100 * gentle) / land) : 0;
}

export function viewpoints(f: Field, roads: Road[], places: PlacePt[]): [number, number][] {
  const vps: [number, number][] = [];
  for (const r of roads) {
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [x0, z0] = r.pts[k] ?? [0, 0];
      const [x1, z1] = r.pts[k + 1] ?? [0, 0];
      const n = Math.max(1, Math.trunc(Math.hypot(x1 - x0, z1 - z0) / VIEW_STEP_M));
      for (let t = 0; t < n; t++) vps.push([x0 + ((x1 - x0) * t) / n, z0 + ((z1 - z0) * t) / n]);
    }
  }
  for (const p of places) {
    vps.push([p.x, p.z]);
    for (let a = 0; a < 4; a++) vps.push([p.x + RIM * p.r * Math.cos((a * Math.PI) / 2), p.z + RIM * p.r * Math.sin((a * Math.PI) / 2)]);
  }
  const half = f.size / 2;
  return vps.filter(([x, z]) => x > -half && x < half && z > -half && z < half);
}

/** For every cell, the distance to the nearest viewpoint that sees it (Infinity = unseen): PB2's ray sweep. */
export function seenDistance(f: Field, vps: [number, number][]): Float32Array {
  const { res, heights: H, size } = f;
  const d = cellSize(f);
  const mind = new Float32Array(res * res).fill(Infinity);
  const steps = Math.ceil((RAY_MAX_M - d) / d);
  const cos = new Float32Array(RAYS);
  const sin = new Float32Array(RAYS);
  for (let a = 0; a < RAYS; a++) {
    cos[a] = Math.cos((2 * Math.PI * a) / RAYS);
    sin[a] = Math.sin((2 * Math.PI * a) / RAYS);
  }
  for (const [vx, vz] of vps) {
    const [ci, cj] = cellOf(f, vx, vz);
    const c0 = Math.min(res - 1, Math.max(0, cj)) * res + Math.min(res - 1, Math.max(0, ci));
    const h0 = (H[c0] ?? 0) + EYE_M;
    for (let a = 0; a < RAYS; a++) {
      let run = -1e9;
      const ca = cos[a] ?? 0;
      const sa = sin[a] ?? 0;
      for (let s = 1; s <= steps; s++) {
        const dist = s * d;
        const ix = Math.round((vx + ca * dist + size / 2) / d);
        const iz = Math.round((vz + sa * dist + size / 2) / d);
        if (ix < 0 || ix >= res || iz < 0 || iz >= res) continue;
        const k = iz * res + ix;
        const g = ((H[k] ?? 0) - h0) / dist;
        if (g >= run - 1e-9) {
          run = g;
          if (dist < (mind[k] ?? Infinity)) mind[k] = dist;
        }
      }
    }
    mind[c0] = 0;
  }
  return mind;
}

export function numbers(f: Field, slope: Float32Array, places: PlacePt[], roads: Road[]): { n: Numbers; seen: Float32Array } {
  const N = f.res * f.res;
  let land = 0;
  let walk = 0;
  let gentle = 0;
  for (let k = 0; k < N; k++) {
    if (f.labels[k] === f.water) continue;
    land++;
    const sl = slope[k] ?? 90;
    if (sl <= MAX_CLIMB_DEG) walk++;
    if (sl <= GENTLE_DEG) gentle++;
  }
  const vps = viewpoints(f, roads, places);
  const seen = seenDistance(f, vps);
  let close = 0;
  let mid = 0;
  let far = 0;
  let unseen = 0;
  for (let k = 0; k < N; k++) {
    const v = seen[k] ?? Infinity;
    if (v <= BAND_CLOSE_M) close++;
    else if (v <= BAND_MID_M) mid++;
    else if (Number.isFinite(v)) far++;
    else unseen++;
  }
  const pct = (x: number, of: number): number => Math.round((1000 * x) / Math.max(1, of)) / 10;
  return {
    n: {
      landPct: pct(land, N), walkablePct: pct(walk, land), gentlePct: pct(gentle, land),
      places: Object.fromEntries(places.map((p) => [p.id, placeGentlePct(f, slope, p.x, p.z, p.r)])),
      viewpoints: vps.length,
      bands: { close: pct(close, N), mid: pct(mid, N), far: pct(far, N), unseen: pct(unseen, N) },
    },
    seen,
  };
}

/** Which places a place sees: a straight sight line at eye height over the height field, place centre to place centre. */
export function sightlines(f: Field, from: PlacePt, places: PlacePt[]): string[] {
  const { res, heights: H } = f;
  const d = cellSize(f);
  const h = (x: number, z: number): number => {
    const [i, j] = cellOf(f, x, z);
    return H[Math.min(res - 1, Math.max(0, j)) * res + Math.min(res - 1, Math.max(0, i))] ?? 0;
  };
  const h0 = h(from.x, from.z) + EYE_M;
  const out: string[] = [];
  for (const p of places) {
    if (p.id === from.id) continue;
    const dist = Math.hypot(p.x - from.x, p.z - from.z);
    const h1 = h(p.x, p.z) + EYE_M;
    const n = Math.max(2, Math.ceil(dist / d));
    let clear = true;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (h(from.x + (p.x - from.x) * t, from.z + (p.z - from.z) * t) > h0 + (h1 - h0) * t) { clear = false; break; }
    }
    if (clear) out.push(p.id);
  }
  return out;
}

export interface CamPose {
  eye: [number, number, number];
  look: [number, number, number];
}

/** Which cells a mock-up camera sees (J35's "mocked up": a mock-up painted at a camera that sees the cell). The camera
 * is the game's (vertical FOV 72°, PC2) at the view's own aspect; rays every half degree (PB2's density) out to PB2's
 * reach, occluded by the terrain, and only cells inside the frame's vertical extent count. */
export function cameraSeen(f: Field, cams: CamPose[], aspect: number, vfovDeg = 72): Uint8Array {
  const { res, heights: H, size } = f;
  const d = cellSize(f);
  const seen = new Uint8Array(res * res);
  const halfV = (vfovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const step = (Math.PI / 180) * (360 / RAYS);
  const steps = Math.ceil(RAY_MAX_M / d);
  for (const cam of cams) {
    const [ex, ey, ez] = cam.eye;
    const [lx, ly, lz] = cam.look;
    const yaw = Math.atan2(lz - ez, lx - ex);
    const pitch = Math.atan2(ly - ey, Math.hypot(lx - ex, lz - ez));
    for (let a = -halfH; a <= halfH; a += step) {
      const ca = Math.cos(yaw + a);
      const sa = Math.sin(yaw + a);
      let run = -Infinity;
      for (let s = 1; s <= steps; s++) {
        const dist = s * d;
        const ix = Math.round((ex + ca * dist + size / 2) / d);
        const iz = Math.round((ez + sa * dist + size / 2) / d);
        if (ix < 0 || ix >= res || iz < 0 || iz >= res) break;
        const k = iz * res + ix;
        const g = Math.atan2((H[k] ?? 0) - ey, dist);
        if (g >= run) {
          run = g;
          if (g >= pitch - halfV && g <= pitch + halfV) seen[k] = 1;
        }
      }
    }
  }
  return seen;
}
