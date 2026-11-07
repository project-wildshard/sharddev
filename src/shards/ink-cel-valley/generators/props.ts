import { Group, type Matrix4, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { inkField } from './terrain';
import { Rng } from '@wildshard/sharddev/random';
import { buildCellFill, cellCoarse, cellFar, CELL_PIECES } from './cell';
import { buildInkWorld, jumpCoursePads, lanternModel, measureBox, type InkPart } from './world';
import type { PropsBakeSource } from '@wildshard/sharddev/bake/props';

/**
 * The ink valley's props bake source (SF59 / G169): the template's generators, captured before merging, on the valley
 * field, with the whole props section bound to the `rock` cel graph (the template binds them all to its one `pbr`).
 * Water remains owned by the water declaration.
 */
export function inkProps(count = 20): { source: PropsBakeSource; original: Group; dispose: () => void } {
  const original = new Group(), pieces: InkPart[] = [], resources = new Set<{ dispose: () => void }>(), cleanups: (() => void)[] = [];
  const scope = { own: (resource: { dispose: () => void }): void => { resources.add(resource); }, onDispose: (cleanup: () => void): void => { cleanups.push(cleanup); } };
  const piece = (part: InkPart): void => { pieces.push(part); };
  // the named cosmetic stream of seed 357, as the runtime's RNG service drew it
  const terrain = inkField(), random = new Rng(357).fork('cosmetic');
  buildInkWorld({ root: original, scope, piece, rng: { stream: () => random }, heightAt: terrain.heightAt }, count);
  const cell = buildCellFill({ root: original, scope, piece });
  const shape = (id: string): Object3D => { const object = pieces.find(part => part.id === id)?.object; if (object === undefined) throw new Error(`Missing ink shape ${id}`); return object; };
  const staticRoot = new Group(); staticRoot.add(shape('ink.hut').clone(), shape('ink.ramp').clone());
  // G220's cell fill: drawn whole near; the coarse tiles and the far proxy keep its big shapes (no stripes, posts or cubes)
  const cellIds = CELL_PIECES, coarse = new Group(), far = new Group();
  for (const id of cellIds) { staticRoot.add(shape(id).clone()); coarse.add(cellCoarse(shape(id))); far.add(cellFar(shape(id))); }
  coarse.add(shape('ink.hut').clone(), shape('ink.ramp').clone(), shape('ink.door').clone()); far.add(shape('ink.hut').clone());
  const scatter = shape('ink.props'), transforms: Matrix4[] = []; scatter.updateMatrixWorld(true);
  for (const prop of scatter.children) transforms.push(prop.matrixWorld.clone());
  const model = new Mesh(measureBox(0.6, 0.6, 0.6, 1), new MeshStandardMaterial({ color: 0x888888, flatShading: true }));
  const door = shape('ink.door');
  // SF16 relocates the course into the cell; this fixture records its same three pads at a bounded practice location.
  const course = jumpCoursePads(30, 90);
  original.add(course.clone());
  const pool = original.children.find((o) => !pieces.some((p) => p.object === o)); pool?.removeFromParent();
  const lamp = lanternModel(); const lampShapes = new Group(); lampShapes.position.copy(lamp.position); for (const o of lamp.children) if (o instanceof Mesh) lampShapes.add(o.clone());
  const colliders: NonNullable<PropsBakeSource['colliders']> = pieces.filter((p) => (p.colliders?.length ?? 0) > 0).map((p) => ({ id: p.id, panel: p.id === 'ink.door' ? p.id : null, initialActive: true, shapes: p.colliders?.map((c) => { if (c.surface !== undefined && c.surface !== 'wood' && c.surface !== 'stone' && c.surface !== 'metal') throw new Error('Unsupported template surface'); const { surface, ...descriptor } = c; return { ...descriptor, ...(c.kind === 'box' && c.yaw !== undefined ? { yaw: c.yaw === 0 ? 0 : c.yaw } : {}), ...(surface === undefined ? {} : { surface }) }; }) ?? [] }));
  colliders.push({ id: 'ink.jump', panel: 'ink.jump', initialActive: false, shapes: course.children.map((pad) => ({ kind: 'box', x: pad.position.x, y: pad.position.y, z: pad.position.z === 0 ? 0 : pad.position.z, hx: 1.5, hy: 0.15, hz: 1.5 })) });
  return { source: { family: 'rock', static: staticRoot, scatter: [{ model, transforms }, cell.posts], panels: [{ id: 'ink.door', model: door }, { id: 'ink.jump', model: course, visible: false }], colliders, models: [{ id: 'ink.lantern', model: lampShapes }], coarse, far }, original, dispose: () => { for (const resource of resources) resource.dispose(); for (const cleanup of cleanups) cleanup(); model.geometry.dispose(); model.material.dispose(); } };
}
