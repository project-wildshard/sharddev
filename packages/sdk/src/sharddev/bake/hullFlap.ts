/**
 * ONE-FORMAT OF27b: a rigged hull's generator flap pressed at build (the hull book pressed it at load: engine
 * `looks/riggedHulls.ts` `pressFlap`, the same numbers and the same arithmetic). A flap is not a separate part: it IS the
 * surface pulled back and down, so it is collapsed, not cut. Every vertex above `yMin` behind the back plane is pressed
 * onto that plane, keeping `keep` of its depth, the patch domed out by `bulge`; only positions move, and the moved
 * vertices' normals are re-derived from their faces (welded at 0.1 mm, so a uv seam's split copies share one normal).
 */
import type { RiggedHullFlap } from '@wildshard/format/riggedHulls';

/** Press `flap` into `pos` / `nrm` in place; the pressed vertices (1 = moved), or null when none moved. */
export function pressHullFlap(pos: Float32Array, nrm: Float32Array, index: ArrayLike<number>, flap: RiggedHullFlap): Uint8Array | null {
  const n = pos.length / 3, moved = new Uint8Array(n), plane = (y: number): number => flap.z0 + (y - flap.y0) * flap.slope;
  let count = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3] ?? 0, y = pos[i * 3 + 1] ?? 0, z = pos[i * 3 + 2] ?? 0;
    if (y < flap.yMin || z >= plane(y)) continue;
    moved[i] = 1; count++;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (count === 0) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = Math.max(0.02, (x1 - x0) / 2), hy = Math.max(0.02, (y1 - y0) / 2);
  for (let i = 0; i < n; i++) {
    if (moved[i] !== 1) continue;
    const x = pos[i * 3] ?? 0, y = pos[i * 3 + 1] ?? 0, z = pos[i * 3 + 2] ?? 0, zp = plane(y);
    const r2 = ((x - cx) / hx) ** 2 + ((y - cy) / hy) ** 2;
    pos[i * 3 + 2] = zp - (zp - z) * flap.keep - flap.bulge * Math.max(0, 1 - r2);
  }
  const ids = weldIds(pos);
  let welded = 0;
  for (let i = 0; i < n; i++) welded = Math.max(welded, (ids[i] ?? 0) + 1);
  const hit = new Uint8Array(welded);
  for (let i = 0; i < n; i++) if (moved[i] === 1) hit[ids[i] ?? 0] = 1;
  const acc = new Float64Array(welded * 3);
  for (let f = 0; f + 2 < index.length; f += 3) {
    const a = index[f] ?? 0, b = index[f + 1] ?? 0, c = index[f + 2] ?? 0;
    if (hit[ids[a] ?? 0] !== 1 && hit[ids[b] ?? 0] !== 1 && hit[ids[c] ?? 0] !== 1) continue;
    const ax = pos[a * 3] ?? 0, ay = pos[a * 3 + 1] ?? 0, az = pos[a * 3 + 2] ?? 0;
    const ux = (pos[b * 3] ?? 0) - ax, uy = (pos[b * 3 + 1] ?? 0) - ay, uz = (pos[b * 3 + 2] ?? 0) - az;
    const vx = (pos[c * 3] ?? 0) - ax, vy = (pos[c * 3 + 1] ?? 0) - ay, vz = (pos[c * 3 + 2] ?? 0) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const o = (ids[v] ?? 0) * 3; acc[o] = (acc[o] ?? 0) + nx; acc[o + 1] = (acc[o + 1] ?? 0) + ny; acc[o + 2] = (acc[o + 2] ?? 0) + nz; }
  }
  for (let i = 0; i < n; i++) {
    const id = ids[i] ?? 0;
    if (hit[id] !== 1) continue;
    const x = acc[id * 3] ?? 0, y = acc[id * 3 + 1] ?? 0, z = acc[id * 3 + 2] ?? 0, l = Math.hypot(x, y, z);
    if (l < 1e-12) continue;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  return moved;
}

function weldIds(pos: ArrayLike<number>): Int32Array {
  const n = Math.floor(pos.length / 3), ids = new Int32Array(n), weld = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round((pos[i * 3] ?? 0) * 1e4)},${Math.round((pos[i * 3 + 1] ?? 0) * 1e4)},${Math.round((pos[i * 3 + 2] ?? 0) * 1e4)}`;
    let id = weld.get(key);
    if (id === undefined) { id = weld.size; weld.set(key, id); }
    ids[i] = id;
  }
  return ids;
}
