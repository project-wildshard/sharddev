import * as THREE from 'three';
import { Noise2D } from '../noise';
import type { RngState } from '../random';
import { Rng as NativeRng } from '@wildshard/engine/core/rng';
import { setLowPoly as setNativeLowPoly, registerToonPaint as registerNativePaint } from '@wildshard/engine/entities/species/loft';
import { BEAR } from '@wildshard/engine/game/systems/species/bear';
import { BOAR } from '@wildshard/engine/game/systems/species/boar';
import { BEAR_LOOK } from '@wildshard/engine/game/systems/species/view/bear';
import { BOAR_LOOK } from '@wildshard/engine/game/systems/species/view/boar';
import type { SpeciesRow } from '@wildshard/engine/ai/species';
import type { SpeciesDef } from '@wildshard/engine/entities/species/registry';
import { readSpecies, SpeciesSchema, type SpeciesData } from '@wildshard/format/speciesPrograms';

/** Complete authored gameplay, fur, variant and rig policy before an owned body builder is attached. */
export type AuthorSpeciesRows = Omit<SpeciesDef, 'build'>;

/** Build-only extraction of gameplay fields from a resolved species. Visual variants stay with their look;
 * a species with native think/act callbacks refuses instead of silently discarding its behaviour. */
export function bakeSpecies(row: Omit<SpeciesRow, 'id'>, speciesId: string): SpeciesData {
  if (row.think !== undefined || row.act !== undefined) throw new Error('Species programmes require callback-free gameplay rows');
  const fields: Record<string, unknown> = { id: speciesId };
  for (const key of Object.keys(SpeciesSchema.entries)) {
    if (key === 'id' || key === 'variants' || key === 'spawnOnly' || !Object.hasOwn(row, key)) continue;
    const value: unknown = Reflect.get(row, key); fields[key] = value;
  }
  const variant = ({ id, label, weight, rarity, scale, hp, mods }: SpeciesRow['variants'][number]): SpeciesRow['variants'][number] =>
    ({ id, label, weight, rarity, scale, ...(hp === undefined ? {} : { hp }), ...(mods === undefined ? {} : { mods }) });
  fields['variants'] = row.variants.map(variant);
  if (row.spawnOnly !== undefined) fields['spawnOnly'] = row.spawnOnly.map(variant);
  return readSpecies(fields);
}

/** Admit fresh shared boar/bear gameplay metadata; no live species or parent identity escapes. */
export function commonSpeciesRows(kind: 'boar' | 'bear', speciesId: string): SpeciesData {
  return bakeSpecies(kind === 'boar' ? BOAR : BEAR, speciesId);
}

/** Derive callback-free author data, preserving inherited fields and the original tuning merge. */
export function deriveSpeciesRows(parent: SpeciesData, patch: Partial<SpeciesData> & { id: string }): SpeciesData {
  const row = { ...parent, ...patch };
  if (parent.tuning !== undefined && patch.tuning !== undefined) row.tuning = { ...parent.tuning, ...patch.tuning };
  return readSpecies(row);
}

