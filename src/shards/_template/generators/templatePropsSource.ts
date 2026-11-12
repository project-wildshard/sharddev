import { Group, type Matrix4, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { templateHeightAt } from './landscape';
import { templateScatterRandom } from './landscapeNoise';
import { buildCellFill, cellCoarse, cellFar, CELL_PIECES } from './cell';
import { buildTemplateWorld, jumpCoursePads, lanternModel, measureBox, type TemplatePart } from './world';
import type { PropsBakeSource } from '@wildshard/sharddev/bake/props';

/** Pieces whose colliders a target row switches (MH-2: the moss gate; MH-3: the pond's stones and the arena gate). */
const PANELS: ReadonlySet<string> = new Set(['template.door', 'template.mossgate', 'template.pond-stones', 'template.arena-gate']);
/** Panel colliders that start off: the pond's raised stones stand only once brazier B is lit. */
const STARTS_OFF: ReadonlySet<string> = new Set(['template.pond-stones']);
/** Actual template generators, captured before merging. Water remains owned by the water declaration. */
export function templateProps(count = 20): { source: PropsBakeSource; original: Group; dispose: () => void } {
  const original = new Group(), pieces: TemplatePart[] = [], resources = new Set<{ dispose: () => void }>(), cleanups: (() => void)[] = [];
  const scope = { own: (resource: { dispose: () => void }): void => { resources.add(resource); }, onDispose: (cleanup: () => void): void => { cleanups.push(cleanup); } };
  const piece = (part: TemplatePart): void => { pieces.push(part); };
  const random = templateScatterRandom();
  buildTemplateWorld({ root: original, scope, piece, rng: { stream: () => random }, heightAt: templateHeightAt() }, count);
  const cell = buildCellFill({ root: original, scope, piece });
  const shape = (id: string): Object3D => { const object = pieces.find(part => part.id === id)?.object; if (object === undefined) throw new Error(`Missing template shape ${id}`); return object; };
  const staticRoot = new Group(); staticRoot.add(shape('template.hut').clone(), shape('template.ramp').clone(), shape('template.braziers').clone(), shape('template.dressing').clone(), shape('template.mossgate-frame').clone(), shape('template.mossgate-vines').clone(), shape('template.arena-wall').clone(), shape('template.pond-stones-sunk').clone());
  // G220's cell fill: drawn whole near; the coarse tiles and the far proxy keep its big shapes (no stripes, posts or cubes)
  const cellIds = CELL_PIECES, coarse = new Group(), far = new Group();
  for (const id of cellIds) { staticRoot.add(shape(id).clone()); coarse.add(cellCoarse(shape(id))); far.add(cellFar(shape(id))); }
  // The coarse (L1) tiles skip the dressing and the moss gate's vines: ferns, mushrooms and slabs are too small to read at L1 range and pushed tiles
  // 1/1/1 and 1/2/1 past the 200000-byte compressed cap the tile-bake policy refuses (CI red from 8b3307b).
  coarse.add(shape('template.hut').clone(), shape('template.ramp').clone(), shape('template.door').clone(), shape('template.braziers').clone(), shape('template.mossgate-frame').clone(), shape('template.arena-wall').clone()); far.add(shape('template.hut').clone());
  const scatter = shape('template.props'), transforms: Matrix4[] = []; scatter.updateMatrixWorld(true);
  for (const prop of scatter.children) transforms.push(prop.matrixWorld.clone());
  const model = new Mesh(measureBox(0.6, 0.6, 0.6, 1), new MeshStandardMaterial({ color: 0x888888, flatShading: true }));
  const door = shape('template.door');
  // SF16 relocates the course into the cell; this fixture records its same three pads at a bounded practice location.
  const course = jumpCoursePads(30, 90);
  original.add(course.clone());
  const pool = original.children.find((o) => !pieces.some((p) => p.object === o)); pool?.removeFromParent();
  const lamp = lanternModel(); const lampShapes = new Group(); lampShapes.position.copy(lamp.position); for (const o of lamp.children) if (o instanceof Mesh) lampShapes.add(o.clone());
  const colliders: NonNullable<PropsBakeSource['colliders']> = pieces.filter((p) => (p.colliders?.length ?? 0) > 0).map((p) => ({ id: p.id, panel: PANELS.has(p.id) ? p.id : null, initialActive: !STARTS_OFF.has(p.id), shapes: p.colliders?.map((c) => { if (c.surface !== undefined && c.surface !== 'wood' && c.surface !== 'stone' && c.surface !== 'metal') throw new Error('Unsupported template surface'); const { surface, ...descriptor } = c; return { ...descriptor, ...(c.kind === 'box' && c.yaw !== undefined ? { yaw: c.yaw === 0 ? 0 : c.yaw } : {}), ...(surface === undefined ? {} : { surface }) }; }) ?? [] }));
  colliders.push({ id: 'template.jump', panel: 'template.jump', initialActive: false, shapes: course.children.map((pad) => ({ kind: 'box', x: pad.position.x, y: pad.position.y, z: pad.position.z === 0 ? 0 : pad.position.z, hx: 1.5, hy: 0.15, hz: 1.5 })) });
  return { source: { static: staticRoot, scatter: [{ model, transforms }, cell.posts], panels: [{ id: 'template.door', model: door }, { id: 'template.mossgate', model: shape('template.mossgate') },
    { id: 'template.pond-stones', model: shape('template.pond-stones'), visible: false }, { id: 'template.arena-gate', model: shape('template.arena-gate') }, { id: 'template.jump', model: course, visible: false }], colliders, models: [{ id: 'template.lantern', model: lampShapes }], coarse, far }, original, dispose: () => { for (const resource of resources) resource.dispose(); for (const cleanup of cleanups) cleanup(); model.geometry.dispose(); model.material.dispose(); } };
}
