import * as THREE from 'three'

import { loft, S, type Paint } from './loft.ts'

export function crestSpikes(
  pts: [number, number, number, number, number, number][],
  yOff: number,
  paint: Paint,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const P = pts.filter(p => p[2] >= 0.03).sort((a, b) => a[0] - b[0]) // rear → front
  if (P.length < 2) return out
  const first = P[0],
    last = P[P.length - 1]
  if (first === undefined || last === undefined) return out
  const z0 = first[0],
    z1 = last[0],
    step = 0.082
  const n = Math.max(2, Math.round((z1 - z0) / step))
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n
    let k = 0
    while (k < P.length - 2 && (P[k + 1]?.[0] ?? Infinity) < z) k++
    const a = P[k],
      b = P[k + 1]
    if (a === undefined || b === undefined) continue
    const u = THREE.MathUtils.clamp(
      (z - a[0]) / Math.max(1e-4, b[0] - a[0]),
      0,
      1,
    )
    const y = a[1] + (b[1] - a[1]) * u,
      ry = a[2] + (b[2] - a[2]) * u
    const near = u < 0.5 ? a : b
    // the PBR fin sits mostly inside the back (its fur shells do the work); the spikes start at the skin
    const h =
      (ry * 1.8 + 0.03) * (i % 2 ? 0.72 : 1) * (0.8 + 0.2 * Math.sin(z * 5 + 1))
    const baseY = y + 0.02 + yOff
    out.push(
      loft(
        [
          S(0, baseY - 0.05, z, 0.034, 0.05, near[3], near[4], near[5]),
          S(
            0,
            baseY + h * 0.45,
            z - h * 0.2,
            0.02,
            0.03,
            near[3],
            near[4],
            near[5],
          ),
          S(
            0,
            baseY + h,
            z - h * 0.55,
            0.003,
            0.003,
            near[3],
            near[4],
            near[5],
          ),
        ],
        4,
        'crest',
        paint,
        false,
        false,
      ),
    )
  }
  return out
}
