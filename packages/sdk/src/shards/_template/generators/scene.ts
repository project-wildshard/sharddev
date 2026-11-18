// SHARD-SOURCE AP36a: the Template's world as scene source. The 22 pieces `buildTemplateWorld` and `buildCellFill` make
// are scene parts (the unit `wildshard watch` swaps); the switchable ones are panels, the emissive wholes and flames draw in
// their own look entries, and the ground is the template's height law under its moss floor. Colliders stay the authored rows
// (with their surfaces and the ramp's treads): `templateColliders` writes them, and shard.config.ts's extend puts them in.
import { BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, type Matrix4, type Object3D } from 'three';
import type { ShardWorld } from '@wildshard/sdk/scene/author';
import { LookMaterial } from '@wildshard/sdk/materials';
import type { MaterialEntry } from '@wildshard/format/materials';
import type { PropsBakeSource } from '@wildshard/sdk/bake/props';
import LOOK from '../data/look.json' with { type: 'json' };
import SPAWN from '../data/spawn.json' with { type: 'json' };
import { mossFloor, templateHeightAt } from './landscape';
import { templateScatterRandom } from './landscapeNoise';
import { buildCellFill } from './cell';
import { brazierFlame, buildTemplateWorld, hutLamp, jumpCoursePads, lanternModel, mushroomCaps, rimFlames, wardenTell, type TemplatePart } from './world';

/** Pieces whose meshes are one hideable GLB and whose colliders a target row switches (data/targets.json `panels`). */
const PANELS: ReadonlySet<string> = new Set(['template.door', 'template.mossgate', 'template.pond-stones', 'template.arena-gate', 'template.south-gate', 'template.ledge', 'template.lift']);
/** Panels drawn without a shadow: a shadow is a second draw in each L0 tile the panel touches. */
const SHADOWLESS: ReadonlySet<string> = new Set(['template.door', 'template.pond-stones', 'template.arena-gate', 'template.south-gate', 'template.ledge', 'template.lift']);
/** Panels hidden until their field shows them (the bake's `visible: false`). */
export const HIDDEN_PANELS: ReadonlySet<string> = new Set(['template.flame-a', 'template.flame-b', 'template.pond-stones', 'template.rim-flames', 'template.warden-ring', 'template.warden-core', 'template.jump']);
/** Panel colliders that start off: the pond's raised stones stand only once brazier B is lit. */
const STARTS_OFF: ReadonlySet<string> = new Set(['template.pond-stones']);
/** Built but never drawn: the legacy grey cubes (opus-greybox); building them keeps the seeded stream where it was. */
const UNDRAWN: ReadonlySet<string> = new Set(['template.props']);
/** The jump course's pads, out at x 90 and 30 m up: a panel nothing shows, kept for its collider row. */
const COURSE = { height: 30, x: 90 } as const;

/** A part's kebab-case name from its piece id: `template.entry.north` is `entry-north`. */
const partName = (id: string): string => id.replace(/^template\./u, '').replaceAll('.', '-');
const entry = (id: keyof typeof LOOK.materials): MaterialEntry => LOOK.materials[id] as MaterialEntry;
/** The look's plain stone `pbr` (vertex colours carry each mesh's colour and weathering), and the emissive entries. */
const STONE = (): LookMaterial => new LookMaterial(entry('pbr'));

/** Every piece the template builds, in build order, plus the extras the bake drew as wholes and panels. */
export interface TemplatePieces {
  readonly pieces: readonly TemplatePart[];
  readonly posts: { readonly model: Group; readonly transforms: readonly Matrix4[] };
  readonly course: Group;
}

/** Build the template's pieces once (the seeded scatter and the masonry stream start over each time). */
export function templatePieces(): TemplatePieces {
  const root = new Group(), pieces: TemplatePart[] = [], random = templateScatterRandom(), heightAt = templateHeightAt();
  const scope = { own: (): void => undefined, onDispose: (): void => undefined };
  buildTemplateWorld({ root, scope, piece: (part) => { pieces.push(part); }, rng: { stream: () => random }, heightAt }, 20);
  const cell = buildCellFill({ root, scope, piece: (part) => { pieces.push(part); } });
  return { pieces, posts: cell.posts, course: jumpCoursePads(COURSE.height, COURSE.x) };
}

/** The bake's vertex colour: each vertex's own (the weathering, or white) times its mesh's colour; then one white surface. */
function intoLook(object: Object3D, material: () => MeshStandardMaterial, castShadow: boolean): void {
  object.updateMatrixWorld(true);
  const shared = material();
  object.traverse((node) => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial) || !(node.geometry instanceof BufferGeometry)) return;
    const colour = new Color().copy(node.material.color), geometry = node.geometry.clone(), count = geometry.getAttribute('position').count;
    const old = geometry.hasAttribute('color') ? geometry.getAttribute('color') : null, out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) out.set([(old?.getX(i) ?? 1) * colour.r, (old?.getY(i) ?? 1) * colour.g, (old?.getZ(i) ?? 1) * colour.b], i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(out, 3));
    node.geometry = geometry; node.material = shared; node.castShadow = castShadow; node.receiveShadow = true;
  });
}

