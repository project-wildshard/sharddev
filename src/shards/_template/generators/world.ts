import { BoxCollider } from '@wildshard/sharddev/physics';
import type { PropsBakeSource } from '@wildshard/sharddev/bake/props';
import { measureUv, type MeasureRole } from '@wildshard/sharddev/measure';
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
/** What the shapes need: a root, a scope that owns their buffers, the registry sink, the seeded RNG and the ground height. */
/** One authored scene part and its collider rows, before SDK compilation. No native registry owns it. */
export interface TemplatePart {
  id: string; name: string; category: 'buildings' | 'nature' | 'props' | 'ground'; file: string; object: Object3D;
  colliders?: NonNullable<PropsBakeSource['colliders']>[number]['shapes'];
  surface?: 'wood' | 'stone' | 'metal'; active?: () => boolean;
}
/** Build-time graph, resource cleanup, authored part sink, seeded scatter draws and ground law. */
export interface TemplateWorldPorts {
  root: Object3D;
  scope: { own: (resource: { dispose: () => void }) => void; onDispose: (cleanup: () => void) => void };
  piece: (part: TemplatePart) => void;
  rng: { stream: (name: 'cosmetic') => { range: (a: number, b: number) => number } };
  heightAt: (x: number, z: number) => number;
}
/** The hut, door, ramp, `propCount` scattered cubes and the pool disc, under `root`, each a registry piece as the runtime registered it. */
export function buildTemplateWorld(ctx: TemplateWorldPorts, propCount: number): void {
  const { heightAt } = ctx, file = 'src/shards/_template/generators/world.ts';
  const y = heightAt(layout.HUT.x, layout.HUT.z);
  const hut = new Group(); hut.position.set(layout.HUT.x, y, layout.HUT.z);
  const roof = cube(6.6, 0.4, 6.6, 0x5c7a34, 2); roof.position.y = 3; hut.add(roof);
  const colliders = [];
  for (const [x, z, hw, hd] of [[-3, 0, 0.15, 3], [3, 0, 0.15, 3], [0, -3, 3, 0.15], [-2, 3, 1, 0.15], [2, 3, 1, 0.15]]) {
    if (x === undefined || z === undefined || hw === undefined || hd === undefined) continue;
    const wall = cube(hw * 2, 3, hd * 2, 0x7d7a68); wall.position.set(x, 1.5, z); hut.add(wall);
    colliders.push(BoxCollider.fromData({ kind: 'box', x: layout.HUT.x + x, y: (y + 3 + y) / 2, z: layout.HUT.z + z, hx: hw, hy: Math.max(0.005, (y + 3 - y) / 2), hz: hd, yaw: -0, surface: 'wood' }).toColliderData());
  }
  ctx.root.add(hut); ctx.piece({ id: 'template.hut', name: 'Grey hut', category: 'buildings', file, object: hut, colliders, surface: 'wood' });
  const panel = cube(1.8, 2.5, 0.2, 0x6e4a2a, 2); panel.position.set(layout.HUT.x, y + 1.2, layout.HUT.doorZ);
  ctx.root.add(panel); ctx.piece({ id: 'template.door', name: 'Open hut door', category: 'buildings', file, object: panel,
    colliders: [BoxCollider.fromData({ kind: 'box', x: layout.HUT.x, y: (y + 2.5 + y) / 2, z: layout.HUT.doorZ, hx: 0.9, hy: Math.max(0.005, (y + 2.5 - y) / 2), hz: 0.1, yaw: -0, surface: 'wood' }).toColliderData()], active: () => true });
  // Mossgate Hollow v3 (MH-1): braziers A, B and C on labelled pads east of the slab path, unlit until MH-2.
  const braziers = new Group(), stands: NonNullable<TemplatePart['colliders']> = [];
  for (const [x, z] of layout.BRAZIERS) {
    if (x === undefined || z === undefined) continue;
    const by = heightAt(x, z), pad = cube(3, 0.1, 3, 0x6d6a5c, 2), base = cube(1.1, 0.4, 1.1, 0x7d7a68), stem = cube(0.6, 0.7, 0.6, 0x7d7a68), bowl = cube(1.3, 0.3, 1.3, 0x5a5650, 2);
    pad.position.set(x, by + 0.05, z); base.position.set(x, by + 0.3, z); stem.position.set(x, by + 0.85, z); bowl.position.set(x, by + 1.35, z);
    braziers.add(pad, base, stem, bowl);
    stands.push(BoxCollider.fromData({ kind: 'box', x, y: by + 0.75, z, hx: 0.55, hy: 0.75, hz: 0.55, yaw: -0, surface: 'stone' }).toColliderData());
  }
  ctx.root.add(braziers); ctx.piece({ id: 'template.braziers', name: 'Braziers A, B and C', category: 'props', file, object: braziers, colliders: stands, surface: 'stone' });
  // Mossgate Hollow v3 (MH-2): brazier A's flame, a panel the shared field `template.brazier-a` shows, and the moss gate
  // it opens (a panel and collider the same field hides). The fire's colour is the client script's particles: the measure
  // look gives every surface its role colour, so the flame shape itself reads as stone.
  const [ax = 3, az = -6] = layout.BRAZIERS[0] ?? [], flame = brazierFlame(ax, heightAt(ax, az) + 1.5, az);
  ctx.root.add(flame); ctx.piece({ id: 'template.brazier-a.flame', name: 'Brazier A flame', category: 'props', file, object: flame });
  const gate = mossGate(heightAt);
  ctx.root.add(gate.frame); ctx.piece({ id: 'template.mossgate-frame', name: 'Moss gate frame', category: 'buildings', file, object: gate.frame, colliders: gate.frameColliders, surface: 'stone' });
  ctx.root.add(gate.panel); ctx.piece({ id: 'template.mossgate', name: 'Moss gate', category: 'nature', file, object: gate.panel, colliders: gate.panelColliders, active: () => true });
  const dressing = mossgateDressing(heightAt);
  ctx.root.add(dressing.object); ctx.piece({ id: 'template.dressing', name: 'Mossgate dressing', category: 'nature', file, object: dressing.object, colliders: dressing.colliders, surface: 'stone' });
  const ramp = new Group(), from: [number, number, number] = [8, heightAt(8, -8), -8], to: [number, number, number] = [8, from[1] + 2, -14];
  for (let i = 0; i < 10; i++) { const tread = cube(3, 0.2, 0.6, 0x888888, 2); tread.position.set(8, from[1] + (i + 1) * 0.2 - 0.1, -8 - (i + 0.5) * 0.6); ramp.add(tread); }
  const slope = cube(3, 0.24, Math.sqrt(40), 0x888888, 2); slope.position.set(12, from[1] + 0.9, -11); slope.rotation.x = Math.atan2(2, 6); ramp.add(slope);
  ctx.root.add(ramp); ctx.piece({ id: 'template.ramp', name: 'Ramp and stair treads', category: 'buildings', file, object: ramp,
    colliders: [{ kind: 'box', x: 12, y: from[1] + 0.9, z: -11, hx: 1.5, hy: 0.12, hz: Math.sqrt(40) / 2,
      rot: { x: Math.sin(Math.atan2(2, 6) / 2), y: 0, z: 0, w: Math.cos(Math.atan2(2, 6) / 2) }, surface: 'wood' },
      { kind: 'treads', from: { x: from[0], y: from[1], z: from[2] }, to: { x: to[0], y: to[1], z: to[2] }, width: 3, count: 10, surface: 'wood' }], surface: 'wood' });
  const props = new Group(), random = ctx.rng.stream('cosmetic');
  for (let i = 0; i < propCount; i++) { const x = random.range(-25, 25), z = random.range(5, 30), prop = cube(0.6, 0.6, 0.6); prop.position.set(x, heightAt(x, z) + 0.3, z); props.add(prop); }
  ctx.root.add(props); ctx.piece({ id: 'template.props', name: 'Grey props', category: 'props', file, object: props });
  const pool = new Mesh(new CircleGeometry(5, 24), new MeshStandardMaterial({ color: 0x9aa6b0, transparent: true, opacity: 0.7 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(25, 0, 20); ctx.root.add(pool);
  ctx.root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (node.geometry instanceof BufferGeometry) ctx.scope.own(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material instanceof Material) ctx.scope.own(material);
  });
  ctx.scope.onDispose(() => { ctx.root.removeFromParent(); });
}

/** A fixed jitter in −1 … 1 from two integers (the dressing never draws from the scatter stream, so the props stay put). */
const jitter = (i: number, k: number): number => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
/** A box of role `role` at (x, y, z), turned `yaw` and tipped `tilt` (radians). */
function block(w: number, h: number, d: number, role: MeasureRole, x: number, y: number, z: number, yaw = 0, tilt = 0): Mesh {
  const mesh = cube(w, h, d, 0x888888, role); mesh.position.set(x, y, z); mesh.rotation.set(tilt, yaw, tilt * 0.6, 'YXZ'); return mesh;
}
/**
 * Mossgate Hollow v3 (MH-1b): the yard's dressing, one step past grey-box and still a test level. A stepping-slab path
 * from spawn to the hut door, the door lamp, mossy boulders, ferns and mushroom clumps, all measure boxes (the dev-map
 * look draws stone as structure, moss as trim). Fixed placements, so the build is stable; colliders on the solid pieces.
 */
export function mossgateDressing(heightAt: (x: number, z: number) => number): { object: Group; colliders: NonNullable<TemplatePart['colliders']> } {
  const root = new Group(), colliders: NonNullable<TemplatePart['colliders']> = [];
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number): void => { colliders.push(BoxCollider.fromData({ kind: 'box', x, y, z, hx, hy, hz, yaw: -0, surface: 'stone' }).toColliderData()); };
  // the slab path: eight stepping stones from spawn to the door, each a little off the line and turned
  for (let i = 0; i < 8; i++) {
    const z = -1.4 - i * 1.0, x = jitter(i, 1) * 0.28, w = 1.05 + jitter(i, 2) * 0.2, d = 0.72 + jitter(i, 3) * 0.12;
    root.add(block(w, 0.08, d, 1, x, heightAt(x, z) + 0.04, z, jitter(i, 4) * 0.35));
  }
  // the door lamp: a post right of the door, an arm over the doorway and a lamp box under a moss cap
  const lx = 1.55, lz = -8.3, ly = heightAt(lx, lz);
  root.add(block(0.2, 2.6, 0.2, 2, lx, ly + 1.3, lz), block(1.2, 0.12, 0.12, 2, lx - 0.5, ly + 2.5, lz), block(0.08, 0.2, 0.08, 2, lx - 1.0, ly + 2.36, lz));
  root.add(block(0.42, 0.5, 0.42, 1, lx - 1.0, ly + 2.0, lz), block(0.56, 0.1, 0.56, 2, lx - 1.0, ly + 2.3, lz), block(0.5, 0.08, 0.5, 2, lx - 1.0, ly + 1.71, lz), block(0.46, 0.24, 0.46, 1, lx, ly + 0.12, lz));
  box(lx, ly + 1.25, lz, 0.12, 1.25, 0.12);
  // mossy boulders: two or three tumbled stones and a moss cap each
  const boulders: [number, number, number][] = [[-4.4, -6.2, 1.3], [-6.2, -2.4, 1.0], [5.2, -2.6, 1.15], [-6.8, -10.4, 1.6], [13.2, -7.4, 1.4], [-2.6, 2.6, 0.8]];
  boulders.forEach(([x, z, s], i) => {
    const y = heightAt(x, z);
    root.add(block(s, s * 0.7, s * 0.9, 1, x, y + s * 0.3, z, jitter(i, 5) * 1.5, jitter(i, 6) * 0.18));
    root.add(block(s * 0.62, s * 0.5, s * 0.6, 1, x + s * 0.45, y + s * 0.2, z + s * 0.28, jitter(i, 7) * 1.5, jitter(i, 8) * 0.25));
    if (s > 1.1) root.add(block(s * 0.45, s * 0.38, s * 0.5, 1, x - s * 0.5, y + s * 0.14, z - s * 0.2, jitter(i, 9) * 1.5, 0.2));
    root.add(block(s * 0.8, 0.1, s * 0.7, 2, x, y + s * 0.67, z, jitter(i, 5) * 1.5, jitter(i, 6) * 0.18));
    box(x, y + s * 0.35, z, s * 0.55, s * 0.35, s * 0.5);
  });
  // ferns: seven moss fronds fanned up and out from one root
  const ferns: [number, number, number][] = [[-2.7, -8.0, 1], [2.8, -8.1, 1], [-3.5, -5.2, 0.9], [1.7, -3.3, 0.8], [-1.6, -2.0, 0.75], [6.0, -4.4, 0.9], [-5.3, -8.4, 1.1], [-5.0, -1.3, 0.85], [8.3, -8.6, 1], [-3.2, -9.6, 0.8]];
  ferns.forEach(([x, z, s], i) => {
    const y = heightAt(x, z);
    for (let k = 0; k < 7; k++) {
      const yaw = (k / 7) * Math.PI * 2 + jitter(i, 10) + jitter(i * 7 + k, 11) * 0.2, len = s * (0.75 + jitter(i * 7 + k, 12) * 0.15);
      const frond = cube(0.16 * s, 0.03, len, 0x888888, 2), pivot = new Group(), lift = 0.75 + jitter(i * 7 + k, 13) * 0.15;
      frond.rotation.x = -lift; frond.position.set(0, Math.sin(lift) * len / 2, Math.cos(lift) * len / 2);
      pivot.add(frond); pivot.position.set(x, y + 0.02, z); pivot.rotation.y = yaw; root.add(pivot);
    }
  });
  // mushroom clumps: pale stems under wide stone caps, by the path and the boulders
  const mushrooms: [number, number][] = [[-1.1, -4.6], [0.9, -6.6], [-3.6, -6.9], [4.4, -3.2], [-5.6, -3.1], [2.2, -8.6], [-1.9, -7.4]];
  mushrooms.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      const mx = x + jitter(i, 20 + k) * 0.28, mz = z + jitter(i, 30 + k) * 0.28, h = 0.16 + (k === 0 ? 0.12 : 0) + jitter(i, 40 + k) * 0.04, y = heightAt(mx, mz);
      root.add(block(0.06, h, 0.06, 1, mx, y + h / 2, mz), block(0.24 - k * 0.04, 0.07, 0.24 - k * 0.04, 1, mx, y + h + 0.03, mz, jitter(i, 50 + k), jitter(i, 60 + k) * 0.2));
    }
  });
  return { object: root, colliders };
}

