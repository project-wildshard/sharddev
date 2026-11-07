import type { BufferGeometry } from 'three';
import type { FarImpostor } from '@wildshard/format/shardSections';
import { ROAD_SKY } from '@wildshard/engine/game/grid/frameModel';
import { FAR_CLIFF_FLOOR } from '@wildshard/engine/game/grid/farView';
import { writeImagePixels } from './image';

/**
 * G539 (Jake: *"we need to have a different far layout rendering option for really distant things"*): the far tier's
 * camera-facing impostor, baked at build time beside the far proxy from the proxy itself. A software rasteriser (no GPU,
 * no DOM) renders the proxy from `views` compass directions, orthographic and almost level (the road's eye on a cell
 * kilometres away), under the road's own key light and fill (`ROAD_SKY`, G165: everything outside the cell you stand in
 * is under the road light, and only there does the far tier draw). Each tile holds the lit colour sRGB-encoded over
 * `range` and dithered to 5 bits a channel, with a 1-bit coverage alpha, so the runtime packs it to RGBA 5551 losslessly
 * (`farView.ts`: 2 bytes a texel). Deterministic: the same proxy gives the same bytes. Nothing here knows a shard.
 */
export const FAR_IMPOSTOR_BAKE = { views: 8, cols: 2, tile: [256, 64] as const, elevation: 1, range: 3, supersample: 2, margin: 2 } as const;

/** The proxy's look family: toon draws flat facets, the others their vertex normals. */
export type FarImpostorFamily = 'toon' | 'painterly' | 'pbr';
/** One baked impostor: its row (without its file reference), the PNG and its GPU texels (RGBA 5551). */
export interface FarImpostorBake { readonly row: Omit<FarImpostor, 'file'>; readonly png: Uint8Array; readonly gpu: number }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const encode = (linear: number): number => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055);

/**
 * The road light on a surface normal as the proxy's own material lights it: three's Lambert (the hemisphere fill plus the
 * key light, each through BRDF_Lambert's 1 / π), the boundary face's light floor (`FAR_CLIFF_FLOOR`, emissive) on a cliff.
 */
function lit(albedo: readonly [number, number, number], nx: number, ny: number, nz: number, family: FarImpostorFamily, cliff: boolean): [number, number, number] {
  const { sun, hemi } = ROAD_SKY, az = sun.azimuth * Math.PI / 180, el = sun.elevation * Math.PI / 180;
  const lx = -Math.sin(az) * Math.cos(el), ly = Math.sin(el), lz = Math.cos(az) * Math.cos(el);
  const k = Math.max(0, nx * lx + ny * ly + nz * lz) * sun.intensity, h = 0.5 + 0.5 * ny;
  // a pbr proxy also takes the environment (`ROAD_SKY.env`): a grey fill standing in for it
  const env = family === 'pbr' ? ROAD_SKY.env * 0.35 : 0;
  return [0, 1, 2].map((i) => {
    const sky = hemi.sky[i] ?? 0, ground = hemi.ground[i] ?? 0;
    return (albedo[i] ?? 0) * (((ground + (sky - ground) * h) * hemi.intensity + (sun.colour[i] ?? 0) * k) / Math.PI + env + (cliff ? FAR_CLIFF_FLOOR : 0));
  }) as [number, number, number];
}