/** A geometry recipe's palette and shape knobs, without simulation or runtime owners. */
export interface VariantDef {
  id: string; label: string; weight: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  scale: [number, number];
  tint?: Record<string, [number, number, number]>;
  traits?: Record<string, number | boolean | string>;
}
/** One authored joint in model space. */
export interface BoneDef { name: string; parent: string | null; pos: [number, number, number] }
/** Data-only dimensions accompanying the baked skin. */
export interface AnimalDims {
  /** height of the body bone (spine centre) above ground in the bind pose */
  bodyY: number;
  /** half-length of the body capsule along Z (for hit tests) */
  bodyHalfLen: number;
  /** radius of the body capsule */
  bodyRadius: number;
  /** head hit-sphere radius */
  headRadius: number;
  /** rest length of the front leg (shoulder → hoof) — drives stride frequency */
  legLen: number;
  /** foot rest positions (x, z) per leg FL, FR, BL, BR */
  feet: [number, number][];
  /** width of the body (for the corpse's resting height when rolled on its side) */
  halfWidth: number;
  /** body hit-capsule axis: 'z' (default, along the spine of a quadruped) or 'y' (upright: the Drowned Sailor) */
  capsuleAxis?: 'z' | 'y';
  /** the head ball's centre, head-bone local (model units); default the joint itself. A hull whose skull sits off its head
   *  joint (the Antler King, E350 F-X2) moves the ball onto it */
  headAt?: readonly [number, number, number];
  /** the body capsule's centre, body-bone local (model units; default the joint), and its axis tilted `bodyPitch` rad from
   *  the bone's z toward its y (+ = the front up) — a 'z' capsule only */
  bodyAt?: readonly [number, number, number];
  bodyPitch?: number;
  /** a second body capsule across `bone`'s x axis (the Antler King's shoulders and chest, E350 F-X2): centre (bone local,
   *  model units), half-length along x and radius. Its hits are body hits */
  fore?: { readonly bone: string; readonly at: readonly [number, number, number]; readonly halfLen: number; readonly radius: number };
}
/** Owned, unmerged body parts produced offline. */
export interface AnimalSpecies {
  bones: BoneDef[];
  /** geometries drawn with the fur material + fur shells (loft() output: has color / skin / furLen attributes) */
  furParts: THREE.BufferGeometry[];
  /** hard parts: hooves, antlers, tusks, snout (no fur shells, vertex colours only) */
  hardParts: THREE.BufferGeometry[];
  /** eye spheres (glossy clearcoat material) */
  eyeParts: THREE.BufferGeometry[];
  dims: AnimalDims;
  /** low-poly style: a base-colour texture on the rig's material (a generated model's own paint, e.g. the Drowned
   *  Captain); the vertex colours multiply it, so textured parts carry white */
  map?: THREE.Texture;
  /** low-poly style: the per-facet lightness jitter (lowpoly.ts facetGeometry, default 0.12) — 0 for a textured model */
  facetJitter?: number;
  /** low-poly style, with `map`: the texture fed back as emissive at this intensity, so a painted model keeps its colours
   *  in shade (the flat toon fill alone left the captain's navy coat near-black) */
  selfLight?: number;
}

/** Offline loft math preserves the runtime station order and floating-point arithmetic. */
export interface Station {
  x: number; y: number; z: number;
  rx: number; ry: number;
  top: number; bot: number;       // asymmetric vertical scale (withers hump / deep belly)
  b0: number; b1: number; w1: number; // skin: bone b0 with weight 1-w1, bone b1 with w1
}

/** vertex colour callback: (out, x, y, z, nx, ny, nz, part, t = 0..1 along the part, a = ring angle) */
export type Paint = (out: THREE.Color, x: number, y: number, z: number, nx: number, ny: number, nz: number, part: string, t: number, a: number) => void;

export const TEX_M = 0.32; // metres per detail-texture repeat

/** sRGB colour triple, 0..1 (palette entries and VariantDef.tint values) */
export type RGB = [number, number, number];

const _t = new THREE.Vector3(), _side = new THREE.Vector3(), _up = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();

/** shared low-frequency noise for coat mottling / patches (fbm ≈ -1..1) */
export const paintNoise: Noise2D = new Noise2D(4242);

