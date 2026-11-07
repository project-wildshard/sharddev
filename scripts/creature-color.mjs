#!/usr/bin/env node
// creature-color.mjs — colour-match a shard's generated creature hulls to their codex references, then write the rig-ready
// sources (desktop 1024² + phone 512² textures, meshopt). Shard-agnostic copy of Nalati's scripts/nalati-models-color.mjs
// (the same Lab histogram + per-hue-sector match, verbatim), for the PBR hulls of a photoreal shard: the base-colour atlas
// is matched, the baked normal map rides along untouched. PINE-HOLLOW-REMASTER PH-M1.
//
// Per hull: the post-processed hull (`driftwood_post.py --keep-texture`: smooth, the generated texture baked ungraded on
// its own UVs + a tangent-space normal map from the high mesh) and its reference (`ref-<hull>.jpg` on white: the object is
// every pixel off the white, eroded 3 px so the anti-aliased rim doesn't count).
//   - L (CIE Lab lightness) and chroma: histogram match, texels used by the mesh (UV-rasterised mask) → the reference's
//     object pixels (TRELLIS bakes read darker and muddier than the photo);
//   - per hue sector: L, chroma and hue pulled to the reference's same sector; a soft toe lift on the darkest L.
// Output: <src>/<hull>.glb + <hull>.phone.glb (the chunk's `src`; the former creature-rig-bake.mjs was deleted in E357 F7: needed the dev labs).
//
//   node scripts/creature-color.mjs --chunk=pine-hollow                  # every hull
//   node scripts/creature-color.mjs --chunk=pine-hollow --only=boar      # some
//   --post=~/ml/img2mesh/out/pine-hollow-creatures-post   (the staging folder: <post>/<hull>/<hull>.glb)
import { createRequire } from 'node:module';
import { realpathSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve as resolvePath, join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolvePath(new URL('..', import.meta.url).pathname);
const req = createRequire(realpathSync(join(ROOT, 'node_modules/@gltf-transform/cli/package.json')));
const { NodeIO } = req('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = req('@gltf-transform/extensions');
const { MeshoptDecoder } = req('meshoptimizer');
const sharp = req('sharp');

const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const only = flag('only', '').split(',').filter(Boolean);
const tilde = (p) => p.replace(/^~/, homedir());
const CHUNK = flag('chunk', 'pine-hollow');
const GT = join(ROOT, 'node_modules/.bin/gltf-transform');

/**
 * Per chunk: `post` (the staging folder of the post-processed hulls), `src` (where the rig-ready sources go: the same
 * folder as the references) and per hull the match knobs — k = blend 0..1 of the match; lift = L units added at L = 0
 * (toe); sat = extra chroma multiplier; gain = L multiplier; hiSat = chroma multiplier on the light paint.
 */
const CREATURE_CONFIGS = {
  'pine-hollow': {
    post: '~/ml/img2mesh/out/pine-hollow-creatures-post',
    src: 'art/pine-hollow/round-9-creature-refs',
    hulls: {
      'deer-hind': { k: 0.85 }, 'deer-stag': { k: 0.85 }, boar: { k: 0.85 },
      'elk-cow': { k: 0.85 }, 'elk-bull': { k: 0.85 }, 'bear-black': { k: 0.8, lift: 2 }, 'bear-brown': { k: 0.85 },
      // E322 F-M1: the Antler King's own upright hull (its own round and staging folder: the codex ref's backdrop sheet
      // stripped from the post by the scratch strip step, art/pine-hollow/round-25-e322-king-rig/README.md)
      'antler-king-rig': { k: 0.8, src: 'art/pine-hollow/round-25-e322-king-rig', post: '~/ml/img2mesh/out/pine-hollow-king-rig-clean' },
    },
  },
};
const CFG = CREATURE_CONFIGS[CHUNK];
if (!CFG) throw new Error(`creature-color: no table for chunk '${CHUNK}'`);
const POST = tilde(flag('post', CFG.post));
const OUT0 = resolvePath(ROOT, CFG.src);
mkdirSync(OUT0, { recursive: true });
const TMP = flag('tmp', join('/tmp', `creature-color-${CHUNK}`));
mkdirSync(TMP, { recursive: true });

// ---- colour ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const LUT_LIN = new Float64Array(256).map((_, i) => lin(i / 255));
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fi = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
const XN = 0.95047, ZN = 1.08883;
/** sRGB bytes → Lab (Float32Array of 3·n) */
function toLab(rgba, n) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = LUT_LIN[rgba[i * 4]], g = LUT_LIN[rgba[i * 4 + 1]], b = LUT_LIN[rgba[i * 4 + 2]];
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / XN, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / ZN;
    const fx = f(x), fy = f(y), fz = f(z);
    out[i * 3] = 116 * fy - 16; out[i * 3 + 1] = 500 * (fx - fy); out[i * 3 + 2] = 200 * (fy - fz);
  }
  return out;
}
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = fi(fx) * XN, y = fi(fy), z = fi(fz) * ZN;
  const r = 3.2406 * x - 1.5372 * y - 0.4986 * z, g = -0.9689 * x + 1.8758 * y + 0.0415 * z, bb = 0.0557 * x - 0.204 * y + 1.057 * z;
  const c = (v) => Math.round(255 * gam(Math.min(1, Math.max(0, v))));
  return [c(r), c(g), c(bb)];
}
function stats(lab, idx) {
  const m = [0, 0, 0], s = [0, 0, 0];
  for (const i of idx) for (let c = 0; c < 3; c++) m[c] += lab[i * 3 + c];
  for (let c = 0; c < 3; c++) m[c] /= idx.length;
  for (const i of idx) for (let c = 0; c < 3; c++) s[c] += (lab[i * 3 + c] - m[c]) ** 2;
  for (let c = 0; c < 3; c++) s[c] = Math.sqrt(s[c] / idx.length);
  return { m, s };
}
/** a histogram (CDF) match LUT for one scalar channel sampled by fn(i) over 0..max, 10 bins per unit, smoothed */
function cdfLut(fnS, srcIdx, fnR, refIdx, max) {
  const B = max * 10 + 1, hs = new Float64Array(B), hr = new Float64Array(B);
  const bin = (v) => Math.min(B - 1, Math.max(0, Math.round(v * 10)));
  for (const i of srcIdx) hs[bin(fnS(i))]++;
  for (const i of refIdx) hr[bin(fnR(i))]++;
  for (let i = 1; i < B; i++) { hs[i] += hs[i - 1]; hr[i] += hr[i - 1]; }
  const ns = hs[B - 1], nr = hr[B - 1], lut = new Float32Array(B);
  let j = 0;
  for (let i = 0; i < B; i++) { const q = hs[i] / ns; while (j < B - 1 && hr[j] / nr < q) j++; lut[i] = j / 10; }
  const sm = new Float32Array(B); // a 1.5-unit box so no banding
  for (let i = 0; i < B; i++) { let t = 0, c = 0; for (let d = -15; d <= 15; d++) { const q = i + d; if (q >= 0 && q < B) { t += lut[q]; c++; } } sm[i] = t / c; }
  return (v) => sm[Math.min(B - 1, Math.max(0, Math.round(v * 10)))];
}

