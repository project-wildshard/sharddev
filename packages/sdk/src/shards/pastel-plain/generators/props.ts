import { Group, type Matrix4, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { pastelHeightAt } from './landscape';
import { pastelScatterRandom } from './landscapeNoise';
import { buildCellFill, cellCoarse, cellFar, CELL_PIECES } from './cell';
import { buildPastelWorld, jumpCoursePads, lanternModel, measureBox, type PastelPart } from './world';
import type { PropsBakeSource } from '@wildshard/sdk/bake/props';

/**
 * The pastel plain's props bake source (SF59 / G169): the template's generators, captured before merging, with the
 * whole props section bound to the `rock` graph material (the template binds them all to its one `pbr`). Water remains
 * owned by the water declaration.
 */
export function pastelProps(count = 20): { source: PropsBakeSource; original: Group; dispose: () => void } {
  const original = new Group(), pieces: PastelPart[] = [], resources = new Set<{ dispose: () => void }>(), cleanups: (() => void)[] = [];
  const scope = { own: (resource: { dispose: () => void }): void => { resources.add(resource); }, onDispose: (cleanup: () => void): void => { cleanups.push(cleanup); } };
  const piece = (part: PastelPart): void => { pieces.push(part); };
  const random = pastelScatterRandom();
  buildPastelWorld({ root: original, scope, piece, rng: { stream: () => random }, heightAt: pastelHeightAt() }, count);
  const cell = buildCellFill({ root: original, scope, piece });
  const shape = (id: string): Object3D => { const object = pieces.find(part => part.id === id)?.object; if (object === undefined) throw new Error(`Missing pastel shape ${id}`); return object; };
  const staticRoot = new Group(); staticRoot.add(shape('pastel.hut').clone(), shape('pastel.ramp').clone());
  // G220's cell fill: drawn whole near; the coarse tiles and the far proxy keep its big shapes (no stripes, posts or cubes)
  const cellIds = CELL_PIECES, coarse = new Group(), far = new Group();
  for (const id of cellIds) { staticRoot.add(shape(id).clone()); coarse.add(cellCoarse(shape(id))); far.add(cellFar(shape(id))); }
  coarse.add(shape('pastel.hut').clone(), shape('pastel.ramp').clone(), shape('pastel.door').clone()); far.add(shape('pastel.hut').clone());
  const scatter = shape('pastel.props'), transforms: Matrix4[] = []; scatter.updateMatrixWorld(true);
  for (const prop of scatter.children) transforms.push(prop.matrixWorld.clone());
  const model = new Mesh(measureBox(0.6, 0.6, 0.6, 1), new MeshStandardMaterial({ color: 0x888888, flatShading: true }));
  const door = shape('pastel.door');
  // SF16 relocates the course into the cell; this fixture records its same three pads at a bounded practice location.
  const course = jumpCoursePads(30, 90);
  original.add(course.clone());
  const pool = original.children.find((o) => !pieces.some((p) => p.object === o)); pool?.removeFromParent();
  const lamp = lanternModel(); const lampShapes = new Group(); lampShapes.position.copy(lamp.position); for (const o of lamp.children) if (o instanceof Mesh) lampShapes.add(o.clone());
  const colliders: NonNullable<PropsBakeSource['colliders']> = pieces.filter((p) => (p.colliders?.length ?? 0) > 0).map((p) => ({ id: p.id, panel: p.id === 'pastel.door' ? p.id : null, initialActive: true, shapes: p.colliders?.map((c) => { if (c.surface !== undefined && c.surface !== 'wood' && c.surface !== 'stone' && c.surface !== 'metal') throw new Error('Unsupported template surface'); const { surface, ...descriptor } = c; return { ...descriptor, ...(c.kind === 'box' && c.yaw !== undefined ? { yaw: c.yaw === 0 ? 0 : c.yaw } : {}), ...(surface === undefined ? {} : { surface }) }; }) ?? [] }));
  colliders.push({ id: 'pastel.jump', panel: 'pastel.jump', initialActive: false, shapes: course.children.map((pad) => ({ kind: 'box', x: pad.position.x, y: pad.position.y, z: pad.position.z === 0 ? 0 : pad.position.z, hx: 1.5, hy: 0.15, hz: 1.5 })) });
  return { source: { family: 'rock', static: staticRoot, scatter: [{ model, transforms }, cell.posts], panels: [{ id: 'pastel.door', model: door }, { id: 'pastel.jump', model: course, visible: false }], colliders, models: [{ id: 'pastel.lantern', model: lampShapes }], coarse, far }, original, dispose: () => { for (const resource of resources) resource.dispose(); for (const cleanup of cleanups) cleanup(); model.geometry.dispose(); model.material.dispose(); } };
}
