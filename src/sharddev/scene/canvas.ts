import type { DataTexture } from 'three';
import { byte, checkSize, paintedTexture } from './author';

/**
 * AUTHORING-PARITY AP1: `paintCanvas(w, h, draw)`, the part of the Canvas 2D API the cleanrooms paint with, in plain
 * JavaScript at compile time. A cleanroom painter (`const [c, ctx] = canvas(w, h); ...; return new CanvasTexture(c)`)
 * ports by swapping its first and last lines. Fills sample each pixel centre (no antialiasing; the mip chain softens);
 * the nonzero rule, source-over and destination-out compositing, transforms, linear and radial gradients and a 5x7
 * bitmap `fillText` are what the cleanroom textures use. Anything else throws, so a missing call is never silent.
 */

type Colour = [number, number, number, number];
interface Gradient { readonly kind: 'linear' | 'radial'; readonly at: readonly number[]; readonly stops: [number, Colour][]; addColorStop: (offset: number, colour: string) => void }
type Style = string | Gradient;
type Matrix = [number, number, number, number, number, number];
interface State { transform: Matrix; fillStyle: Style; strokeStyle: Style; lineWidth: number; globalAlpha: number; globalCompositeOperation: 'source-over' | 'destination-out'; font: string; textAlign: 'left' | 'center' | 'right' | 'start'; textBaseline: 'alphabetic' | 'middle' | 'top' | 'bottom' }

function parseColour(text: string): Colour {
  const s = text.trim().toLowerCase();
  if (s.startsWith('#')) {
    const hex = s.length === 4 ? Array.from(s.slice(1), (c) => c + c).join('') : s.slice(1, 7);
    return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16), 1];
  }
  const match = /^rgba?\(([^)]*)\)$/u.exec(s);
  if (match?.[1] !== undefined) { const [r = 0, g = 0, b = 0, a = 1] = match[1].split(',').map((part) => Number.parseFloat(part)); return [r, g, b, a]; }
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'black') return [0, 0, 0, 1];
  throw new Error(`paintCanvas: colour ${text} is not #hex, rgb() or rgba()`);
}

/** 5x7 capitals, digits and `x`, one string of 7 rows per glyph. */
const GLYPHS: Readonly<Record<string, string>> = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111', x: '00000000001000101010001000101010001',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100', '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100',
};

