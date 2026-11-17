import { BoxCollider } from '@wildshard/sdk/physics';
import type { PropsBakeSource } from '@wildshard/sdk/bake/props';
import { measureUv, type MeasureRole } from '@wildshard/sdk/measure';
import { BoxGeometry, BufferGeometry, CircleGeometry, Float32BufferAttribute, Group, Material, Mesh, MeshStandardMaterial, PointLight, type Object3D } from 'three';
import layout from '../data/layout.json' with { type: 'json' };

/**
 * Build-time only (SHARD-PLATFORM SF16): the template's grey-box shapes as the props baker
 * (src/shards/_template/generators/templatePropsSource.ts) samples them: the hut with its wall colliders, the door panel, the ramp with
 * stair treads, the scattered cubes, the pool disc, the jump-course pads and the lantern's lamp. These are the legacy
 * runtime builders' shapes, kept here so the bake no longer reads the runtime modules (retired with the template
 * chunk); nothing here is imported by the client.
 */
export const poolMask = (x: number, z: number): boolean => Math.hypot(x - 25, z - 20) < 5;

/**
 * A w × h × d box whose first UV set carries SF56's measure data (its `role` and each face's own metres and size: the
 * dev-map look's grid and "4×3" labels, `measureUv`). The plain look never reads it. BoxGeometry's faces run +x, −x
 * (depth × height), +y, −y (width × depth), +z, −z (width × height), four corners each, u left to right and v bottom to
 * top as seen from outside.
 */
