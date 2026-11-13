import { Group, Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { templateHeightAt } from './landscape';
import { templateScatterRandom } from './landscapeNoise';
import { buildCellFill, cellCoarse, cellFar, CELL_PIECES } from './cell';
import { brazierFlame, buildTemplateWorld, hutLamp, jumpCoursePads, lanternModel, mushroomCaps, rimFlames, wardenTell, type TemplatePart } from './world';
import type { PropsBakeSource } from '@wildshard/sdk/bake/props';

/** LF1-5: the GLB material names `props.materials` binds (product.ts): the measure stone every merged shape draws in, and the
 *  red mushroom caps' emissive surface. */
export const TEMPLATE_STONE = 'measure', TEMPLATE_MUSHROOM_CAP = 'mossgate.mushroom-cap';
/** LF1-7: the door lamp's glass and brazier A's flame, each bound to an emissive look entry. */
export const TEMPLATE_LAMP = 'mossgate.lamp', TEMPLATE_FLAME = 'mossgate.flame';
/** LF1-9: the Warden's slam tell ring, an emissive amber (its core gem draws in the lamp's gold). */
export const TEMPLATE_TELL = 'mossgate.tell';
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
  const staticRoot = new Group(); staticRoot.add(shape('template.hut').clone(), shape('template.ramp').clone(), shape('template.braziers').clone(), shape('template.dressing').clone(), shape('template.foliage').clone(), shape('template.mossgate-frame').clone(), shape('template.mossgate-vines').clone(), shape('template.arena-wall').clone(), shape('template.arena-dressing').clone(), shape('template.pond-stones-sunk').clone(), shape('template.pond-planting').clone());
  // G220's cell fill: drawn whole near; the coarse tiles and the far proxy keep its big shapes (no stripes, posts or cubes)
  const cellIds = CELL_PIECES, coarse = new Group(), far = new Group();
  for (const id of cellIds) { staticRoot.add(shape(id).clone()); coarse.add(cellCoarse(shape(id))); far.add(cellFar(shape(id))); }
  // The coarse (L1) tiles skip the dressing and the moss gate's vines: ferns, mushrooms and slabs are too small to read at L1 range and pushed tiles
  // 1/1/1 and 1/2/1 past the 200000-byte compressed cap the tile-bake policy refuses (CI red from 8b3307b).
  coarse.add(shape('template.hut').clone(), shape('template.ramp').clone(), shape('template.door').clone(), shape('template.braziers').clone(), shape('template.mossgate-frame').clone(), shape('template.arena-wall').clone()); far.add(shape('template.hut').clone());
  // opus-greybox: the legacy grey scatter cubes (`template.props`, 0.6 m measure boxes on the pond's banks and the yard) are
  // not baked at all now (LF1-9 had dropped them from tile 0/3/4 only). The world still builds them, so its seeded stream
  // and everything placed after them stay put; they had no collider, so no walk changes.
  const door = shape('template.door');
  // SF16 relocates the course into the cell; this fixture records its same three pads at a bounded practice location.
  const course = jumpCoursePads(30, 90);
  original.add(course.clone());
  const pool = original.children.find((o) => !pieces.some((p) => p.object === o)); pool?.removeFromParent();
  const lamp = lanternModel(); const lampShapes = new Group(); lampShapes.position.copy(lamp.position); for (const o of lamp.children) if (o instanceof Mesh) lampShapes.add(o.clone());
  const colliders: NonNullable<PropsBakeSource['colliders']> = pieces.filter((p) => (p.colliders?.length ?? 0) > 0).map((p) => ({ id: p.id, panel: PANELS.has(p.id) ? p.id : null, initialActive: !STARTS_OFF.has(p.id), shapes: p.colliders?.map((c) => { if (c.surface !== undefined && c.surface !== 'wood' && c.surface !== 'stone' && c.surface !== 'metal') throw new Error('Unsupported template surface'); const { surface, ...descriptor } = c; return { ...descriptor, ...(c.kind === 'box' && c.yaw !== undefined ? { yaw: c.yaw === 0 ? 0 : c.yaw } : {}), ...(surface === undefined ? {} : { surface }) }; }) ?? [] }));
  colliders.push({ id: 'template.jump', panel: 'template.jump', initialActive: false, shapes: course.children.map((pad) => ({ kind: 'box', x: pad.position.x, y: pad.position.y, z: pad.position.z === 0 ? 0 : pad.position.z, hx: 1.5, hy: 0.15, hz: 1.5 })) });
  // LF1-5: the red mushroom caps, one whole emissive shape in tile 0/4/3 (its own draw, no shadow), named for props.materials
  const caps = mushroomCaps(templateHeightAt());
  // LF1-7: the door lamp's glass, one emissive whole in 0/4/3 (1 draw, no shadow); brazier A's flame, a shadowless emissive
  // panel A's field shows (1 draw in 0/3/3); the hut door casts no shadow, so 0/3/3 and 0/4/3 each pay one draw less for it.
  // LF1-8: brazier B's flame likewise (field 103, 1 draw in 0/4/4), paid for by the pond's raised stones casting no shadow
  const glass = hutLamp(templateHeightAt()), flame = brazierFlame(templateHeightAt()), flameB = brazierFlame(templateHeightAt(), 1);
  // LF1-9: the rim braziers' flames (field 104), the Warden's tell ring (110) and core (111), each a shadowless emissive panel
  // in 0/3/4, paid for by the arena gate casting no shadow and the tile's scatter cubes going
  const rim = rimFlames(templateHeightAt()), tell = wardenTell(templateHeightAt());
  return { source: { static: staticRoot, materialName: TEMPLATE_STONE, whole: [{ id: 'template_mushroom_caps', mesh: caps.mesh, transform: caps.transform, materialName: TEMPLATE_MUSHROOM_CAP }, { id: 'template_hut_lamp', mesh: glass.mesh, transform: glass.transform, materialName: TEMPLATE_LAMP }], scatter: [cell.posts], panels: [{ id: 'template.door', model: door, castShadow: false }, { id: 'template.flame-a', model: flame, visible: false, materialName: TEMPLATE_FLAME, castShadow: false }, { id: 'template.flame-b', model: flameB, visible: false, materialName: TEMPLATE_FLAME, castShadow: false }, { id: 'template.mossgate', model: shape('template.mossgate') },
    { id: 'template.pond-stones', model: shape('template.pond-stones'), visible: false, castShadow: false }, { id: 'template.arena-gate', model: shape('template.arena-gate'), castShadow: false },
    { id: 'template.rim-flames', model: rim, visible: false, materialName: TEMPLATE_FLAME, castShadow: false }, { id: 'template.warden-ring', model: tell.ring, visible: false, materialName: TEMPLATE_TELL, castShadow: false }, { id: 'template.warden-core', model: tell.core, visible: false, materialName: TEMPLATE_LAMP, castShadow: false }, { id: 'template.jump', model: course, visible: false }], colliders, models: [{ id: 'template.lantern', model: lampShapes }], coarse, far }, original, dispose: () => { for (const resource of resources) resource.dispose(); for (const cleanup of cleanups) cleanup(); caps.mesh.geometry.dispose(); caps.mesh.material.dispose(); glass.mesh.geometry.dispose(); glass.mesh.material.dispose(); for (const f of [flame, flameB, rim, tell.ring, tell.core]) f.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as MeshStandardMaterial).dispose(); } }); } };
}