/** Bake the impostor of a far proxy geometry (position, normal, color; indexed or not), in the cell's frame. */
export async function bakeFarImpostor(geometry: BufferGeometry, family: FarImpostorFamily): Promise<FarImpostorBake> {
  const B = FAR_IMPOSTOR_BAKE, [tw, th] = B.tile, ss = B.supersample, W = tw * ss, H = th * ss, rows = Math.ceil(B.views / B.cols);
  const cliffs = geometry.hasAttribute('uv') ? geometry.getAttribute('uv') : null;
  const position = geometry.getAttribute('position'), normal = geometry.hasAttribute('normal') ? geometry.getAttribute('normal') : null, colour = geometry.hasAttribute('color') ? geometry.getAttribute('color') : null;
  const index = geometry.getIndex(), count = index === null ? position.count : index.count;
  const vertex = (i: number): number => (index === null ? i : index.getX(i));
  const el = B.elevation * Math.PI / 180, ce = Math.cos(el), se = Math.sin(el);
  // view k is seen from azimuth a (the camera at (sin a, ·, cos a) of the cell): screen right (cos a, 0, −sin a), screen up and depth
  const frames = Array.from({ length: B.views }, (_, k) => {
    const a = (k / B.views) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
    return { right: [ca, 0, -sa], up: [-se * sa, ce, -se * ca], forward: [-ce * sa, -se, -ce * ca] } as const;
  });
  const project = (f: (typeof frames)[number], x: number, y: number, z: number): [number, number, number] =>
    [f.right[0] * x + f.right[2] * z, f.up[0] * x + f.up[1] * y + f.up[2] * z, f.forward[0] * x + f.forward[1] * y + f.forward[2] * z];
  // one frame for every view: the widest half-width and the lowest and highest screen heights
  let half = 0, bottom = Infinity, top = -Infinity;
  for (const f of frames) for (let v = 0; v < position.count; v++) {
    const [sx, sy] = project(f, position.getX(v), position.getY(v), position.getZ(v));
    half = Math.max(half, Math.abs(sx)); bottom = Math.min(bottom, sy); top = Math.max(top, sy);
  }
  if (!Number.isFinite(half) || !(top > bottom)) throw new Error('Far impostor needs a proxy with extent');
  const width = 2 * (half + B.margin);
  bottom -= B.margin; top += B.margin;
  const atlas = new Uint8ClampedArray(B.cols * tw * rows * th * 4);
  const rgb = new Float32Array(W * H * 3), depth = new Float32Array(W * H), cover = new Uint8Array(W * H);
  for (let k = 0; k < B.views; k++) {
    const f = frames[k]; if (f === undefined) continue;
    depth.fill(Infinity); cover.fill(0); rgb.fill(0);
    for (let t = 0; t + 2 < count; t += 3) {
      const ids = [vertex(t), vertex(t + 1), vertex(t + 2)];
      const p = ids.map((v) => project(f, position.getX(v), position.getY(v), position.getZ(v)));
      const [p0, p1, p2] = p; if (p0 === undefined || p1 === undefined || p2 === undefined) continue;
      // the facet's colour: its vertices' mean albedo under the road light, by its face normal (toon) or mean vertex normal
      const w = ids.map((v) => [position.getX(v), position.getY(v), position.getZ(v)] as const);
      const [w0, w1, w2] = w; if (w0 === undefined || w1 === undefined || w2 === undefined) continue;
      let nx: number, ny: number, nz: number;
      if (family === 'toon' || normal === null) {
        const ux = w1[0] - w0[0], uy = w1[1] - w0[1], uz = w1[2] - w0[2], vx = w2[0] - w0[0], vy = w2[1] - w0[1], vz = w2[2] - w0[2];
        nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      } else { nx = 0; ny = 0; nz = 0; for (const v of ids) { nx += normal.getX(v); ny += normal.getY(v); nz += normal.getZ(v); } }
      const len = Math.hypot(nx, ny, nz) || 1;
      const albedo: [number, number, number] = [0, 1, 2].map((c) => ids.reduce((sum, v) => sum + (colour === null ? 0.6 : colour.getComponent(v, c)), 0) / 3) as [number, number, number];
      const shade = lit(albedo, nx / len, ny / len, nz / len, family, cliffs !== null && ids.every((v) => cliffs.getY(v) > 0.5));
      // screen pixels (y down), then a depth-tested edge-function fill
      const px = p.map(([sx, sy, sz]) => [(sx / width + 0.5) * W, (top - sy) / (top - bottom) * H, sz] as const);
      const [a, b, c] = px; if (a === undefined || b === undefined || c === undefined) continue;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        const e0 = ((b[0] - qx) * (c[1] - qy) - (b[1] - qy) * (c[0] - qx)) / area, e1 = ((c[0] - qx) * (a[1] - qy) - (c[1] - qy) * (a[0] - qx)) / area, e2 = 1 - e0 - e1;
        if (e0 < 0 || e1 < 0 || e2 < 0) continue;
        const z = e0 * a[2] + e1 * b[2] + e2 * c[2], i = y * W + x;
        if (z >= (depth[i] ?? Infinity)) continue;
        depth[i] = z; cover[i] = 1; rgb[i * 3] = shade[0]; rgb[i * 3 + 1] = shade[1]; rgb[i * 3 + 2] = shade[2];
      }
    }
    // resolve the supersamples into the tile: covered mean colour, half coverage or more is opaque; dither to 5 bits
    const ox = (k % B.cols) * tw, oy = Math.floor(k / B.cols) * th;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      let n = 0, r = 0, g = 0, bl = 0;
      for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
        const i = (y * ss + dy) * W + x * ss + dx;
        if (cover[i] !== 1) continue;
        n++; r += rgb[i * 3] ?? 0; g += rgb[i * 3 + 1] ?? 0; bl += rgb[i * 3 + 2] ?? 0;
      }
      const o = ((oy + y) * B.cols * tw + ox + x) * 4, d = ((BAYER[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      if (n * 2 < ss * ss) continue;
      const q = (value: number): number => Math.min(31, Math.floor(encode(Math.min(1, Math.max(0, value / n / B.range))) * 31 + d)) * 255 / 31;
      atlas[o] = q(r); atlas[o + 1] = q(g); atlas[o + 2] = q(bl); atlas[o + 3] = 255;
    }
  }
  const png = await writeImagePixels({ width: B.cols * tw, height: rows * th, pixels: atlas });
  const round = (n: number): number => Math.round(n * 100) / 100;
  return { row: { views: B.views, cols: B.cols, tile: [tw, th], width: round(width), bottom: round(bottom), top: round(top), range: B.range }, png, gpu: B.cols * tw * rows * th * 2 };
}
