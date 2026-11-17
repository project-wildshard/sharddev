// Procedural textures, ported from the Mossgate cleanroom (mossgate-cleanroom eac5bb8 src/textures.js). The painters are the
// cleanroom's own lines; only `canvas()` / `new CanvasTexture(c)` became `paint` / `paintCanvas`, which run at compile time.
import type { DataTexture } from 'three';
import { paint } from '@wildshard/sdk/scene/author';
import { paintCanvas, type PaintContext } from '@wildshard/sdk/scene/canvas';

export function rng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Noise { (x: number, y: number): number; fbm: (x: number, y: number, oct?: number) => number }
// Smooth value noise, 2D, tileable over `period`.
export function makeNoise(seed = 7): Noise {
  const r = rng(seed);
  const N = 256;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x: number, y: number): number => g[((y & (N - 1)) * N) + (x & (N - 1))] ?? 0;
  const sm = (t: number): number => t * t * (3 - 2 * t);
  const n = (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  const fbm = (x: number, y: number, oct = 4): number => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f); amp *= 0.5; f *= 2; }
    return s;
  };
  return Object.assign(n, { fbm });
}

type Rgb = [number, number, number];
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: readonly number[], b: readonly number[], t: number): Rgb => [mix(a[0] ?? 0, b[0] ?? 0, t), mix(a[1] ?? 0, b[1] ?? 0, t), mix(a[2] ?? 0, b[2] ?? 0, t)];
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));

// Weathered warm-grey stone with moss blotches and edge darkening.
export function stone(seed = 3, { moss = 0.35 } = {}): DataTexture {
  const n = makeNoise(seed);
  const S = 512;
  const g1 = [106, 102, 94], g2 = [150, 145, 134], mossC = [84, 104, 38];
  return paint(S, S, (u, v) => {
    const a = n.fbm(u * 8, v * 8, 5);
    const sp = n(u * 120, v * 120);
    let col = mix3(g1, g2, clamp(a * 1.6 - 0.3));
    col = col.map((x) => x * (0.85 + sp * 0.25)) as Rgb;
    // cracks
    const cr = Math.abs(n.fbm(u * 6 + 5, v * 6 + 2, 3) - 0.5);
    if (cr < 0.012) col = col.map((x) => x * 0.6) as Rgb;
    // moss: favours the top of a face (v small)
    const m = n.fbm(u * 10 + 3, v * 10 + 7, 4) + (1 - v) * 0.25 * moss * 2;
    const t = clamp((m - (1 - moss)) * 6);
    col = mix3(col, mossC.map((x) => x * (0.8 + sp * 0.4)), t);
    // edge darkening for bevel read
    const e = Math.min(u, v, 1 - u, 1 - v);
    const ed = clamp(e * 18, 0.7, 1);
    return col.map((x) => x * ed);
  });
}

// Flat slab stone for the path: lighter, pink-grey, no moss on top.
export function slab(): DataTexture {
  const n = makeNoise(21);
  const S = 256;
  return paint(S, S, (u, v) => {
    const a = n.fbm(u * 6, v * 6, 4);
    const sp = n(u * 90, v * 90);
    const col = mix3([126, 120, 110], [164, 156, 142], clamp(a * 1.5 - 0.2));
    const e = Math.min(u, v, 1 - u, 1 - v);
    const ed = clamp(e * 14, 0.72, 1);
    return col.map((x) => x * (0.88 + sp * 0.2) * ed);
  });
}

export function wood(): DataTexture {
  const n = makeNoise(5);
  const S = 256;
  return paint(S, S, (u, v) => {
    const grain = n(u * 4, v * 60) * 0.6 + n(u * 2, v * 140) * 0.4;
    return mix3([84, 58, 38], [138, 98, 62], grain);
  });
}

export function shingle(): DataTexture {
  const n = makeNoise(9);
  const S = 256;
  return paint(S, S, (u, v) => {
    const a = n.fbm(u * 8, v * 8, 4);
    const sp = n(u * 100, v * 100);
    let col = mix3([104, 96, 78], [128, 120, 96], a);
    col = mix3(col, [112, 130, 50], clamp((n.fbm(u * 5 + 3, v * 5, 3) - 0.5) * 3));
    return col.map((x) => x * (0.85 + sp * 0.3));
  });
}

// Painted floor/wall stencil ("A", "3x3"), white on transparent.
export function stencil(text: string, { w = 256, h = 128, font = 'bold 96px monospace', alpha = 0.75 } = {}): DataTexture {
  return paintCanvas(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(235,228,214,${alpha})`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
    // scuff it
    const r = rng(text.length * 31);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.6})`;
      ctx.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3);
    }
  });
}