/** per hue sector (12 × 30°, chroma > 6): share, mean chroma, mean L and the circular-mean hue */
const SECT = 12;
const sectorOf = (a, b) => Math.floor(((Math.atan2(b, a) / (2 * Math.PI) + 1) % 1) * SECT) % SECT;
function hueStats(lab, idx, mapL, mapC) {
  const n = new Float64Array(SECT), c = new Float64Array(SECT), l = new Float64Array(SECT), sx = new Float64Array(SECT), sy = new Float64Array(SECT);
  for (const i of idx) {
    const a = lab[i * 3 + 1], b = lab[i * 3 + 2], C = Math.hypot(a, b);
    if (C < 6) continue;
    const s = sectorOf(a, b);
    n[s] += 1; c[s] += mapC(C); l[s] += mapL(lab[i * 3]); sx[s] += a / C; sy[s] += b / C;
  }
  const tot = idx.length;
  return Array.from({ length: SECT }, (_, s) => ({ share: n[s] / tot, C: n[s] ? c[s] / n[s] : 0, L: n[s] ? l[s] / n[s] : 0, h: Math.atan2(sy[s], sx[s]) }));
}

/** build the per-pixel colour map for this model: (L,a,b) → (L',a',b').
 *  Global: L and chroma each histogram-matched to the reference (the tonal / saturation distribution: nothing black,
 *  the grey stone greyer, the gold brighter). Then per hue sector (chromatic texels only): the sector's mean L and
 *  mean chroma pulled to the reference's same sector, and its hue nudged toward it (±20°) — so a crimson cape stays
 *  crimson and dark while bronze turns bright gold (a global shift would pull every hue toward the average). */