export const srgb = (r: number, g: number, b: number): THREE.Color => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
export const mix = (out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color => { out.copy(a).lerp(b, THREE.MathUtils.clamp(t, 0, 1)); return out; };
   // the one smoothstep (E357 X5)

/** the species palette as THREE.Colors, each entry overridden by the variant's tint of the same name (VariantDef.tint) */
export function paletteColors<K extends string>(base: Record<K, RGB>, tint: Record<string, RGB> | undefined): Record<K, THREE.Color> {
  const out: Partial<Record<K, THREE.Color>> = {};
  for (const k of Object.keys(base) as K[]) { const c = tint?.[k] ?? base[k]; out[k] = srgb(c[0], c[1], c[2]); }
  return out as Record<K, THREE.Color>;   // every key of `base` was just filled in
}

/** station helper */
export const S: (x: number, y: number, z: number, rx: number, ry: number, b0: number, b1?: number, w1?: number, top?: number, bot?: number) => Station = (x: number, y: number, z: number, rx: number, ry: number, b0: number, b1: number = b0, w1 = 0, top = 1, bot = 1): Station => ({ x, y, z, rx, ry, top, bot, b0, b1, w1 });

/** name → index lookup for a BoneDef list (throws on a typo) */
export function boneIndex(bones: { name: string }[]): (name: string) => number {
  const m = new Map<string, number>();
  bones.forEach((b, i) => { m.set(b.name, i); });
  return (name: string) => { const i = m.get(name); if (i === undefined) throw new Error(`no bone ${name}`); return i; };
}

/**
 * Relative fur length per vertex (1 = the species' base shell length). Long on the body, neck mane and
 * boar crest; short on the face, ears and lower legs; none on hard parts.
 */
function furLength(part: string, y: number, ny: number, t: number): number {
  switch (part) {
    case 'body': return ny < -0.5 ? 0.7 : 1.0;
    case 'neck': return 1.15;
    case 'head': return t < 0.5 ? 0.45 : 0.2;
    case 'ear': return 0.25;
    case 'leg': return y > 0.5 ? 0.55 : y > 0.25 ? 0.3 : 0.15;
    case 'tail': return 0.9;
    case 'crest': return 1.9;
    default: return 0;
  }
}


/** metres of noise displacement along the ring normal (set per species before lofting; reset to 0 after build) */
let shagAmp = 0;
export function setShag(amp: number): void { shagAmp = amp; }

/**
 * An optional surface-shape function for the lofts that follow: (x, y, z, part) → metres to push the vertex out along
 * its normal (the sheep's wool lumps, a wolf's fur clumps). The Paint callback sees the displaced position, so it can
 * shade the troughs. Set per species in build(), reset to null after (Pine Hollow / Driftwood never set it).
 */
let shapeFn: ((x: number, y: number, z: number, part: string) => number) | null = null;
export function setShapeFn(fn: ((x: number, y: number, z: number, part: string) => number) | null): void { shapeFn = fn; }

/**
 * Low-poly mode (Driftwood Isle, `ShardManifest.style === 'toon'`; set by AnimalFactory around `build()`):
 * every loft gets `lowPolySides()` sides instead of what it asks for and no shag noise; the factory then
 * de-indexes the merged model for flat facets (see `src/client/engine/entities/lowpoly.ts`). Species files may branch on
 * `isLowPoly()` for a different palette or part (the boar's crest becomes a row of spikes).
 */
let lowPoly = false;
const authorPaints = new Map<string, (variant?: VariantDef) => Paint>();
/** Current explicit offline geometry style; independent of any runtime species owner. */
export function isLowPoly(): boolean { return lowPoly; }
/** Palette supplied to the author geometry context; no runtime registry is lent out. */
export function toonPaint(kind: string): ((variant?: VariantDef) => Paint) | null { return authorPaints.get(kind) ?? null; }

/** Pure geometry kernels a recipe consumes; native before-controls may supply an independent compiler. */
export interface SpeciesGeometryCompiler {
  readonly loft: typeof loft;
  readonly tube: typeof tube;
  readonly skinPlain: typeof skinPlain;
  readonly S: typeof S;
  readonly boneIndex: typeof boneIndex;
  readonly srgb: typeof srgb;
  readonly mix: typeof mix;
  readonly paintNoise: Pick<Noise2D, 'fbm'>;
  readonly setShag: typeof setShag;
  readonly isLowPoly: typeof isLowPoly;
  readonly toonPaint: typeof toonPaint;
  readonly paletteColors: typeof paletteColors;
}

/** ring sides for a loft that asks for `seg` in PBR: big parts 6, legs 5, ears / hooves / tusks 4 */
export function lowPolySides(seg: number): number { return seg >= 16 ? 6 : seg >= 11 ? 5 : 4; }

/** Loft a closed tube through `st` stations with `seg` sides; returns an indexed geometry with position/normal/uv/color/skinIndex/skinWeight. */
export function loft(st: Station[], sides: number, part: string, paint: Paint, capStart = true, capEnd = true, frame: 'x' | 'z' = 'x'): THREE.BufferGeometry {
  const seg = lowPoly ? lowPolySides(sides) : sides;
  const n = st.length;
  const at = (i: number): Station => { const s = st[i]; if (s === undefined) throw new Error(`loft: no station ${i}`); return s; };
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], fl: number[] = [];
  const idx: number[] = [];
  // arc length along the spine for v
  const along: number[] = [0];
  for (let i = 1; i < n; i++) { const a = at(i), b = at(i - 1); along.push((along[i - 1] ?? 0) + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
  const total = (along[n - 1] ?? 0) || 1;
  let circ = 0;
  for (const s of st) circ += Math.PI * (s.rx + s.ry);
  const uRep = Math.max(1, Math.round(circ / n / TEX_M));
  const ringVerts = seg + 1;
  for (let i = 0; i < n; i++) {
    const s = at(i), al = along[i] ?? 0;
    const p0 = at(Math.max(0, i - 1)), p1 = at(Math.min(n - 1, i + 1));
    _t.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).normalize();
    // ring frame: 'x' keeps the ring's side axis on +X (no twist along bilateral parts; order stations
    // so the tangent runs +Z or down), 'z' keeps the ring's thin axis facing +Z (ears)
    if (frame === 'x') _side.set(1, 0, 0).addScaledVector(_t, -_t.x).normalize();
    else _side.set(0, 0, 1).cross(_t).normalize();
    _up.crossVectors(_t, _side).normalize();
    // radius change per metre → tilts normals along the taper
    const dr = ((p1.rx + p1.ry) - (p0.rx + p0.ry)) * 0.5 / Math.max(1e-3, (along[Math.min(n - 1, i + 1)] ?? 0) - (along[Math.max(0, i - 1)] ?? 0));
    const t = al / total;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const vs = sa > 0 ? s.top : s.bot;
      const rx = Math.max(1e-4, s.rx), ry = Math.max(1e-4, s.ry * vs);
      let px = s.x + _side.x * rx * ca + _up.x * ry * sa;
      let py = s.y + _side.y * rx * ca + _up.y * ry * sa;
      let pz = s.z + _side.z * rx * ca + _up.z * ry * sa;
      // ellipse normal: (cos/rx, sin/ry) in the ring frame, then tilt by the taper
      _n.set(_side.x * ca / rx + _up.x * sa / ry, _side.y * ca / rx + _up.y * sa / ry, _side.z * ca / rx + _up.z * sa / ry).normalize();
      _n.addScaledVector(_t, -dr).normalize();
      // shaggy coat: push the surface in/out with noise so the silhouette isn't a smooth tube (big parts only)
      if (shagAmp > 0 && !lowPoly && (part === 'body' || part === 'neck' || part === 'head' || part === 'crest')) {
        const amp = shagAmp * Math.min(1, (rx + ry) / 0.25) * (part === 'crest' ? 2.5 : 1);
        const d = paintNoise.fbm(px * 9 + py * 3, pz * 9 - py * 4, 3) * amp;
        px += _n.x * d; py += _n.y * d; pz += _n.z * d;
      }
      if (shapeFn !== null && !lowPoly) {
        const d = shapeFn(px, py, pz, part);
        px += _n.x * d; py += _n.y * d; pz += _n.z * d;
      }
      pos.push(px, py, pz); nor.push(_n.x, _n.y, _n.z);
      uv.push((j / seg) * uRep, al / TEX_M);
      paint(_c, px, py, pz, _n.x, _n.y, _n.z, part, t, a);
      col.push(_c.r, _c.g, _c.b);
      si.push(s.b0, s.b1, 0, 0); sw.push(1 - s.w1, s.w1, 0, 0);
      fl.push(furLength(part, py, _n.y, t));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * ringVerts + j, b = a + 1, c = a + ringVerts, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const cap = (i: number, flip: boolean) => {
    const s = at(i), al = along[i] ?? 0;
    const p0 = at(Math.max(0, i - 1)), p1 = at(Math.min(n - 1, i + 1));
    _t.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).normalize();
    if (flip) _t.negate();
    const ci = pos.length / 3;
    pos.push(s.x, s.y, s.z); nor.push(_t.x, _t.y, _t.z); uv.push(0.5 * uRep, al / TEX_M);
    paint(_c, s.x, s.y, s.z, _t.x, _t.y, _t.z, part, al / total, 0);
    col.push(_c.r, _c.g, _c.b); si.push(s.b0, s.b1, 0, 0); sw.push(1 - s.w1, s.w1, 0, 0); fl.push(furLength(part, s.y, _t.y, al / total));
    for (let j = 0; j < seg; j++) {
      const a = i * ringVerts + j, b = a + 1;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('furLen', new THREE.Float32BufferAttribute(fl, 1));
  g.setIndex(idx);
  // smooth face-averaged normals (more robust than the analytic ring normal on coarse lofts); the
  // duplicated uv-seam vertices get the average of both sides so the seam is invisible
  g.computeVertexNormals();
  const na = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    const a = i * ringVerts, b = a + seg;
    _n.set(na.getX(a) + na.getX(b), na.getY(a) + na.getY(b), na.getZ(a) + na.getZ(b)).normalize();
    na.setXYZ(a, _n.x, _n.y, _n.z); na.setXYZ(b, _n.x, _n.y, _n.z);
  }
  return g;
}

/** Give a plain geometry (sphere) colour + skin attributes for one bone. */
export function skinPlain(g: THREE.BufferGeometry, bone: number, part: string, paint: Paint): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute, nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const cnt = p.count;
  const col = new Float32Array(cnt * 3), si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i++) {
    paint(_c, p.getX(i), p.getY(i), p.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i), part, 0.5, 0);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    si[i * 4] = bone; sw[i * 4] = 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('furLen', new THREE.BufferAttribute(new Float32Array(cnt), 1)); // eyes: no fur
  return g;
}