/** Brazier A's flame (MH-2): four tapering boxes, each turned, standing in the bowl whose rim is at `y`. */
export function brazierFlame(x: number, y: number, z: number): Group {
  const root = new Group();
  for (const [w, h, at, yaw] of [[0.9, 0.22, 0.11, 0], [0.62, 0.42, 0.42, 0.6], [0.36, 0.5, 0.86, 1.3], [0.14, 0.34, 1.26, 0.3]] as const) root.add(block(w, h, w, 1, x, y + at, z, yaw));
  return root;
}
/**
 * The moss gate (MH-2) at `layout.MOSSGATE`: two stone posts and a lintel with low wing walls running north and south, and in
 * the 2.4 m gap a moss curtain (the panel, with its own collider) that brazier A's field takes away. You walk west through it.
 */
export function mossGate(heightAt: (x: number, z: number) => number): { frame: Group; panel: Group; frameColliders: NonNullable<TemplatePart['colliders']>; panelColliders: NonNullable<TemplatePart['colliders']> } {
  const { x, z } = layout.MOSSGATE, y = heightAt(x, z), frame = new Group(), panel = new Group(), frameColliders: NonNullable<TemplatePart['colliders']> = [];
  const box = (bx: number, by: number, bz: number, hx: number, hy: number, hz: number): NonNullable<TemplatePart['colliders']>[number] => BoxCollider.fromData({ kind: 'box', x: bx, y: by, z: bz, hx, hy, hz, yaw: -0, surface: 'stone' }).toColliderData();
  for (const side of [-1, 1]) {
    const pz = z + side * 1.55;
    frame.add(block(0.7, 3.2, 0.7, 1, x, y + 1.6, pz), block(0.82, 0.12, 0.82, 2, x, y + 3.26, pz));
    frameColliders.push(box(x, y + 1.6, pz, 0.35, 1.6, 0.35));
    const wz = z + side * 4.1;
    frame.add(block(0.6, 1.5, 4.4, 1, x, y + 0.75, wz), block(0.7, 0.1, 4.5, 2, x, y + 1.55, wz));
    frameColliders.push(box(x, y + 0.75, wz, 0.3, 0.75, 2.2));
  }
  frame.add(block(0.8, 0.5, 4.0, 1, x, y + 3.45, z), block(0.9, 0.12, 4.1, 2, x, y + 3.76, z));
  // the curtain: a moss sheet and hanging strands of uneven length
  panel.add(block(0.24, 2.9, 2.4, 2, x, y + 1.75, z));
  for (let k = 0; k < 7; k++) { const h = 0.6 + (jitter(k, 70) + 1) * 0.5, sz = z - 1.05 + k * 0.35; panel.add(block(0.32, h, 0.18, 2, x + 0.04 * jitter(k, 71), y + 3.2 - h / 2, sz)); }
  return { frame, panel, frameColliders, panelColliders: [box(x, y + 1.6, z, 0.2, 1.6, 1.2)] };
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