function makeMap(srcLab, srcIdx, refLab, refIdx, knobs) {
  const k = knobs.k ?? 0.85, lift = knobs.lift ?? 4, sat = knobs.sat ?? 1, gain = knobs.gain ?? 1, hiSat = knobs.hiSat ?? 1;
  const S = stats(srcLab, srcIdx), R = stats(refLab, refIdx);
  const Cof = (lab) => (i) => Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]);
  const mapL = cdfLut((i) => srcLab[i * 3], srcIdx, (i) => refLab[i * 3], refIdx, 100);
  const mapC = cdfLut(Cof(srcLab), srcIdx, Cof(refLab), refIdx, 130);
  const hs = hueStats(srcLab, srcIdx, mapL, mapC), hr = hueStats(refLab, refIdx, (v) => v, (v) => v);
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const sect = hs.map((s, i) => {
    const r = hr[i];
    if (s.share < 0.003 || r.share < 0.003) return { cr: 1, dl: 0, dh: 0 };
    return { cr: clamp(r.C / Math.max(1e-3, s.C), 0.7, 1.4), dl: clamp(r.L - s.L, -15, 15), dh: clamp(wrap(r.h - s.h), -0.35, 0.35) };
  });
  return {
    S, R,
    map(L, a, b) {
      const C = Math.hypot(a, b), h = Math.atan2(b, a);
      const u = ((h / (2 * Math.PI) + 1) % 1) * SECT - 0.5, i0 = (Math.floor(u) + SECT) % SECT, i1 = (i0 + 1) % SECT, t = u - Math.floor(u);
      const lerp = (key) => sect[i0][key] * (1 - t) + sect[i1][key] * t;
      const w = clamp((C - 6) / 14, 0, 1); // chromatic weight
      let L2 = mapL(L) + lerp('dl') * w;
      L2 += lift * Math.max(0, 1 - L2 / 55) ** 2; // toe lift: nothing black
      L2 = Math.min(98, L2 * gain);
      const hi = clamp((L2 - 55) / 20, 0, 1); // the light paint (felt, birch): hiSat scales its chroma
      // chroma hist-match as a ratio; near-grey texels are never pushed up (their hue is noise)
      const up = mapC(C) / Math.max(C, 1e-3), rc = up > 1 ? 1 + (up - 1) * clamp((C - 3) / 7, 0, 1) : up;
      const C2 = C * rc * (1 + (lerp('cr') - 1) * w) * sat * (1 + (hiSat - 1) * hi), h2 = h + lerp('dh') * w * 0.8;
      const a2 = C2 * Math.cos(h2), b2 = C2 * Math.sin(h2);
      return [L + (L2 - L) * k, a + (a2 - a) * k, b + (b2 - b) * k];
    },
  };
}

