import * as v from 'valibot';
import type { MapRaster } from './mapRaster';

// GR7: the island palette of the retired script painter (scripts/map-painter.mjs, `kind: 'isle'`), so a source program
// paints Driftwood's map through `rasterSceneMap` with the same integer arithmetic and the same pixels.
const hexColour = v.pipe(v.string(), v.regex(/^#[a-fA-F0-9]{6}$/u));
/** The island palette: sea, shallows and grass bands by height, then sand, paths, rock, crowns and decks read from the
 *  source colours (hex `#rrggbb`; heights in metres). */
export interface IsleStyle {
  readonly kind: 'isle'; readonly void?: string; readonly deepBelow: number; readonly waterBelow: number; readonly pathAbove: number;
  readonly sea: string; readonly shallow: string; readonly grass: string[]; readonly grassBands: number[]; readonly sand?: string;
  readonly path: string; readonly rock: string; readonly crown: string; readonly deck: string; readonly sourceGain: number; readonly shade: number;
}
/** The island palette's admission. */
export const isleStyleSchema: v.GenericSchema<unknown, IsleStyle> = v.object({ kind: v.literal('isle'), void: v.exactOptional(v.union([hexColour, v.literal('transparent')])),
  deepBelow: v.number(), waterBelow: v.number(), pathAbove: v.number(), sea: hexColour, shallow: hexColour,
  grass: v.pipe(v.array(hexColour), v.minLength(1), v.maxLength(65)), grassBands: v.pipe(v.array(v.number()), v.maxLength(64)),
  sand: v.exactOptional(hexColour), path: hexColour, rock: hexColour, crown: hexColour, deck: hexColour,
  sourceGain: v.optional(v.number(), 1), shade: v.optional(v.number(), .5) });

const byte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
function item<T>(values: ArrayLike<T>, index: number): T { const value = values[index]; if (value === undefined) throw new Error('Incomplete map geometry'); return value; }
const hex = (value: string): readonly [number, number, number] =>
  [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];

/** The island palette over a painted raster: RGBA8, exact integer relief. Classification never changes occupied coverage. */
export function stylizeIsle(raster: Pick<MapRaster, 'size' | 'height' | 'colour'>, style: IsleStyle): Uint8Array {
  const { size, height, colour } = raster, out = new Uint8Array(size * size * 4);
  const valid = (at: number): boolean => at >= 0 && at < height.length && height[at] !== -2147483648;
  const level = (at: number): number => item(height, at) / 65536;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = y * size + x;
    if (!valid(at)) {
      if (style.void !== 'transparent') { const bg = hex(style.void ?? style.sea); for (let k = 0; k < 3; k++) out[at * 4 + k] = item(bg, k); out[at * 4 + 3] = 255; }
      continue;
    }
    const h = level(at), rgb = Array.from(colour.subarray(at * 3, at * 3 + 3), c => byte(c * style.sourceGain));
    const neighbours = [x > 0 ? at - 1 : -1, x + 1 < size ? at + 1 : -1, y > 0 ? at - size : -1, y + 1 < size ? at + size : -1];
    let fill = hex(h < style.deepBelow ? style.sea : h < style.waterBelow ? style.shallow : item(style.grass, style.grassBands.filter(b => h >= b).length));
    // the island's authored sand, paths, timber and crowns stay readable from the source vertex colours
    if (style.sand !== undefined && h >= style.waterBelow) {
      const r = item(rgb, 0) / 255, g = item(rgb, 1) / 255, b = item(rgb, 2) / 255;
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b, .001);
      const green = g > r * 1.05 && g > b * 1.1, sand = r > .55 && g > .45 && b < g * .85 && !green;
      const wood = r > g * 1.12 && r > .25 && r < .75 && saturation > .3 && !green;
      const heights = neighbours.filter(valid).map(level), slope = Math.max(0, ...heights.map(value => Math.abs(h - value))) * size / 500;
      let low = h;
      for (const dz of [-7, 0, 7]) for (const dx of [-7, 0, 7]) {
        const px = x + dx, py = y + dz, other = py * size + px;
        if (px >= 0 && px < size && py >= 0 && py < size && valid(other)) low = Math.min(low, level(other));
      }
      const raised = h - low;
      if (sand) fill = hex(h > style.pathAbove ? style.path : style.sand);
      else if (!green && (saturation < .28 || slope > 1.4)) fill = hex(style.rock);
      if (green && raised > 1.5) fill = hex(style.crown);
      if (wood || !green && low < -.5 && raised > .4) fill = hex(style.deck);
    }
    const left = valid(at - 1) && x > 0 ? item(height, at - 1) : item(height, at), top = valid(at - size) ? item(height, at - size) : item(height, at);
    const relief = Math.max(-80, Math.min(80, Math.trunc((left + top - item(height, at) * 2) / 512))), shade = 256 + Math.trunc(relief * style.shade);
    for (let k = 0; k < 3; k++) out[at * 4 + k] = byte(Math.trunc(item(fill, k) * shade / 256));
    out[at * 4 + 3] = 255;
  }
  return out;
}
