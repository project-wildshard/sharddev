import { forearm, gloveFist, riderArm } from '@wildshard/engine/player/firstPersonArms';
import { Color, Vector3, BufferGeometry, BufferAttribute, DynamicDrawUsage } from 'three';
import { parse } from 'valibot';
import { ReinPresentationSchema, type ReinPresentationRows, type ReinRibbonRows } from '@wildshard/format/riding';

/** Own a linear author colour: numeric hex retains the native sRGB conversion; triples are already linear. */
export function bakeArmColour(value: number | readonly [number, number, number]): Color {
  return typeof value === 'number' ? new Color(value).convertSRGBToLinear().multiplyScalar(1) : new Color(...value);
}

/** Independent colours in the original arm palette order, without a live view or shared mutable palette. */
export function bakeArmPalette(style: Parameters<typeof gloveFist>[0]): Record<keyof Parameters<typeof gloveFist>[0], Color> {
  return {
    leather: bakeArmColour(style.leather), leatherLight: bakeArmColour(style.leatherLight), leatherDark: bakeArmColour(style.leatherDark), leatherEdge: bakeArmColour(style.leatherEdge),
    thread: bakeArmColour(style.thread), jade: bakeArmColour(style.jade), jadeDark: bakeArmColour(style.jadeDark), fleece: bakeArmColour(style.fleece),
    fleeceShade: bakeArmColour(style.fleeceShade), fleeceDeep: bakeArmColour(style.fleeceDeep), wool: bakeArmColour(style.wool), woolShade: bakeArmColour(style.woolShade),
    red: bakeArmColour(style.red), redDeep: bakeArmColour(style.redDeep), redLine: bakeArmColour(style.redLine), gold: bakeArmColour(style.gold),
  };
}

/** A gloved first-person fist from an arm style (the engine's held-view fist law), for a held weapon's rest pool bake.
 *  Returns owned geometry and its wrist frame; nothing is drawn or installed. */
export function bakeGloveFist(style: Parameters<typeof gloveFist>[0], opts: Parameters<typeof gloveFist>[1]): ReturnType<typeof gloveFist> {
  return gloveFist(style, opts);
}

/** A rider's sleeved arm from an arm style (the engine's held-view arm law), for a held weapon's rest pool bake. */
export function bakeRiderArm(style: Parameters<typeof riderArm>[0], length?: number, seed?: number): ReturnType<typeof riderArm> {
  return riderArm(style, length, seed);
}

/** Construct owned fist/forearm geometry in the supplied grip direction, without a view or owner. */
export function bakeForearm(...args: Parameters<typeof forearm>): ReturnType<typeof forearm> { return forearm(...args); }

/** Admit the complete numeric strap/attachment policy without installing a riding view. */
export function reinPresentationRows(input: unknown): ReinPresentationRows { return parse(ReinPresentationSchema, input); }

function reinRgb(value: readonly number[]): [number, number, number] {
  const [r, g, b] = value;
  if (value.length !== 3 || r === undefined || g === undefined || b === undefined || !value.every(Number.isFinite)) throw new Error('Invalid rein colour');
  return [r, g, b];
}
function reinCatmull(out: Vector3, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, tangent: boolean): Vector3 {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number): number => tangent
    ? 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2)
    : 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

/** Bake the two camera-space straps from six Catmull-Rom anchors each.
 * Returns owned position/normal/colour/index channels; no material or view is constructed. */
export function bakeReinsGeometry(rows: ReinPresentationRows, paths: readonly (readonly Vector3[])[]): BufferGeometry {
  if (paths.length !== 2 || paths.some(path => path.length !== 6 || path.some(point => ![point.x, point.y, point.z].every(Number.isFinite))))
    throw new Error('Rein bake requires two finite six-anchor paths');
  if (!Number.isInteger(rows.span) || rows.span < 1 || rows.span > 64 || !Number.isFinite(rows.halfWidth) || rows.halfWidth <= 0) throw new Error('Invalid rein dimensions');
  const SEG = rows.span * 3;
  const LEATHER = new Color(...reinRgb(rows.colour)), LEATHER_EDGE = new Color(...reinRgb(rows.edge));
  const verts = 2 * (SEG + 1) * 2;
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3), col = new Float32Array(verts * 3), idx: number[] = [];
  for (let v = 0; v < verts; v++) {
    nrm[v * 3 + 2] = 1;
    const c = v % 2 === 0 ? LEATHER_EDGE : LEATHER;
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  for (let r = 0; r < 2; r++) {
    const o = r * (SEG + 1) * 2;
    for (let i = 0; i < SEG; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new BufferGeometry();
  const attr = new BufferAttribute(pos, 3);
  attr.setUsage(DynamicDrawUsage);
  g.setAttribute('position', attr);
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  for (const [r, path] of paths.entries()) fillBakedRein(pos, r, path, rows);
  return g;
}
function fillBakedRein(pos: Float32Array, r: number, K: readonly Vector3[], rows: ReinRibbonRows): void {
  const _p = new Vector3(), _t = new Vector3(), _s = new Vector3();
  const SPAN = rows.span, SEG = SPAN * 3;
  const o = r * (SEG + 1) * 2;
  for (let i = 0; i <= SEG; i++) {
    const span = Math.min(2, Math.floor(i / SPAN)), t = (i - span * SPAN) / SPAN;
    const p0 = K[span], p1 = K[span + 1], p2 = K[span + 2], p3 = K[span + 3];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    reinCatmull(_p, p0, p1, p2, p3, t, false);
    reinCatmull(_t, p0, p1, p2, p3, t, true);
    // a flat strap turned to the eye: its width across the tangent and the line of sight
    _s.crossVectors(_t, _p).normalize().multiplyScalar(rows.halfWidth);
    const k = (o + i * 2) * 3;
    pos[k] = _p.x + _s.x; pos[k + 1] = _p.y + _s.y; pos[k + 2] = _p.z + _s.z;
    pos[k + 3] = _p.x - _s.x; pos[k + 4] = _p.y - _s.y; pos[k + 5] = _p.z - _s.z;
  }
}