/** A canvas-like 2D context over an RGBA buffer (rows top first). */
export class PaintContext {
  readonly width: number;
  readonly height: number;
  /** straight (non-premultiplied) RGBA, 0..255 colour, 0..1 alpha */
  private readonly pixels: Float32Array;
  private state: State = { transform: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px monospace', textAlign: 'start', textBaseline: 'alphabetic' };
  private readonly stack: State[] = [];
  private path: [number, number][][] = [];
  constructor(width: number, height: number) { this.width = width; this.height = height; this.pixels = new Float32Array(width * height * 4); }

  get fillStyle(): Style { return this.state.fillStyle; } set fillStyle(value: Style) { this.state.fillStyle = value; }
  get strokeStyle(): Style { return this.state.strokeStyle; } set strokeStyle(value: Style) { this.state.strokeStyle = value; }
  get lineWidth(): number { return this.state.lineWidth; } set lineWidth(value: number) { this.state.lineWidth = value; }
  get globalAlpha(): number { return this.state.globalAlpha; } set globalAlpha(value: number) { this.state.globalAlpha = value; }
  get globalCompositeOperation(): string { return this.state.globalCompositeOperation; }
  set globalCompositeOperation(value: string) { if (value !== 'source-over' && value !== 'destination-out') throw new Error(`paintCanvas: globalCompositeOperation ${value} is not supported`); this.state.globalCompositeOperation = value; }
  get font(): string { return this.state.font; } set font(value: string) { this.state.font = value; }
  get textAlign(): string { return this.state.textAlign; } set textAlign(value: string) { this.state.textAlign = value as State['textAlign']; }
  get textBaseline(): string { return this.state.textBaseline; } set textBaseline(value: string) { this.state.textBaseline = value as State['textBaseline']; }

  save(): void { this.stack.push({ ...this.state, transform: [...this.state.transform] }); }
  restore(): void { const state = this.stack.pop(); if (state !== undefined) this.state = state; }
  translate(x: number, y: number): void { this.multiply([1, 0, 0, 1, x, y]); }
  rotate(angle: number): void { const c = Math.cos(angle), s = Math.sin(angle); this.multiply([c, s, -s, c, 0, 0]); }
  scale(x: number, y: number): void { this.multiply([x, 0, 0, y, 0, 0]); }
  private multiply([a2, b2, c2, d2, e2, f2]: Matrix): void {
    const [a, b, c, d, e, f] = this.state.transform;
    this.state.transform = [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
  }
  private point(x: number, y: number): [number, number] { const [a, b, c, d, e, f] = this.state.transform; return [a * x + c * y + e, b * x + d * y + f]; }

  beginPath(): void { this.path = []; }
  moveTo(x: number, y: number): void { this.path.push([this.point(x, y)]); }
  lineTo(x: number, y: number): void { const sub = this.path.at(-1); if (sub === undefined) this.moveTo(x, y); else sub.push(this.point(x, y)); }
  closePath(): void { const sub = this.path.at(-1); const first = sub?.[0]; if (sub !== undefined && first !== undefined) { sub.push(first); this.path.push([first]); } }
  private last(): [number, number] { const sub = this.path.at(-1), point = sub?.at(-1); if (point === undefined) throw new Error('paintCanvas: a curve needs a current point'); return this.inverse(point); }
  private inverse([x, y]: [number, number]): [number, number] {
    const [a, b, c, d, e, f] = this.state.transform, det = a * d - b * c;
    return [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det];
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const [x0, y0] = this.last();
    for (let i = 1; i <= 16; i++) { const t = i / 16, u = 1 - t; this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y); }
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const [x0, y0] = this.last();
    for (let i = 1; i <= 20; i++) { const t = i / 20, u = 1 - t; this.lineTo(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y); }
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, a0: number, a1: number, ccw = false): void {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI; if (ccw && sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI;
    if (Math.abs(a1 - a0) >= 2 * Math.PI) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (2 * Math.PI) * 48)), c = Math.cos(rotation), s = Math.sin(rotation);
    for (let i = 0; i <= steps; i++) {
      const a = a0 + sweep * (i / steps), px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      this.lineTo(x + px * c - py * s, y + px * s + py * c);
    }
  }
  rect(x: number, y: number, w: number, h: number): void { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  fillRect(x: number, y: number, w: number, h: number): void { const saved = this.path; this.path = []; this.rect(x, y, w, h); this.fill(); this.path = saved; }
  clearRect(x: number, y: number, w: number, h: number): void {
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py++) for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px++) this.pixels.fill(0, (py * this.width + px) * 4, (py * this.width + px) * 4 + 4);
  }
  fill(): void { this.cover(this.path, this.state.fillStyle); }
  stroke(): void {
    const half = this.state.lineWidth / 2, polygons: [number, number][][] = [];
    const [a, b, c, d] = this.state.transform, scale = Math.sqrt(Math.abs(a * d - b * c)) * half;
    for (const sub of this.path) for (let i = 0; i + 1 < sub.length; i++) {
      const p = sub[i], q = sub[i + 1]; if (p === undefined || q === undefined) continue;
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); if (len === 0) continue;
      const nx = -dy / len * scale, ny = dx / len * scale;
      polygons.push([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny], [p[0] + nx, p[1] + ny]]);
    }
    for (const polygon of polygons) this.cover([polygon], this.state.strokeStyle);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient { return this.gradient('linear', [x0, y0, x1, y1]); }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient { return this.gradient('radial', [x0, y0, r0, x1, y1, r1]); }
  private gradient(kind: Gradient['kind'], at: number[]): Gradient {
    const stops: [number, Colour][] = [];
    return { kind, at, stops, addColorStop: (offset, colour) => { stops.push([offset, parseColour(colour)]); stops.sort((p, q) => p[0] - q[0]); } };
  }
  createImageData(w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(image: { width: number; height: number; data: Uint8ClampedArray }, dx: number, dy: number): void {
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
      const from = (y * image.width + x) * 4, to = (ty * this.width + tx) * 4;
      this.pixels[to] = image.data[from] ?? 0; this.pixels[to + 1] = image.data[from + 1] ?? 0; this.pixels[to + 2] = image.data[from + 2] ?? 0; this.pixels[to + 3] = (image.data[from + 3] ?? 0) / 255;
    }
  }
  /** 5x7 bitmap capitals; the font's pixel size sets the cap height. */
  fillText(text: string, x: number, y: number): void {
    const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/u.exec(this.state.font)?.[1] ?? '10'), cell = size * 0.7 / 7, advance = cell * 6, width = text.length * advance - cell;
    const left = this.state.textAlign === 'center' ? x - width / 2 : this.state.textAlign === 'right' ? x - width : x;
    const top = this.state.textBaseline === 'middle' ? y - cell * 3.5 : this.state.textBaseline === 'top' ? y : y - cell * 7;
    const saved = this.path; this.path = [];
    [...text].forEach((char, i) => {
      const glyph = GLYPHS[char] ?? GLYPHS[char.toUpperCase()];
      if (glyph === undefined) return;
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if (glyph[row * 5 + col] === '1') this.rect(left + i * advance + col * cell, top + row * cell, cell, cell);
    });
    this.fill(); this.path = saved;
  }

  private sample(style: Style, x: number, y: number): Colour {
    if (typeof style === 'string') return parseColour(style);
    const [u, v] = this.inverse([x, y]);
    let t: number;
    if (style.kind === 'linear') { const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = style.at, dx = x1 - x0, dy = y1 - y0; t = ((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy || 1); }
    else { const x0 = style.at[0] ?? 0, y0 = style.at[1] ?? 0, r0 = style.at[2] ?? 0, r1 = style.at[5] ?? 1; t = (Math.hypot(u - x0, v - y0) - r0) / (r1 - r0 || 1); }
    const stops = style.stops, first = stops[0], last = stops.at(-1);
    if (first === undefined || last === undefined) return [0, 0, 0, 0];
    if (t <= first[0]) return first[1]; if (t >= last[0]) return last[1];
    for (let i = 1; i < stops.length; i++) {
      const [o1, c1] = stops[i] ?? first, [o0, c0] = stops[i - 1] ?? first;
      if (t <= o1) { const k = (t - o0) / (o1 - o0 || 1); return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, c0[3] + (c1[3] - c0[3]) * k]; }
    }
    return last[1];
  }
  /** Nonzero-rule coverage of pixel centres, composited with the current style, alpha and operation. */
  private cover(path: [number, number][][], style: Style): void {
    const edges: [number, number, number, number, number][] = [];
    let minY = Infinity, maxY = -Infinity;
    for (const sub of path) for (let i = 0; i + 1 < sub.length; i++) {
      const p = sub[i], q = sub[i + 1]; if (p === undefined || q === undefined || p[1] === q[1]) continue;
      edges.push(p[1] < q[1] ? [p[0], p[1], q[0], q[1], 1] : [q[0], q[1], p[0], p[1], -1]);
      minY = Math.min(minY, p[1], q[1]); maxY = Math.max(maxY, p[1], q[1]);
    }
    // an open subpath fills as if closed
    for (const sub of path) { const p = sub.at(-1), q = sub[0]; if (p !== undefined && q !== undefined && sub.length > 2 && (p[0] !== q[0] || p[1] !== q[1]) && p[1] !== q[1]) { edges.push(p[1] < q[1] ? [p[0], p[1], q[0], q[1], 1] : [q[0], q[1], p[0], p[1], -1]); minY = Math.min(minY, p[1], q[1]); maxY = Math.max(maxY, p[1], q[1]); } }
    const solid = typeof style === 'string' ? parseColour(style) : null, alpha = this.state.globalAlpha, out = this.state.globalCompositeOperation === 'destination-out';
    for (let py = Math.max(0, Math.floor(minY)); py < Math.min(this.height, Math.ceil(maxY)); py++) {
      const cy = py + 0.5, crossings: [number, number][] = [];
      for (const [x0, y0, x1, y1, w] of edges) if (cy >= y0 && cy < y1) crossings.push([x0 + (cy - y0) / (y1 - y0) * (x1 - x0), w]);
      crossings.sort((p, q) => p[0] - q[0]);
      let winding = 0;
      for (let i = 0; i + 1 < crossings.length; i++) {
        winding += crossings[i]?.[1] ?? 0;
        if (winding === 0) continue;
        const start = crossings[i]?.[0] ?? 0, cx = crossings[i + 1]?.[0] ?? 0;
        for (let px = Math.max(0, Math.ceil(start - 0.5)); px < Math.min(this.width, Math.ceil(cx - 0.5)); px++) {
          const [r, g, b, a] = solid ?? this.sample(style, px + 0.5, cy), sa = a * alpha, at = (py * this.width + px) * 4, da = this.pixels[at + 3] ?? 0;
          if (out) { this.pixels[at + 3] = da * (1 - sa); continue; }
          const oa = sa + da * (1 - sa); if (oa <= 0) continue;
          for (let c = 0; c < 3; c++) this.pixels[at + c] = ([r, g, b][c] ?? 0) * sa / oa + (this.pixels[at + c] ?? 0) * da * (1 - sa) / oa;
          this.pixels[at + 3] = oa;
        }
      }
    }
  }
  /** The painted bytes, rows top first. */
  bytes(): Uint8Array {
    const out = new Uint8Array(this.width * this.height * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = byte(this.pixels[i] ?? 0); out[i + 1] = byte(this.pixels[i + 1] ?? 0); out[i + 2] = byte(this.pixels[i + 2] ?? 0); out[i + 3] = byte((this.pixels[i + 3] ?? 0) * 255); }
    return out;
  }
}

/** `paintCanvas(w, h, (ctx) => ...)`: a cleanroom canvas painter, run at compile time, as a sampled texture. */
export function paintCanvas(width: number, height: number, draw: (ctx: PaintContext) => void, options: { colourSpace?: 'srgb' | 'linear' } = {}): DataTexture {
  checkSize(width, height);
  const ctx = new PaintContext(width, height); draw(ctx);
  return paintedTexture(width, height, ctx.bytes(), options);
}