/** Sweep a tapered tube along a polyline (antler beams, tusks). */
export function tube(points: [number, number, number][], r0: number, r1: number, bone: number, part: string, paint: Paint, seg = 7): THREE.BufferGeometry {
  // subdivide for smoothness (catmull-rom)
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.3);
  const N = lowPoly ? Math.max(3, points.length + 1) : Math.max(4, points.length * 4);   // faceted tusks / antlers: one bend per point
  const st: Station[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPoint(t);
    const r = THREE.MathUtils.lerp(r0, r1, t ** 0.8);
    st.push({ x: p.x, y: p.y, z: p.z, rx: r, ry: r, top: 1, bot: 1, b0: bone, b1: bone, w1: 0 });
  }
  // rounded tip
  const last = st[st.length - 1], prev = st[st.length - 2];
  if (last === undefined || prev === undefined) throw new Error('tube: fewer than two stations');   // N >= 3 above
  st.push({ ...last, x: last.x + (last.x - prev.x) * 0.6, y: last.y + (last.y - prev.y) * 0.6, z: last.z + (last.z - prev.z) * 0.6, rx: r1 * 0.35, ry: r1 * 0.35 });
  return loft(st, seg, part, paint);
}

/** Build a bounded author recipe in the same low-poly paint context as shared bodies.
 * The callback returns owned geometry; no runtime species/installer is lent out. */