async function readRgba(pathOrBuf) {
  const { data, info } = await sharp(pathOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
async function applyMap(img, mapper) {
  const { data, w, h } = await readRgba(img);
  const n = w * h, lab = toLab(data, n), out = Buffer.from(data);
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const [L, a, b] = mapper.map(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
    const [r, g, bb] = labToRgb(L, a, b);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = bb;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** texels covered by the mesh's UV triangles */
function uvMask(doc, w, h) {
  const mask = new Uint8Array(w * h);
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const uv = prim.getAttribute('TEXCOORD_0'); if (!uv) continue;
    const ind = prim.getIndices(); const nIdx = ind ? ind.getCount() : uv.getCount();
    const at = (i) => (ind ? ind.getScalar(i) : i);
    const p = [0, 0];
    for (let t = 0; t < nIdx; t += 3) {
      const P = [0, 1, 2].map((o) => { uv.getElement(at(t + o), p); return [p[0] * w, p[1] * h]; });
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const d = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l0 = ((P[1][1] - P[2][1]) * (px - P[2][0]) + (P[2][0] - P[1][0]) * (py - P[2][1])) / d;
        const l1 = ((P[2][1] - P[0][1]) * (px - P[2][0]) + (P[0][0] - P[2][0]) * (py - P[2][1])) / d;
        if (l0 >= -0.01 && l1 >= -0.01 && 1 - l0 - l1 >= -0.01) mask[y * w + x] = 1;
      }
    }
  }
  return mask;
}


/** the reference's object pixels: off the white background, eroded 3 px (the anti-aliased rim is neither) */
async function refObject(path) {
  const ref = await readRgba(path);
  const n = ref.w * ref.h, obj = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const m = Math.min(ref.data[i * 4], ref.data[i * 4 + 1], ref.data[i * 4 + 2]); obj[i] = 255 - m > 24 ? 1 : 0; }
  let cur = obj;
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(cur);
    for (let y = 1; y < ref.h - 1; y++) for (let x = 1; x < ref.w - 1; x++) {
      const i = y * ref.w + x;
      if (cur[i] && (!cur[i - 1] || !cur[i + 1] || !cur[i - ref.w] || !cur[i + ref.w])) next[i] = 0;
    }
    cur = next;
  }
  const idx = []; for (let i = 0; i < n; i++) if (cur[i]) idx.push(i);
  return { ref, idx };
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const [name, knobs] of Object.entries(CFG.hulls)) {
  if (only.length > 0 && !only.includes(name)) continue;
  // a hull may keep its own round (`src`) and staging folder (`post`)
  const OUT = knobs.src ? resolvePath(ROOT, knobs.src) : OUT0, POSTH = knobs.post ? tilde(knobs.post) : POST;
  const doc = await io.read(join(POSTH, name, `${name}.glb`));
  const mat = doc.getRoot().listMaterials()[0];
  const tex = mat?.getBaseColorTexture() ?? doc.getRoot().listTextures()[0];
  const img = tex?.getImage(); if (!tex || !img) throw new Error(`${name}: no base colour texture`);
  const atlas = await readRgba(Buffer.from(img));
  const mask = uvMask(doc, atlas.w, atlas.h);
  const srcIdx = []; for (let i = 0; i < mask.length; i++) if (mask[i]) srcIdx.push(i);
  const srcLab = toLab(atlas.data, atlas.w * atlas.h);
  const { ref, idx: refIdx } = await refObject(join(OUT, `ref-${name}.jpg`));
  const refLab = toLab(ref.data, ref.w * ref.h);
  const mapper = makeMap(srcLab, srcIdx, refLab, refIdx, knobs);
  const png = await applyMap(Buffer.from(img), mapper);
  tex.setImage(new Uint8Array(png)).setMimeType('image/png');
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext instanceof EXTMeshoptCompression) ext.dispose();
  const mid = join(TMP, `${name}.glb`);
  await io.write(mid, doc);
  for (const [out, size] of [[`${name}.glb`, 1024], [`${name}.phone.glb`, 512]]) {
    execFileSync(GT, ['optimize', mid, join(OUT, out), '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(size),
      '--simplify', 'false', '--instance', 'false', '--weld', 'false'], { stdio: 'pipe' });
  }
  const r = (v) => v.map((x) => x.toFixed(1)).join('/');
  console.log(`${name.padEnd(11)} Lab src ${r(mapper.S.m)} -> ref ${r(mapper.R.m)}  ` +
    `${(statSync(join(OUT, `${name}.glb`)).size / 1e3).toFixed(0)} KB / ${(statSync(join(OUT, `${name}.phone.glb`)).size / 1e3).toFixed(0)} KB`);
}
