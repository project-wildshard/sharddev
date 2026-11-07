import * as v from 'valibot';
import type { BakedTerrain } from './terrain';
import type { BakedProps } from './props';
import { decodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import { MapRaster } from './mapRaster';
import { paintMapGeometry } from './mapScenes';
import { isleStyleSchema, stylizeIsle } from './isleMap';

const hexColour = v.pipe(v.string(), v.regex(/^#[a-fA-F0-9]{6}$/u));
const palette = v.pipe(v.array(v.object({ match: hexColour, fill: hexColour, edge: v.exactOptional(hexColour) })), v.minLength(1), v.maxLength(256));
const styleSchema = v.object({ kind: v.literal('ground'), classes: palette, sourceGain: v.optional(v.number(), 1), shade: v.optional(v.number(), .5),
  void: v.optional(v.union([hexColour, v.literal('transparent')])), rim: v.exactOptional(hexColour),
  water: v.exactOptional(v.object({ below: v.number(), fill: hexColour, within: v.exactOptional(v.object({ x0: v.number(), x1: v.number(), z0: v.number(), z1: v.number() })) })),
  raised: v.exactOptional(v.object({ bump: v.number(), classes: palette })) });
type Style = v.InferOutput<typeof styleSchema>;
const voidStyleSchema = v.pipe(v.object({ kind: v.literal('void'),
  void: v.optional(v.union([hexColour, v.literal('transparent')])),
  stone: v.pipe(v.array(hexColour), v.minLength(1), v.maxLength(65)),
  stoneBands: v.pipe(v.array(v.number()), v.maxLength(64)), grass: hexColour, rim: hexColour,
  sourceGain: v.optional(v.number(), 1), shade: v.optional(v.number(), .5) }),
v.check(style => style.stone.length === style.stoneBands.length + 1, 'Void map bands need one more stone colour'));
const sceneStyleSchema = v.union([styleSchema, voidStyleSchema, isleStyleSchema]);
type Triple = readonly [number, number, number];
const byte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
function item<T>(values: ArrayLike<T>, index: number): T { const value = values[index]; if (value === undefined) throw new Error('Incomplete map geometry'); return value; }
const triple = (values: ArrayLike<number>): Triple => [item(values, 0), item(values, 1), item(values, 2)];
const hex = (value: string): Triple => [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];

function stylize(raster: MapRaster, style: Style): Uint8Array {
  const { size, height, colour } = raster, out = new Uint8Array(size * size * 4);
  // CI6: a palette's nearest class for a byte colour, and a parsed hex colour, are pure: each is worked out once per map
  // (the class search ran up to five times a pixel, each reparsing every class's hex) with the same first-nearest pick
  const parsed = new Map<string, Triple>(), hexOf = (value: string): Triple => { let rgb = parsed.get(value); if (rgb === undefined) { rgb = hex(value); parsed.set(value, rgb); } return rgb; };
  const picks = new Map<Style['classes'], Map<number, Style['classes'][number]>>();
  const nearest = (rgb: Triple, rows: Style['classes']): Style['classes'][number] => {
    let known = picks.get(rows); if (known === undefined) { known = new Map(); picks.set(rows, known); }
    const key = item(rgb, 0) * 65536 + item(rgb, 1) * 256 + item(rgb, 2), seen = known.get(key); if (seen !== undefined) return seen;
    const row = rows.reduce((best, candidate) => {
      const match = hexOf(candidate.match), distance = match.reduce((sum, c, k) => sum + (c - item(rgb, k)) ** 2, 0);
      return distance < best.distance ? { row: candidate, distance } : best;
    }, { row: item(rows, 0), distance: Infinity }).row;
    known.set(key, row); return row;
  };
  const valid = (at: number): boolean => at >= 0 && at < height.length && height[at] !== -2147483648;
  const sourceColour = (at: number): Triple => triple(Array.from(colour.subarray(at * 3, at * 3 + 3), c => byte(c * style.sourceGain)));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = y * size + x, h = item(height, at) / 65536, rgb = sourceColour(at);
    const neighbours = [x > 0 ? at - 1 : -1, x + 1 < size ? at + 1 : -1, y > 0 ? at - size : -1, y + 1 < size ? at + size : -1];
    const border = neighbours.some(other => !valid(other));
    if (!valid(at)) {
      if (style.void !== 'transparent') { const bg = hexOf(style.void ?? item(style.classes, 0).fill); for (let k = 0; k < 3; k++) out[at * 4 + k] = item(bg, k); out[at * 4 + 3] = 255; }
      continue;
    }
    const row = nearest(rgb, style.classes); let fill = hexOf(row.fill);
    if (style.water !== undefined && h < style.water.below) {
      const w = style.water.within, wx = 250 - (x + .5) * 500 / size, wz = 250 - (y + .5) * 500 / size;
      if (w === undefined || wx >= w.x0 && wx <= w.x1 && wz >= w.z0 && wz <= w.z1) fill = hexOf(style.water.fill);
    }
    if (border && style.rim !== undefined) fill = hexOf(style.rim);
    else if (row.edge !== undefined && neighbours.some(other => valid(other) && nearest(sourceColour(other), style.classes) !== row)) fill = hexOf(row.edge);
    const raisedStyle = style.raised;
    if (raisedStyle !== undefined) {
      const around: number[] = [];
      for (const dz of [-7, 0, 7]) for (const dx of [-7, 0, 7]) {
        const px = x + dx, py = y + dz, other = py * size + px;
        if (px >= 0 && px < size && py >= 0 && py < size && valid(other)) around.push(item(height, other));
      }
      around.sort((a, b) => a - b);
      const ground = around[Math.floor(around.length / 2)] ?? item(height, at);
      if (item(height, at) - ground > raisedStyle.bump * 65536) {
        const raised = nearest(rgb, raisedStyle.classes), edge = raised.edge;
        if (edge === undefined) throw new Error('Raised map palette needs edges');
        fill = hexOf(neighbours.some(other => valid(other) && item(height, at) - item(height, other) > raisedStyle.bump * 32768) ? edge : raised.fill);
      }
    }
    const left = valid(at - 1) && x > 0 ? item(height, at - 1) : item(height, at), top = valid(at - size) ? item(height, at - size) : item(height, at);
    const relief = Math.max(-80, Math.min(80, Math.trunc((left + top - item(height, at) * 2) / 512))), shade = 256 + Math.trunc(relief * style.shade);
    for (let k = 0; k < 3; k++) out[at * 4 + k] = byte(Math.trunc(item(fill, k) * shade / 256)); out[at * 4 + 3] = 255;
  }
  return out;
}

/** The retained void palette: classify actual colour/height, ink occupied edges and keep exact integer relief. */
function stylizeVoid(raster: MapRaster, style: v.InferOutput<typeof voidStyleSchema>): Uint8Array {
  const { size, height, colour } = raster, out = new Uint8Array(size * size * 4);
  const valid = (at: number): boolean => at >= 0 && at < height.length && height[at] !== -2147483648;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = y * size + x;
    if (!valid(at)) {
      if (style.void !== 'transparent') {
        const bg = hex(style.void ?? '#282e33');
        for (let k = 0; k < 3; k++) out[at * 4 + k] = item(bg, k);
        out[at * 4 + 3] = 255;
      }
      continue;
    }
    const h = item(height, at), rgb = triple(Array.from(colour.subarray(at * 3, at * 3 + 3), c => byte(c * style.sourceGain)));
    const neighbours = [x > 0 ? at - 1 : -1, x + 1 < size ? at + 1 : -1, y > 0 ? at - size : -1, y + 1 < size ? at + size : -1];
    const band = style.stoneBands.filter(b => h / 65536 >= b).length;
    const fill = hex(neighbours.some(other => !valid(other)) ? style.rim
      : rgb[1] > rgb[0] && rgb[1] > rgb[2] * 1.15 ? style.grass : item(style.stone, band));
    const left = valid(at - 1) && x > 0 ? item(height, at - 1) : h, top = valid(at - size) ? item(height, at - size) : h;
    const relief = Math.max(-80, Math.min(80, Math.trunc((left + top - h * 2) / 512))), shade = 256 + Math.trunc(relief * style.shade);
    for (let k = 0; k < 3; k++) out[at * 4 + k] = byte(Math.trunc(item(fill, k) * shade / 256));
    out[at * 4 + 3] = 255;
  }
  return out;
}

/** Paint the existing 500 m, +Z north/-X east ground map from actual L0 terrain and placed GLB triangles.
 * Returns RGBA8 bytes, not a file; the project writer supplies the normal lossless WebP and source identity. */
export async function rasterGroundMap(terrain: Pick<BakedTerrain, 'terrain' | 'assets'>, props: Pick<BakedProps, 'props' | 'assets'>, style: unknown, clip: { clipBelow?: number | null; clipAbove?: number | null } = {}): Promise<{ pixels: Uint8Array; triangles: number }> {
  const admitted = v.parse(styleSchema, style), raster = new MapRaster(1000, { clipBelow: clip.clipBelow ?? -Infinity, clipAbove: clip.clipAbove ?? Infinity });
  const read = (assets: ReadonlyMap<string, Uint8Array>, hash: string): Uint8Array => { const bytes = assets.get(hash); if (bytes === undefined) throw new Error('Missing map source geometry'); return bytes; };
  for (const tile of terrain.terrain.tiles) if (tile.lod === 0) raster.terrain(decodeTerrainTile(read(terrain.assets, tile.file)));
  for (const tile of props.props.tiles) if (tile.lod === 0) for (const hash of [tile.file, ...tile.additionalFiles ?? []]) await raster.glb(read(props.assets, hash));
  for (const panel of props.props.panels) if (panel.visible) await raster.glb(read(props.assets, panel.file));
  if (raster.triangles === 0) throw new Error('Data map is empty');
  return { pixels: stylize(raster, admitted), triangles: raster.triangles };
}


/** Explicit owned geometry/JSON readers for a source program; no file or public-directory resolver is installed. */
export interface SceneMapBytes {
  input: (file: string) => Uint8Array;
  model?: (url: string) => Uint8Array;
  json: (file: string) => unknown;
  bytes: (file: string) => Uint8Array;
}
/** Paint declared L0 terrain, GLBs and private scenes with the existing ground, void or island palette.
 * Returns the original 1000-square RGBA lattice from caller-owned inputs, without image/stamp publication.
 * GR9: `output` paints one declared output of a multi-output folder from its own `glbs`, in its own row's `style` (else the
 * folder's) leaving out its `exclude` node prefixes, as the script painter (`scripts/bake-data-maps.mjs`) did. */
export async function rasterSceneMap(settings: unknown, data: SceneMapBytes, options: { readonly output?: string; readonly glbs?: readonly string[] } = {}): Promise<{ pixels: Uint8Array; triangles: number }> {
  const admitted = v.parse(v.object({ style: sceneStyleSchema, clipBelow: v.exactOptional(v.nullable(v.number())), clipAbove: v.exactOptional(v.nullable(v.number())),
    outputs: v.exactOptional(v.record(v.string(), v.unknown())) }), settings);
  const own = options.output === undefined ? undefined : admitted.outputs?.[options.output];
  const style = typeof own === 'object' && own !== null && 'style' in own ? v.parse(sceneStyleSchema, own.style) : admitted.style;
  const raster = new MapRaster(1000, { clipBelow: admitted.clipBelow ?? -Infinity, clipAbove: admitted.clipAbove ?? Infinity });
  await paintMapGeometry(raster, settings, data, { ...(options.output === undefined ? {} : { output: options.output }), ...(options.glbs === undefined ? {} : { glbs: options.glbs }) });
  return { pixels: style.kind === 'void' ? stylizeVoid(raster, style) : style.kind === 'isle' ? stylizeIsle(raster, style) : stylize(raster, style), triangles: raster.triangles };
}