export function withSpeciesGeometry<T>(paints: Readonly<Record<string, (variant?: VariantDef) => Paint>>, run: () => T): T {
  lowPoly = true;
  setNativeLowPoly(true);
  for (const [kind, paint] of Object.entries(paints)) { authorPaints.set(kind, paint); registerNativePaint(kind, paint); }
  try { return run(); }
  finally { lowPoly = false; setNativeLowPoly(false); }
}

/** Common authored body kinds, not runtime species handles. */
export type CommonBodyKind = 'boar' | 'bear';
/** Enumerate each common body's authored variant knobs in their original row order. */
export function commonBodyVariants(kind: CommonBodyKind): VariantDef[] {
  const row = kind === 'boar' ? BOAR : BEAR, look = kind === 'boar' ? BOAR_LOOK : BEAR_LOOK;
  return row.variants.map(({ id }): VariantDef => {
    const variant: VariantDef = { id, label: id, weight: 1, rarity: 'common', scale: [1, 1] };
    return Object.assign(variant, look.variants?.[id]);
  });
}
/** Run a common body's native geometry recipe with an explicit RNG continuation.
 * The author owns both the returned parts and the next continuation. */
export function bakeCommonBody(kind: CommonBodyKind, variant: VariantDef, state: RngState): { body: AnimalSpecies; random: RngState } {
  const rng = new NativeRng(0);
  rng.restore(state);
  const body = (kind === 'boar' ? BOAR_LOOK : BEAR_LOOK).build(variant, rng);
  return { body, random: rng.snapshot() };
}
