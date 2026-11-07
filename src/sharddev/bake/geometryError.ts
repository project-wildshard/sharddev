import { Matrix3, Matrix4, Vector3, type BufferGeometry } from 'three';
import type { TileGrid } from './worldGeometry';

/** Conservative Euclidean displacement scale, including shear; translation is excluded. */
export function positionErrorScale(matrix: Matrix4): number {
  const e = matrix.elements;
  if (e.some(value => !Number.isFinite(value)) || e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1) throw new Error('Position error needs an affine transform');
  const read = (row: number, column: number): number => Math.abs(e[column * 4 + row] ?? 0);
  const row = Math.max(...[0, 1, 2].map(i => read(i, 0) + read(i, 1) + read(i, 2)));
  const column = Math.max(...[0, 1, 2].map(i => read(0, i) + read(1, i) + read(2, i)));
  return Math.sqrt(row * column);
}

/** Actual Euclidean position loss when the writer stores triples as float32. */
export function floatPositionError(positions: ArrayLike<number>): number {
  if (positions.length % 3 !== 0) throw new Error('Position error needs triples');
  let error = 0;
  for (let at = 0; at < positions.length; at += 3) {
    const x = positions[at], y = positions[at + 1], z = positions[at + 2];
    if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)
      || ![Math.fround(x), Math.fround(y), Math.fround(z)].every(Number.isFinite)) throw new Error('Position error needs finite storage');
    error = Math.max(error, Math.hypot(x - Math.fround(x), y - Math.fround(y), z - Math.fround(z)));
  }
  return error;
}

/** Compact positions' quantization-cell radius in world metres. An exactly grid-aligned source loses nothing.
 * The transform applies to displacement only; translation never enlarges the error. */
export function gridPositionError(geometry: BufferGeometry, grid: TileGrid, transform: Matrix4 = new Matrix4()): number {
  if (!Number.isFinite(grid.step) || grid.step <= 0 || grid.origin.some(value => !Number.isFinite(value))
    || transform.elements.some(value => !Number.isFinite(value))) throw new Error('Invalid position error grid');
  const position = geometry.getAttribute('position');
  if (position.itemSize !== 3) throw new Error('Position error needs triples');
  let rounded = false;
  for (let at = 0; at < position.count; at++) for (let axis = 0; axis < 3; axis++) {
    const value = position.getComponent(at, axis), origin = grid.origin[axis];
    if (origin === undefined || !Number.isFinite(value)) throw new Error('Invalid position error source');
    const stored = Math.round((value - origin) / grid.step);
    if (Math.abs(stored) > 32767) throw new Error('Position error outside grid');
    rounded ||= stored * grid.step + origin !== value;
  }
  if (!rounded) return 0;
  const linear = new Matrix3().setFromMatrix4(transform), half = grid.step / 2;
  let radius = 0;
  for (const x of [-half, half]) for (const y of [-half, half]) for (const z of [-half, half])
    radius = Math.max(radius, new Vector3(x, y, z).applyMatrix3(linear).length());
  return radius;
}
