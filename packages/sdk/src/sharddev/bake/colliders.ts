import { Matrix4, Quaternion, Vector3, IcosahedronGeometry, type BufferGeometry } from 'three';
import type { AuthorPlacement, ColliderDesc } from './placement';

/** Offline placement transform and its uniform scale; no live registry is constructed. */
export interface BakedPlacementPose {
  readonly x: number; readonly y: number; readonly z: number;
  readonly matrix: Matrix4; readonly quat: Quaternion; readonly scale: number; readonly upright: boolean;
}
const transform = new Matrix4(), position = new Vector3(), size = new Vector3();

/** Scale, yaw, lean X, lean Z, then translate; an explicit matrix is copied.
 * This is the successive placement convention, distinct from a model's YXZ Euler pose. */
export function bakePlacementPose(row: AuthorPlacement<object>): BakedPlacementPose {
  const matrix = new Matrix4();
  if (row.matrix === undefined) {
    const scale = row.scale ?? 1;
    matrix.makeScale(scale, scale, scale);
    if (row.yaw !== undefined) matrix.premultiply(transform.makeRotationY(row.yaw));
    if (row.leanX !== undefined) matrix.premultiply(transform.makeRotationX(row.leanX));
    if (row.leanZ !== undefined) matrix.premultiply(transform.makeRotationZ(row.leanZ));
    matrix.premultiply(transform.makeTranslation(row.x, row.y, row.z));
  } else matrix.copy(row.matrix);
  const quat = new Quaternion();
  matrix.decompose(position, quat, size);
  const upright = row.matrix === undefined ? (row.yaw ?? 0) === 0 && (row.leanX ?? 0) === 0 && (row.leanZ ?? 0) === 0 : Math.abs(quat.w) > 1 - 1e-12;
  return { x: row.x, y: row.y, z: row.z, matrix, quat, scale: size.x, upright };
}

/** Consume a geometry's channels in successive Float32 placement steps, preserving each rounding boundary.
 * An explicit matrix applies once; geometry ownership stays with the caller. */
export function bakePlacedGeometry(geometry: BufferGeometry, row: AuthorPlacement<object>): void {
  if (row.matrix !== undefined) { geometry.applyMatrix4(row.matrix); return; }
  if (row.scale !== undefined && row.scale !== 1) geometry.scale(row.scale, row.scale, row.scale);
  if (row.yaw !== undefined) geometry.rotateY(row.yaw);
  if (row.leanX !== undefined) geometry.rotateX(row.leanX);
  if (row.leanZ !== undefined) geometry.rotateZ(row.leanZ);
  geometry.translate(row.x, row.y, row.z);
}

/** Copy posed world vertices into a hull relative to the placement anchor, in original geometry/vertex order. */
export function bakeWorldHull(geometry: readonly BufferGeometry[], pose: Pick<BakedPlacementPose, 'x' | 'y' | 'z'>): Extract<ColliderDesc, { kind: 'hull' }> {
  let count = 0;
  for (const row of geometry) count += row.getAttribute('position').count;
  const points = new Float32Array(count * 3);
  let at = 0;
  for (const row of geometry) {
    const channel = row.getAttribute('position');
    for (let i = 0; i < channel.count; i++, at++) {
      points[at * 3] = channel.getX(i) - pose.x;
      points[at * 3 + 1] = channel.getY(i) - pose.y;
      points[at * 3 + 2] = channel.getZ(i) - pose.z;
    }
  }
  return { kind: 'hull', x: pose.x, y: pose.y, z: pose.z, points };
}

const directions: readonly number[] = (() => {
  const geometry = new IcosahedronGeometry(1, 2), channel = geometry.getAttribute('position');
  const seen = new Set<string>(), out: number[] = [];
  for (let i = 0; i < channel.count; i++) {
    const key = `${channel.getX(i).toFixed(4)},${channel.getY(i).toFixed(4)},${channel.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); out.push(channel.getX(i), channel.getY(i), channel.getZ(i)); }
  }
  geometry.dispose();
  return out;
})();

/** Select the first supporting vertex in each native icosphere direction, retaining tie/deduplication order.
 * Read numeric accessors under the supplied matrix; return detached Float32 contact storage. */
export function bakeSupportPoints(geometry: BufferGeometry, matrix: Matrix4): Float32Array {
  const channel = geometry.getAttribute('position'), vertex = new Vector3(), points: number[] = [];
  for (let i = 0; i < channel.count; i++) { vertex.fromBufferAttribute(channel, i).applyMatrix4(matrix); points.push(vertex.x, vertex.y, vertex.z); }
  const selected = new Set<number>();
  for (let direction = 0; direction < directions.length; direction += 3) {
    const dx = directions[direction] ?? 0, dy = directions[direction + 1] ?? 0, dz = directions[direction + 2] ?? 0;
    let best = -Infinity, at = 0;
    for (let i = 0; i < points.length; i += 3) {
      const support = (points[i] ?? 0) * dx + (points[i + 1] ?? 0) * dy + (points[i + 2] ?? 0) * dz;
      if (support > best) { best = support; at = i; }
    }
    selected.add(at);
  }
  const out = new Float32Array(selected.size * 3);
  let at = 0;
  for (const i of selected) { out[at++] = points[i] ?? 0; out[at++] = points[i + 1] ?? 0; out[at++] = points[i + 2] ?? 0; }
  return out;
}
