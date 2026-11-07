import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../random';

/** Native faceted boulder arithmetic; the caller owns its stream and returned geometry. */
export function bakeRock(r: number, detail: number, rng: Pick<Rng, 'range'>, squash = 0.7, rough = 0.28): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.getAttribute('position');
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 1 + rng.range(-rough, rough); seen.set(key, k); }
    pos.setXYZ(i, x * k, y * k * squash, z * k);
  }
  return g;
}

/** An ordered triangle soup containing the original Float32 positions only. */
export function bakeTriangles(v: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();

/** orient a geometry built along +Y (centred at origin, length 1 unit along y) from a to b */
function alongSegment(g: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  _d.subVectors(b, a);
  const len = _d.length();
  g.scale(1, len, 1);
  _q.setFromUnitVectors(UP, _d.normalize());
  g.applyQuaternion(_q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/**
 * A faceted log / beam / post between two points: an n-sided prism (default 6) tapering r0 → r1, the
 * ring rotated a random amount so neighbouring logs don't line their facets up.
 */
export function bakeLog(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number = r0, sides = 6, twist = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, 1, sides, 1, false, twist);
  return alongSegment(g, a, b);
}

/** a squared timber (w × h cross-section) between two points; `roll` spins it about its own axis */
export function bakeBeam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, roll = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, 1, h);
  if (roll !== 0) g.rotateY(roll);
  return alongSegment(g, a, b);
}

/** a rope / cable: a 4-sided tube through the points (segments share no caps; cheap and reads fine) */
export function bakeRope(points: THREE.Vector3[], r: number, sides = 4): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i], q = points[i + 1];
    if (p === undefined || q === undefined) continue;
    const g = new THREE.CylinderGeometry(r, r, 1, sides, 1, true, Math.PI / 4);
    parts.push(alongSegment(g, p, q).toNonIndexed());
  }
  return mergeGeometries(parts, false);
}

/** points along a catenary-ish sag from a to b (n segments), for ropes and rigging */
export function bakeSagLine(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 6): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t))); }
  return pts;
}


/** displace every distinct vertex position by up to ±amp (shared corners move together) */
export function bakeWobble(g: THREE.BufferGeometry, amp: number, rng: Pick<Rng, 'range'>): void {
  const pos = g.getAttribute('position');
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let d = seen.get(key);
    if (!d) { d = [rng.range(-amp, amp), rng.range(-amp, amp), rng.range(-amp, amp)]; seen.set(key, d); }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
}

/** a flat-bottomed plank/board: a box with its corners nudged (± wob) so rows of them look hand-sawn */
export function bakePlank(len: number, w: number, t: number, rng: Pick<Rng, 'range'>, wob = 0.012): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(len, t, w);
  bakeWobble(g, wob, rng);
  return g;
}