// Soft round glow sprite.
export function glow(): DataTexture {
  return paintCanvas(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(0.25, 'rgba(255,190,90,0.6)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

// Ivy strand: a wavy stem with heart-shaped leaves, top to bottom.
export function ivy(): DataTexture {
  return paintCanvas(128, 512, (ctx: PaintContext) => {
    ctx.clearRect(0, 0, 128, 512);
    const r = rng(13);
    ctx.strokeStyle = '#4a5a22'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(64, 0);
    for (let y = 0; y <= 512; y += 16) ctx.lineTo(64 + Math.sin(y / 40) * 14, y);
    ctx.stroke();
    for (let y = 8; y < 500; y += 13) {
      const x = 64 + Math.sin(y / 40) * 14, s = r() < 0.5 ? -1 : 1, sz = 10 + r() * 9 - y / 120;
      const l = 0.7 + r() * 0.4;
      ctx.fillStyle = `rgb(${Math.round(92 * l)},${Math.round(128 * l)},${Math.round(40 * l)})`;
      ctx.save(); ctx.translate(x + s * sz * 0.8, y); ctx.rotate(s * (0.4 + r() * 0.6));
      ctx.beginPath(); ctx.moveTo(0, -sz * 0.2);
      ctx.bezierCurveTo(sz, -sz, sz * 1.1, sz * 0.4, 0, sz); ctx.bezierCurveTo(-sz * 1.1, sz * 0.4, -sz, -sz, 0, -sz * 0.2);
      ctx.fill(); ctx.restore();
    }
  });
}

// Hanging moss: shaggy strands, dense at the top, thinning to wisps.
export function hangingMoss(): DataTexture {
  return paintCanvas(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const r = rng(29);
    for (let i = 0; i < 90; i++) {
      const x = r() * 256, len = 40 + r() * 200 * r(), w = 3 + r() * 6;
      const l = 0.75 + r() * 0.35;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(${Math.round(98 * l)},${Math.round(118 * l)},${Math.round(40 * l)},1)`);
      g.addColorStop(1, `rgba(${Math.round(130 * l)},${Math.round(142 * l)},${Math.round(60 * l)},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.quadraticCurveTo(x + (r() - 0.5) * 10, len * 0.6, x + (r() - 0.5) * 8, len); ctx.lineTo(x + w, 0); ctx.fill();
    }
    ctx.fillStyle = 'rgb(84,104,36)'; ctx.fillRect(0, 0, 256, 10);
  });
}

// Fern frond: a tapered stem with paired leaflets, root at the bottom.
export function frond(): DataTexture {
  return paintCanvas(128, 512, (ctx) => {
    ctx.clearRect(0, 0, 128, 512);
    const grad = ctx.createLinearGradient(0, 512, 0, 0);
    grad.addColorStop(0, '#3e5a1c');
    grad.addColorStop(1, '#8fae3c');
    ctx.fillStyle = grad;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(64, 512); ctx.lineTo(64, 10); ctx.stroke();
    for (let y = 40; y < 500; y += 16) {
      const len = 54 * Math.sin(((y - 20) / 490) * Math.PI) + 4;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(64 + s * len * 0.5, y - 6, len * 0.5, 6, s * -0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// Grass blade card: a fan of tapered blades.
export function grassCard(): DataTexture {
  return paintCanvas(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    const r = rng(4);
    for (let i = 0; i < 14; i++) {
      const x = 20 + r() * 88, h = 60 + r() * 64, lean = (r() - 0.5) * 40;
      const g = ctx.createLinearGradient(0, 128, 0, 128 - h);
      g.addColorStop(0, '#6a8a2e'); g.addColorStop(1, r() < 0.3 ? '#c6cc6a' : '#a4c04c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 3, 128); ctx.quadraticCurveTo(x + lean * 0.4, 128 - h * 0.6, x + lean, 128 - h); ctx.lineTo(x + 3, 128); ctx.fill();
    }
  });
}

// Flame sprite: five pointed tongues in three layers, red-orange outside, orange, then a yellow-white core.
export function flameSprite(): DataTexture {
  return paintCanvas(128, 256, (ctx) => {
    ctx.clearRect(0, 0, 128, 256);
    const tongue = (cx: number, top: number, w: number, col: string): void => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(cx - w, 236);
      ctx.bezierCurveTo(cx - w * 1.1, 170, cx - w * 0.2, 120, cx + w * 0.15, top);
      ctx.bezierCurveTo(cx + w * 0.5, 120, cx + w * 1.2, 170, cx + w, 236);
      ctx.closePath(); ctx.fill();
    };
    const base = (r: number, col: string): void => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(64, 222, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); };
    base(46, 'rgba(232,74,22,0.95)');
    for (const [x, t, w] of [[38, 92, 24], [58, 18, 30], [82, 60, 26], [100, 120, 18], [24, 140, 16]] as const) tongue(x, t, w, 'rgba(232,74,22,0.95)');
    base(36, 'rgba(255,140,30,1)');
    for (const [x, t, w] of [[44, 110, 18], [62, 50, 22], [80, 96, 18]] as const) tongue(x, t, w, 'rgba(255,140,30,1)');
    base(24, 'rgba(255,214,90,1)');
    for (const [x, t, w] of [[56, 120, 13], [70, 104, 13]] as const) tongue(x, t, w, 'rgba(255,214,90,1)');
    base(12, 'rgba(255,248,214,1)');
  });
}
