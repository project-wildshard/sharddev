import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

await MeshoptSimplifier.ready;

/** Preserve an author's explicit asynchronous readiness boundary before compiling owned geometry. */
export function prepareGeometrySimplifier(): Promise<void> { return MeshoptSimplifier.ready; }

/** Author bakes simplify through the SDK (shard generators import only three, the SDK and commons): meshoptimizer's
 *  simplifier on an indexed position set, keeping every surface within `error` metres. Borders are free unless
 *  `lockBorder`. Returns the kept triangle indices. */
export function simplifyWithin(indices: Uint32Array, positions: Float32Array, error: number, lockBorder = false): Uint32Array {
  const scale = MeshoptSimplifier.getScale(positions, 3);
  return MeshoptSimplifier.simplify(indices, positions, 3, 0, error / scale, lockBorder ? ['LockBorder'] : [])[0];
}

/** Preserve painted colour/normal features while targeting a declared vertex budget. */
export interface PaintedReduction {
  readonly vertices: number; readonly colourWeight: number; readonly normalWeight: number; readonly error: number;
}
/** Reduce indexed position/normal/colour geometry and compact kept vertices in first-use order.
 * Reads numeric accessor values, returns detached Float32 channels and Uint32 indices;
 * the caller retains its source and owns the result. Other channels are intentionally omitted. */
export function simplifyPaintedGeometry(g: BufferGeometry, options: PaintedReduction): BufferGeometry {
  const { vertices: verts, colourWeight, normalWeight, error } = options;
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color'), src = g.getIndex();
  if (src === null) throw new Error('Painted geometry reduction requires an index');
  const count = p.count, pos = new Float32Array(count * 3), attr = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i);
    attr.set([c.getX(i), c.getY(i), c.getZ(i), n.getX(i), n.getY(i), n.getZ(i)], i * 6);
  }
  const index = Uint32Array.from({ length: src.count }, (_, i) => src.getX(i));
  const target = Math.round(index.length * (verts / count) / 3) * 3;
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(index, pos, 3, attr, 6, [colourWeight, colourWeight, colourWeight, normalWeight, normalWeight, normalWeight], null, target, error);
  const remap = new Int32Array(count).fill(-1), order: number[] = [], out = new Uint32Array(kept.length);
  for (let i = 0; i < kept.length; i++) {
    const v = kept[i] ?? 0;
    let m = remap[v] ?? -1;
    if (m < 0) { m = order.length; remap[v] = m; order.push(v); }
    out[i] = m;
  }
  const take = (a: BufferAttribute | InterleavedBufferAttribute): BufferAttribute => {
    const o = new Float32Array(order.length * 3);
    order.forEach((v, i) => { o[i * 3] = a.getX(v); o[i * 3 + 1] = a.getY(v); o[i * 3 + 2] = a.getZ(v); });
    return new BufferAttribute(o, 3);
  };
  const d = new BufferGeometry();
  d.setAttribute('position', take(p)); d.setAttribute('normal', take(n)); d.setAttribute('color', take(c));
  d.setIndex(new BufferAttribute(out, 1));
  return d;
}
