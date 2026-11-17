import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, type Matrix4 } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { positionErrorScale, floatPositionError } from './geometryError';

await MeshoptSimplifier.ready;

/**
 * One geometry simplified in its own frame (meshopt, borders locked, `errorMetres` absolute); the kept vertices keep every
 * channel (colours and any custom shader channels). `sloppy`: unwelded sources (every edge a border) barely simplify, so
 * past 1.5 x the target meshopt's topology-free pass takes over. The ratio is a target. The caller owns the result.
 */
export function coarseGeometry(source: BufferGeometry, ratio: number, errorMetres: number, options: { readonly sloppy?: boolean } = {}): BufferGeometry {
  return measuredCoarseGeometry(source, ratio, errorMetres, options).geometry;
}

/** Same selected indices and channels as coarseGeometry, with the tool's achieved appearance-error estimate in metres.
 * Sloppy uses relative units, converted with the tool's scale. This is not a measured Hausdorff distance. */
export function measuredCoarseGeometry(source: BufferGeometry, ratio: number, errorMetres: number, options: { readonly sloppy?: boolean } = {}): { geometry: BufferGeometry; errorMetres: number } {
  if (!(ratio > 0 && ratio <= 1) || !(errorMetres > 0)) throw new Error('Coarse copy needs a ratio in (0, 1] and a positive error');
  const position = source.getAttribute('position');
  if (!(position instanceof BufferAttribute) || position.itemSize !== 3) throw new Error('Coarse copy needs plain positions');
  const index = source.getIndex(), triangles = index === null ? Array.from({ length: position.count }, (_, i) => i) : Array.from(index.array);
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
  const target = Math.max(3, Math.floor(triangles.length / 3 * ratio) * 3);
  let [kept, achieved] = MeshoptSimplifier.simplify(Uint32Array.from(triangles), positions, 3, target, errorMetres, ['LockBorder', 'ErrorAbsolute']);
  if (options.sloppy === true && kept.length > target * 1.5) {
    [kept, achieved] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(triangles), positions, 3, null, target, 1);
    achieved *= MeshoptSimplifier.getScale(positions, 3);
  }
  if (!Number.isFinite(achieved) || achieved < 0) throw new Error('Invalid coarse simplifier error');
  const original = Array.from({ length: position.count * 3 }, (_, at) => position.getComponent(Math.floor(at / 3), at % 3));
  const error = kept.length === triangles.length ? 0 : achieved + 2 * floatPositionError(original);
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute.clone());
  geometry.setIndex(Array.from(kept));
  return { geometry, errorMetres: error };
}

/**
 * Tile streaming U2 / G748: a coarse (L1) copy of whole shapes in their own look, for a props bake's `coarse` source.
 * Each shape's geometry is simplified once (`coarseGeometry`) and placed at its transform, on one rough vertex-coloured
 * surface (the props bake's static merge draws it in its own merged look). The caller calls `dispose` after the bake.
 */
export function coarseCopy(shapes: readonly { readonly mesh: Mesh; readonly transform: Matrix4 }[], ratio = 0.25, errorMetres = 1,
  options: { readonly sloppy?: boolean } = {}): { readonly group: Group; readonly errorMetres: number; readonly dispose: () => void } {
  const group = new Group(), material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), geometries: BufferGeometry[] = [];
  let achieved = 0;
  for (const { mesh, transform } of shapes) {
    const result = measuredCoarseGeometry(mesh.geometry, ratio, errorMetres, options), geometry = result.geometry;
    achieved = Math.max(achieved, result.errorMetres * positionErrorScale(transform));
    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    geometries.push(geometry);
    const copy = new Mesh(geometry, material);
    transform.decompose(copy.position, copy.quaternion, copy.scale);
    group.add(copy);
  }
  return { group, errorMetres: achieved, dispose: () => { for (const geometry of geometries) geometry.dispose(); material.dispose(); } };
}