export function measureBox(w: number, h: number, d: number, role: MeasureRole): BoxGeometry {
  const geometry = new BoxGeometry(w, h, d), uv = geometry.getAttribute('uv'), packed: number[] = [];
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const size = sizes[Math.floor(i / 4)]; if (size === undefined) throw new Error('measureBox: one segment per face');
    packed.push(...measureUv(role, uv.getX(i) * size[0], uv.getY(i) * size[1], size[0], size[1]));
  }
  return geometry.setAttribute('uv', new Float32BufferAttribute(packed, 2));
}
/** a grey-box shape (role 1, structure: orange in the dev-map look; role 2, trim: grey) */
const cube = (w: number, h: number, d: number, color = 0x888888, role: MeasureRole = 1): Mesh => new Mesh(measureBox(w, h, d, role), new MeshStandardMaterial({ color, flatShading: true }));
/** One authored scene part and its collider rows, before SDK compilation. No native registry owns it. */
export interface InkPart {
  id: string; name: string; category: 'buildings' | 'nature' | 'props' | 'ground'; file: string; object: Object3D;
  colliders?: NonNullable<PropsBakeSource['colliders']>[number]['shapes'];
  surface?: 'wood' | 'stone' | 'metal'; active?: () => boolean;
}
/** Build-time graph, resource cleanup, authored part sink, seeded scatter draws and ground law. */
export interface InkWorldPorts {
  root: Object3D;
  scope: { own: (resource: { dispose: () => void }) => void; onDispose: (cleanup: () => void) => void };
  piece: (part: InkPart) => void;
  rng: { stream: (name: 'cosmetic') => { range: (a: number, b: number) => number } };
  heightAt: (x: number, z: number) => number;
}
/** The hut, door, ramp, `propCount` scattered cubes and the pool disc, under `root`, each a registry piece as the runtime registered it. */
export function buildInkWorld(ctx: InkWorldPorts, propCount: number): void {
  const { heightAt } = ctx, file = 'src/shards/ink-cel-valley/generators/world.ts';
  const y = heightAt(layout.HUT.x, layout.HUT.z);
  const hut = new Group(); hut.position.set(layout.HUT.x, y, layout.HUT.z);
  const roof = cube(6, 0.3, 6, 0x888888, 2); roof.position.y = 3; hut.add(roof);
  const colliders = [];
  for (const [x, z, hw, hd] of [[-3, 0, 0.15, 3], [3, 0, 0.15, 3], [0, -3, 3, 0.15], [-2, 3, 1, 0.15], [2, 3, 1, 0.15]]) {
    if (x === undefined || z === undefined || hw === undefined || hd === undefined) continue;
    const wall = cube(hw * 2, 3, hd * 2); wall.position.set(x, 1.5, z); hut.add(wall);
    colliders.push(BoxCollider.fromData({ kind: 'box', x: layout.HUT.x + x, y: (y + 3 + y) / 2, z: layout.HUT.z + z, hx: hw, hy: Math.max(0.005, (y + 3 - y) / 2), hz: hd, yaw: -0, surface: 'wood' }).toColliderData());
  }
  ctx.root.add(hut); ctx.piece({ id: 'ink.hut', name: 'Grey hut', category: 'buildings', file, object: hut, colliders, surface: 'wood' });
  const panel = cube(1.8, 2.5, 0.2, 0x555555, 2); panel.position.set(layout.HUT.x, y + 1.2, layout.HUT.doorZ);
  ctx.root.add(panel); ctx.piece({ id: 'ink.door', name: 'Open hut door', category: 'buildings', file, object: panel,
    colliders: [BoxCollider.fromData({ kind: 'box', x: layout.HUT.x, y: (y + 2.5 + y) / 2, z: layout.HUT.doorZ, hx: 0.9, hy: Math.max(0.005, (y + 2.5 - y) / 2), hz: 0.1, yaw: -0, surface: 'wood' }).toColliderData()], active: () => true });
  const ramp = new Group(), from: [number, number, number] = [8, heightAt(8, -8), -8], to: [number, number, number] = [8, from[1] + 2, -14];
  for (let i = 0; i < 10; i++) { const tread = cube(3, 0.2, 0.6, 0x888888, 2); tread.position.set(8, from[1] + (i + 1) * 0.2 - 0.1, -8 - (i + 0.5) * 0.6); ramp.add(tread); }
  const slope = cube(3, 0.24, Math.sqrt(40), 0x888888, 2); slope.position.set(12, from[1] + 0.9, -11); slope.rotation.x = Math.atan2(2, 6); ramp.add(slope);
  ctx.root.add(ramp); ctx.piece({ id: 'ink.ramp', name: 'Ramp and stair treads', category: 'buildings', file, object: ramp,
    colliders: [{ kind: 'box', x: 12, y: from[1] + 0.9, z: -11, hx: 1.5, hy: 0.12, hz: Math.sqrt(40) / 2,
      rot: { x: Math.sin(Math.atan2(2, 6) / 2), y: 0, z: 0, w: Math.cos(Math.atan2(2, 6) / 2) }, surface: 'wood' },
      { kind: 'treads', from: { x: from[0], y: from[1], z: from[2] }, to: { x: to[0], y: to[1], z: to[2] }, width: 3, count: 10, surface: 'wood' }], surface: 'wood' });
  const props = new Group(), random = ctx.rng.stream('cosmetic');
  for (let i = 0; i < propCount; i++) { const x = random.range(-25, 25), z = random.range(5, 30), prop = cube(0.6, 0.6, 0.6); prop.position.set(x, heightAt(x, z) + 0.3, z); props.add(prop); }
  ctx.root.add(props); ctx.piece({ id: 'ink.props', name: 'Grey props', category: 'props', file, object: props });
  const pool = new Mesh(new CircleGeometry(5, 24), new MeshStandardMaterial({ color: 0x9aa6b0, transparent: true, opacity: 0.7 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(25, 0, 20); ctx.root.add(pool);
  ctx.root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (node.geometry instanceof BufferGeometry) ctx.scope.own(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material instanceof Material) ctx.scope.own(material);
  });
  ctx.scope.onDispose(() => { ctx.root.removeFromParent(); });
}

/** The jump course's three practice pads, `baseHeight` up at `x`. */
export function jumpCoursePads(baseHeight: number, x = 0): Group {
  const root = new Group();
  for (let i = 0; i < 3; i++) { const pad = cube(3, 0.3, 3); pad.position.set(x, baseHeight + i * 0.3, -i * 4); root.add(pad); }
  return root;
}

/** The lantern as held (lamp and its unlit light, at the off-hand offset). */
export function lanternModel(): Group {
  const model = new Group(), lamp = cube(0.12, 0.18, 0.12, 0x888888, 2);
  model.add(lamp, new PointLight(0xffe1aa, 0, 8)); model.position.set(-0.3, -0.3, -0.55);
  return model;
}