/** An emissive extra in its look entry (the flame, the lamp glass, the caps, the tell), drawn without a shadow. */
function glowing(object: Object3D, id: keyof typeof LOOK.materials): Object3D {
  intoLook(object, () => new LookMaterial(entry(id)), false);
  return object;
}

/** The scene: ground, spawn, the pieces as parts (panels where a row switches them), the wholes, flames and posts. */
export function buildTemplate(world: ShardWorld): void {
  const heightAt = templateHeightAt(), { pieces, posts, course } = templatePieces();
  world.ground(heightAt, { colourAt: mossFloor() });
  world.spawn(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);
  for (const piece of pieces) {
    if (UNDRAWN.has(piece.id)) continue;
    const panel = PANELS.has(piece.id);
    intoLook(piece.object, STONE, !SHADOWLESS.has(piece.id));
    world.part(partName(piece.id), (part) => { part.add(piece.object); }, panel ? { panel: piece.id } : {});
  }
  // G220's lamp posts: one copy of the post and its arm per seat, instanced
  const postMeshes = posts.model.children.filter((node): node is Mesh => node instanceof Mesh);
  world.part('post-copies', (part) => {
    for (const mesh of postMeshes) {
      const copy = new Mesh(mesh.geometry, mesh.material); intoLook(copy, STONE, true);
      const instanced = new InstancedMesh(copy.geometry, copy.material, posts.transforms.length); instanced.castShadow = true;
      posts.transforms.forEach((transform, i) => { instanced.setMatrixAt(i, transform.clone().multiply(mesh.matrix)); });
      part.add(instanced);
    }
  });
  // LF1-5, LF1-7: the red mushroom caps and the door lamp's glass, emissive wholes
  for (const [id, made, look] of [['template.mushroom-caps', mushroomCaps(heightAt), 'mossgate.mushroom-cap'], ['template.hut-lamp', hutLamp(heightAt), 'mossgate.lamp']] as const) {
    made.mesh.applyMatrix4(made.transform);
    world.part(partName(id), (part) => { part.add(glowing(made.mesh, look)); });
  }
  // LF1-7 to LF1-9: the flames and the Warden's tell, emissive panels their fields show
  const tell = wardenTell(heightAt);
  for (const [id, object, look] of [['template.flame-a', brazierFlame(heightAt), 'mossgate.flame'], ['template.flame-b', brazierFlame(heightAt, 1), 'mossgate.flame'],
    ['template.rim-flames', rimFlames(heightAt), 'mossgate.flame'], ['template.warden-ring', tell.ring, 'mossgate.tell'], ['template.warden-core', tell.core, 'mossgate.lamp']] as const) {
    world.part(partName(id), (part) => { part.add(glowing(object, look)); }, { panel: id });
  }
  intoLook(course, STONE, true);
  world.part('jump', (part) => { part.add(course); }, { panel: 'template.jump' });
  // the lantern as held: its lamp, a panel the extend moves to `props.models` (its light is the engine's)
  const lantern = lanternModel(), lamp = new Group(); lamp.position.copy(lantern.position);
  for (const node of lantern.children) if (node instanceof Mesh) lamp.add(node.clone());
  intoLook(lamp, STONE, true);
  world.part('lantern', (part) => { part.add(lamp); }, { panel: 'template.lantern' });
}

type ColliderRow = NonNullable<PropsBakeSource['colliders']>[number];
/** The authored collider rows, as the props bake wrote them: one per piece with colliders, panels by their own id. */
export function templateColliders(made: TemplatePieces = templatePieces()): ColliderRow[] {
  const rows: ColliderRow[] = made.pieces.filter((p) => (p.colliders?.length ?? 0) > 0).map((p) => ({ id: p.id, panel: PANELS.has(p.id) ? p.id : null, initialActive: !STARTS_OFF.has(p.id),
    shapes: p.colliders?.map((c) => {
      if (c.surface !== undefined && c.surface !== 'wood' && c.surface !== 'stone' && c.surface !== 'metal') throw new Error('Unsupported template surface');
      const { surface, ...descriptor } = c;
      return { ...descriptor, ...(c.kind === 'box' && c.yaw !== undefined ? { yaw: c.yaw === 0 ? 0 : c.yaw } : {}), ...(surface === undefined ? {} : { surface }) };
    }) ?? [] }));
  rows.push({ id: 'template.jump', panel: 'template.jump', initialActive: false, shapes: made.course.children.map((pad) => ({ kind: 'box', x: pad.position.x, y: pad.position.y, z: pad.position.z === 0 ? 0 : pad.position.z, hx: 1.5, hy: 0.15, hz: 1.5 })) });
  return rows;
}
