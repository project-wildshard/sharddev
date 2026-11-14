import { BoxCollider } from '@wildshard/sdk/physics';
import type { PropsBakeSource } from '@wildshard/sdk/bake/props';
import { measureUv, type MeasureRole } from '@wildshard/sdk/measure';
import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, LatheGeometry, Material, Matrix4, Mesh, MeshStandardMaterial, PointLight, Vector2, Vector3, type Object3D } from 'three';
import layout from '../data/layout.json' with { type: 'json' };
import { POND, pondEdge, pondSDF } from './landscape';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coursedBox, lumpyCrown, surfaceBox, weather } from './weather';

/**
 * Build-time only (SHARD-PLATFORM SF16): the template's grey-box shapes as the props baker
 * (src/shards/_template/generators/templatePropsSource.ts) samples them: the hut with its wall colliders, the door panel, the ramp with
 * stair treads, the scattered cubes, the pool disc, the jump-course pads and the lantern's lamp. These are the legacy
 * runtime builders' shapes, kept here so the bake no longer reads the runtime modules (retired with the template
 * chunk); nothing here is imported by the client.
 */
export const poolMask = (x: number, z: number): boolean => pondSDF(x, z) < 0;

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
/**
 * LF1-7: the colours the look's `tint` keeps (look.json `materials.pbr.measure.tint`). Stone is a cool grey-violet, the
 * hut's blocks a warmer grey, moss its own green (so a trim cap stays moss under a trim tint), wood and iron for the hut's
 * posts, bench, barrels and lamp.
 */
export const STONE = 0x8c867a, HUT_STONE = 0x9a9080, MOSS = 0x5b7a30, MOSS_LIGHT = 0x76963c, WOOD = 0x86592f, WOOD_DARK = 0x5e3d22, IRON = 0x3a3634, CAP_RED = 0xb23a26, STEM = 0xd6cbb2, SLAB = 0x9a9488;
/** The moss gate's opening half width and pillar size: the yard's west wall stops at the pillars' outer faces. */
export const GATE_GAP = 1.5, GATE_PILLAR = 1.35;
/** M2: the moss bridge's six stones span the pond's long axis, their centres this far either side of its middle. */
export const BRIDGE_STONES = 6, BRIDGE_REACH = 5.2;
/** The arena's way in, as an angle round `layout.ARENA`: M2's arch faces west, toward the yard's east gap. */
const arenaDoor = (): number => -Math.PI / 2;
/** M2: the arena ring is a low mossy wall (the cleanroom's); the arch and its gate stand taller. */
export const ARENA_WALL = 2.0, ARENA_GATE = 3.0;
/** M2: the hut room's floor planks and rug. */
export const PLANK = 0xa07a58, CLOTH = 0x8a3a2a;
const [[YX0, YZ0], [YX1, YZ1]] = layout.YARD as [[number, number], [number, number]];
/** The ivy's and the hanging moss's greens. */
export const IVY = 0x3d6a24, DRAPE = 0x5a7a2a;
/** The yard's stepping-slab paths (TEMPLATES-CLEANROOM M2, the cleanroom's): spawn to the hut door, to the moss gate, to
 *  brazier A's pad, to the arena arch, from the gate to the pond's east bank and from its west bank to brazier B. */
const G0 = layout.MOSSGATE, A0 = layout.BRAZIERS[0] ?? [0, 0], B0 = layout.BRAZIERS[1] ?? [0, 0];
export const PATHS: readonly (readonly [number, number])[][] = [
  [[0, 2.2], ...(layout.TRAIL[0] ?? []).slice(1).map(([x = 0, z = 0]): [number, number] => [x, z]).slice(0, -1), [layout.HUT.x, layout.HUT.doorZ + 0.6]],
  [[-1.4, 0.6], [-5, 0.2], [G0.x + 5.2, G0.z]],
  [[0.8, -1.2], [4.2, -4], [A0[0] ?? 0, (A0[1] ?? 0) + 2.1]],
  [[1.5, 0.6], [6, -1.2], [layout.ARENA.x - layout.ARENA.radius - 1.4, layout.ARENA.z]],
  [[G0.x - 1.4, G0.z], [POND.x + POND.hx + 0.9, POND.z]],
  [[POND.x - POND.hx - 0.6, POND.z], [(B0[0] ?? 0) + 1.3, B0[1] ?? 0]],
];
/** The practice ramp's foot (its treads climb 2 m toward −z), outside the yard's south wall. */
export const RAMP = { x: 4, z: 20 } as const;
/** LF1-7: the door lamp's post, right of the hut door (the lantern hangs 1 m left of it, over the doorway's right edge). */
export const LAMP_POST = { x: layout.HUT.x + 1.55, z: layout.HUT.doorZ + 0.7 } as const;
/** a grey-box shape (role 1, structure: stone; role 2, trim: moss) */
let walls = 0;
/** TEMPLATES-CLEANROOM M2: a tall thin box is a coursed masonry wall (`coursedBox`), anything else a plain box. */
const shape = (w: number, h: number, d: number, stone: boolean): BufferGeometry => (stone && h >= 1.2 && Math.max(w, d) >= 1.8 && Math.min(w, d) <= 1.6 ? coursedBox(w, h, d, walls++) : surfaceBox(w, h, d));
const cube = (w: number, h: number, d: number, color?: number, role: MeasureRole = 1): Mesh => {
  const geometry = shape(w, h, d, color === undefined || color === STONE || color === HUT_STONE), mesh = new Mesh(geometry, new MeshStandardMaterial({ color: color ?? (role === 2 ? MOSS : STONE), flatShading: true }));
  if (geometry.getAttribute('position').count > 24) mesh.userData.plainBox = [w, h, d];
  return mesh;
};
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
  hut.add(hutRoof());
  const colliders = [];
  for (const [x, z, hw, hd] of [[-3, 0, 0.15, 3], [3, 0, 0.15, 3], [0, -3, 3, 0.15], [-2, 3, 1, 0.15], [2, 3, 1, 0.15]]) {
    if (x === undefined || z === undefined || hw === undefined || hd === undefined) continue;
    const wall = cube(hw * 2, 3, hd * 2, HUT_STONE); wall.position.set(x, 1.5, z); hut.add(wall);
    colliders.push(BoxCollider.fromData({ kind: 'box', x: layout.HUT.x + x, y: (y + 3 + y) / 2, z: layout.HUT.z + z, hx: hw, hy: Math.max(0.005, (y + 3 - y) / 2), hz: hd, yaw: -0, surface: 'wood' }).toColliderData());
  }
  ctx.root.add(hut); ctx.piece({ id: 'template.hut', name: 'Grey hut', category: 'buildings', file, object: hut, colliders, surface: 'wood' });
  // M2: the furnished room inside and the ivy up the front corners, their own piece so the coarse tiles and far proxy skip them
  const room = hutInterior(); room.position.copy(hut.position);
  ctx.root.add(room); ctx.piece({ id: 'template.hut-interior', name: 'Hut room and ivy', category: 'props', file, object: room });
  const panel = cube(1.8, 2.5, 0.2, WOOD_DARK, 1); panel.position.set(layout.HUT.x, y + 1.2, layout.HUT.doorZ);
  ctx.root.add(panel); ctx.piece({ id: 'template.door', name: 'Open hut door', category: 'buildings', file, object: panel,
    colliders: [BoxCollider.fromData({ kind: 'box', x: layout.HUT.x, y: (y + 2.5 + y) / 2, z: layout.HUT.doorZ, hx: 0.9, hy: Math.max(0.005, (y + 2.5 - y) / 2), hz: 0.1, yaw: -0, surface: 'wood' }).toColliderData()], active: () => true });
  // Braziers A, B and C on lettered pads where the story puts them (TEMPLATES-CLEANROOM M2, the goldens' composition): A heads
  // the row at the back of the yard, B waits across the moss bridge, C stands by the arena arch. The row's two beacons
  // (layout.ROW) light with B and C. Unlit until their fields say so.
  const braziers = new Group(), stands: NonNullable<TemplatePart['colliders']> = [];
  for (const [x, z] of [...layout.BRAZIERS, ...layout.ROW]) {
    if (x === undefined || z === undefined) continue;
    const by = heightAt(x, z);
    braziers.add(brazierStand(x, by, z));
    stands.push(BoxCollider.fromData({ kind: 'box', x, y: by + 0.75, z, hx: 0.55, hy: 0.75, hz: 0.55, yaw: -0, surface: 'stone' }).toColliderData());
  }
  ctx.root.add(braziers); ctx.piece({ id: 'template.braziers', name: 'Braziers A, B and C', category: 'props', file, object: braziers, colliders: stands, surface: 'stone' });
  // Mossgate Hollow v3 (MH-2): the moss gate brazier A's shared field `template.brazier-a` opens (its bars are a panel and
  // collider the field hides). The braziers burn particles (client scripts on fields 102 to 104); A also shows an emissive
  // flame panel (LF1-7, `brazierFlame`): its tile 0/3/3 is at the cap of 8, paid for by drawing the panel and the hut door
  // (it straddles x = 0) with no shadow, one draw each instead of two.
  const gate = mossGate(heightAt);
  ctx.root.add(gate.frame); ctx.piece({ id: 'template.mossgate-frame', name: 'Moss gate frame', category: 'buildings', file, object: gate.frame, colliders: gate.frameColliders, surface: 'stone' });
  ctx.root.add(gate.vines); ctx.piece({ id: 'template.mossgate-vines', name: 'Moss gate vines', category: 'nature', file, object: gate.vines });
  ctx.root.add(gate.panel); ctx.piece({ id: 'template.mossgate', name: 'Moss gate', category: 'nature', file, object: gate.panel, colliders: gate.panelColliders, active: () => true });
  // Mossgate Hollow v3 (MH-3): brazier B's field raises the pond's stones out of the water, and brazier C's takes away the
  // bars across the arena's one way in. The sunken stones are static (no collider), so the raised panel covers them.
  const stones = pondStones();
  ctx.root.add(stones.raised); ctx.piece({ id: 'template.pond-stones', name: 'Pond stepping stones', category: 'nature', file, object: stones.raised, colliders: stones.colliders, active: () => false });
  ctx.root.add(stones.sunk); ctx.piece({ id: 'template.pond-stones-sunk', name: 'Sunken pond stones', category: 'nature', file, object: stones.sunk, surface: 'stone' });
  const planting = pondPlanting(heightAt);
  ctx.root.add(planting); ctx.piece({ id: 'template.pond-planting', name: 'Pond reeds, lily pads and lip', category: 'nature', file, object: planting });
  const arena = arenaRing(heightAt);
  ctx.root.add(arena.wall); ctx.piece({ id: 'template.arena-wall', name: 'Arena wall', category: 'buildings', file, object: arena.wall, colliders: arena.wallColliders, surface: 'stone' });
  ctx.root.add(arena.gate); ctx.piece({ id: 'template.arena-gate', name: 'Arena gate', category: 'buildings', file, object: arena.gate, colliders: arena.gateColliders, active: () => true });
  // LF1-9: the arena's checker floor, moss drips and rim braziers (its own piece, so the coarse L1 tiles skip it)
  const arenaDress = new Group(); arenaDressing(arenaDress, heightAt);
  ctx.root.add(arenaDress); ctx.piece({ id: 'template.arena-dressing', name: 'Arena floor, moss and rim braziers', category: 'buildings', file, object: arenaDress });
  const dressing = mossgateDressing(heightAt);
  ctx.root.add(dressing.object); ctx.piece({ id: 'template.dressing', name: 'Mossgate dressing', category: 'nature', file, object: dressing.object, colliders: dressing.colliders, surface: 'stone' });
  const foliage = mossgateFoliage(heightAt);
  ctx.root.add(foliage.object); ctx.piece({ id: 'template.foliage', name: 'Mossgate trees, tufts and ferns', category: 'nature', file, object: foliage.object, colliders: foliage.colliders, surface: 'wood' });
  // the practice ramp and its stair treads, outside the yard's south wall (M2 moved it off the brazier row)
  const { x: rx, z: rz } = RAMP, ramp = new Group(), from: [number, number, number] = [rx, heightAt(rx, rz), rz], to: [number, number, number] = [rx, from[1] + 2, rz - 6];
  for (let i = 0; i < 10; i++) { const tread = cube(3, 0.2, 0.6, 0x888888, 2); tread.position.set(rx, from[1] + (i + 1) * 0.2 - 0.1, rz - (i + 0.5) * 0.6); ramp.add(tread); }
  const slope = cube(3, 0.24, Math.sqrt(40), 0x888888, 2); slope.position.set(rx + 4, from[1] + 0.9, rz - 3); slope.rotation.x = Math.atan2(2, 6); ramp.add(slope);
  ctx.root.add(ramp); ctx.piece({ id: 'template.ramp', name: 'Ramp and stair treads', category: 'buildings', file, object: ramp,
    colliders: [{ kind: 'box', x: rx + 4, y: from[1] + 0.9, z: rz - 3, hx: 1.5, hy: 0.12, hz: Math.sqrt(40) / 2,
      rot: { x: Math.sin(Math.atan2(2, 6) / 2), y: 0, z: 0, w: Math.cos(Math.atan2(2, 6) / 2) }, surface: 'wood' },
      { kind: 'treads', from: { x: from[0], y: from[1], z: from[2] }, to: { x: to[0], y: to[1], z: to[2] }, width: 3, count: 10, surface: 'wood' }], surface: 'wood' });
  // M2: the yard's low coursed walls, the pond garden's and their moss caps, ivy and hanging moss
  const yard = yardWalls(heightAt);
  ctx.root.add(yard.object); ctx.piece({ id: 'template.yard-walls', name: 'Yard walls', category: 'buildings', file, object: yard.object, colliders: yard.colliders, surface: 'stone' });
  const props = new Group(), random = ctx.rng.stream('cosmetic');
  for (let i = 0; i < propCount; i++) { const x = random.range(-25, 25), z = random.range(5, 30), prop = cube(0.6, 0.6, 0.6); prop.position.set(x, heightAt(x, z) + 0.3, z); props.add(prop); }
  ctx.root.add(props); ctx.piece({ id: 'template.props', name: 'Grey props', category: 'props', file, object: props });
  const pool = new Mesh(new CircleGeometry(5, 24), new MeshStandardMaterial({ color: 0x9aa6b0, transparent: true, opacity: 0.7 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(POND.x, 0, POND.z); ctx.root.add(pool);
  weather(ctx.root, heightAt);
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
function block(w: number, h: number, d: number, role: MeasureRole, x: number, y: number, z: number, yaw = 0, tilt = 0, color?: number): Mesh {
  const mesh = cube(w, h, d, color, role); mesh.position.set(x, y, z); mesh.rotation.set(tilt, yaw, tilt * 0.6, 'YXZ'); return mesh;
}
type Colliders = NonNullable<TemplatePart['colliders']>;
/** A stone box collider at (x, y, z), half sizes `hx`, `hy`, `hz`, turned `yaw`. */
const stoneBox = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): Colliders[number] =>
  BoxCollider.fromData({ kind: 'box', x, y, z, hx, hy, hz, yaw: yaw === 0 ? -0 : yaw, surface: 'stone' }).toColliderData();
/** The dressing's mushroom clumps, as `mossgateDressing` places them: by the hut path, the hut and the boulders. */
const MUSHROOMS: [number, number][] = [[-1.7, -6.0], [1.9, -9.4], [-6.4, -10.6], [3.2, -3.4], [-4.6, -4.0], [-0.2, -12.4], [-7.6, -6.8], [6.9, 2.6], [-8.8, 5.2]];
/**
 * Mossgate Hollow v3 (MH-1b): the yard's dressing, one step past grey-box and still a test level. A stepping-slab path
 * from spawn to the hut door, the door lamp, mossy boulders, ferns and mushroom clumps, all measure boxes (the dev-map
 * look draws stone as structure, moss as trim). Fixed placements, so the build is stable; colliders on the solid pieces.
 */
export function mossgateDressing(heightAt: (x: number, z: number) => number): { object: Group; colliders: NonNullable<TemplatePart['colliders']> } {
  const root = new Group(), colliders: NonNullable<TemplatePart['colliders']> = [];
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number): void => { colliders.push(BoxCollider.fromData({ kind: 'box', x, y, z, hx, hy, hz, yaw: -0, surface: 'stone' }).toColliderData()); };
  // the slab paths: flat irregular stepping stones along each walk, each a little off the line and turned (the cleanroom's)
  let n = 0;
  for (const points of PATHS) for (let i = 0; i < points.length - 1; i++) {
    const [ax = 0, az = 0] = points[i] ?? [], [bx = 0, bz = 0] = points[i + 1] ?? [], len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.round(len / 1.15)), dir = Math.atan2(bx - ax, bz - az);
    for (let k = i === 0 ? 0 : 1; k <= steps; k++, n++) {
      const t = k / steps, x = ax + (bx - ax) * t + jitter(n, 1) * 0.15, z = az + (bz - az) * t + jitter(n, 2) * 0.1;
      if (poolMask(x, z)) continue;
      root.add(block(1.05 + jitter(n, 3) * 0.18, 0.08, 0.82 + jitter(n, 4) * 0.1, 1, x, heightAt(x, z) + 0.035, z, dir + jitter(n, 5) * 0.22, 0, SLAB));
    }
  }
  // the sign post at the fork: a post and a board turned toward the hut path
  const [sx = 0, sz = 0] = layout.SIGN, sy = heightAt(sx, sz);
  root.add(block(0.16, 1.9, 0.16, 1, sx, sy + 0.85, sz, 0, 0, WOOD_DARK), block(1.2, 0.34, 0.07, 1, sx - 0.15, sy + 1.4, sz, 0.35, 0, WOOD), block(0.5, 0.2, 0.06, 1, sx + 0.1, sy + 1.02, sz, -0.3, 0, WOOD));
  box(sx, sy + 0.85, sz, 0.1, 0.85, 0.1);
  // the door lamp: a post right of the door, an arm over the doorway and a lamp box under a moss cap
  const { x: lx, z: lz } = LAMP_POST, ly = heightAt(lx, lz);
  root.add(block(0.18, 2.6, 0.18, 1, lx, ly + 1.3, lz, 0, 0, IRON), block(1.2, 0.1, 0.1, 1, lx - 0.5, ly + 2.5, lz, 0, 0, IRON), block(0.06, 0.2, 0.06, 1, lx - 1.0, ly + 2.36, lz, 0, 0, IRON));
  // LF1-7: the lantern's iron frame (lid, base, four corner bars) round the glass (`hutLamp`, emissive)
  root.add(block(0.5, 0.1, 0.5, 1, lx - 1.0, ly + 2.29, lz, 0, 0, IRON), block(0.46, 0.08, 0.46, 1, lx - 1.0, ly + 1.72, lz, 0, 0, IRON), block(0.46, 0.24, 0.46, 1, lx, ly + 0.12, lz));
  for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) root.add(block(0.05, 0.5, 0.05, 1, lx - 1.0 + cx * 0.2, ly + 2.0, lz + cz * 0.2, 0, 0, IRON));
  box(lx, ly + 1.25, lz, 0.12, 1.25, 0.12);
  hutFront(root, colliders, heightAt);
  // mossy boulders: two or three tumbled stones and a moss cap each. LF1-7 checks: the small one moved from (-2.6, 2.6),
  // which sat on the spawn-to-arena walk, to between the arena and brazier C walks (foliage.test.ts keeps them clear)
  const boulders: [number, number, number][] = [[-6.2, -4.6, 1.3], [6.4, 3.4, 1.35], [-8.2, -11.2, 1.2], [10.6, -16.2, 1.35], [-8.4, 6.6, 1.2], [7.8, 5.8, 1.0], [-6.8, -17.3, 0.95], [2.4, -17.2, 0.85], [POND.x + POND.hx + 2.4, POND.z + 4.5, 1.35], [POND.x - POND.hx - 2.2, POND.z - 4.6, 1.2], [13.8, 3.4, 1.0], [-3.6, 5.4, 0.8]];
  boulders.forEach(([x, z, s], i) => {
    const y = heightAt(x, z);
    root.add(block(s, s * 0.7, s * 0.9, 1, x, y + s * 0.3, z, jitter(i, 5) * 1.5, jitter(i, 6) * 0.18));
    root.add(block(s * 0.62, s * 0.5, s * 0.6, 1, x + s * 0.45, y + s * 0.2, z + s * 0.28, jitter(i, 7) * 1.5, jitter(i, 8) * 0.25));
    if (s > 1.1) root.add(block(s * 0.45, s * 0.38, s * 0.5, 1, x - s * 0.5, y + s * 0.14, z - s * 0.2, jitter(i, 9) * 1.5, 0.2));
    root.add(block(s * 0.8, 0.1, s * 0.7, 2, x, y + s * 0.67, z, jitter(i, 5) * 1.5, jitter(i, 6) * 0.18));
    box(x, y + s * 0.35, z, s * 0.55, s * 0.35, s * 0.5);
  });
  // ferns: seven moss fronds fanned up and out from one root (LF1-5: tent fronds, half a box frond's bytes)
  const ferns: [number, number, number][] = [[-1.6, -12.4, 1], [-6.8, -12.0, 1.1], [-7.2, -12.8, 0.9], [-8.8, -2.9, 1], [-8.8, 2.9, 1], [-2.2, -5.4, 0.9], [3.1, -6.2, 0.8], [1.6, -11.8, 0.9], [-5.6, -3.6, 0.8], [7.2, 4.8, 0.9]];
  ferns.forEach(([x, z, s], i) => { root.add(fern(x, heightAt(x, z), z, s, i)); });
  // mushroom clumps: pale stems under domed caps, by the path and the boulders. LF1-5: a cap in L0 tile 0/4/3 (x ≥ 0, z < 0)
  // is red (`mushroomCaps`, its own emissive draw); 0/3/3 is at its 8 draws, so a cap there stays a stone box (its bytes
  // are near the 300 000-byte L0 cap too)
  MUSHROOMS.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      const mx = x + jitter(i, 20 + k) * 0.28, mz = z + jitter(i, 30 + k) * 0.28, h = 0.16 + (k === 0 ? 0.12 : 0) + jitter(i, 40 + k) * 0.04, y = heightAt(mx, mz);
      root.add(block(0.06, h, 0.06, 1, mx, y + h / 2, mz, 0, 0, STEM));
    }
  });
  return { object: root, colliders };
}

/**
 * LF1-5's foliage surfaces. A measure-look surface takes its role's flat colour (trim green, structure stone) and draws
 * the grid and size labels from its first UV set; every foliage vertex carries one fixed point 0.37 m into a 0.74 m face,
 * so no 1 m line, 0.25 m sub-line or label ever crosses a leaf. The mesh colour is real (a later `tint` keeps it).
 */
const foliageMaterial = (color: number): MeshStandardMaterial => new MeshStandardMaterial({ color, flatShading: true });
function foliageUv<T extends BufferGeometry>(geometry: T, role: MeasureRole): T {
  const [u, v] = measureUv(role, 0.37, 0.37, 0.74, 0.74), n = geometry.getAttribute('position').count, packed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { packed[i * 2] = u; packed[i * 2 + 1] = v; }
  geometry.setAttribute('uv', new Float32BufferAttribute(packed, 2));
  return geometry;
}
/** Closed triangles from `points`, each wound to face away from `centre`, as one flat-normalled foliage geometry. */
function tent(points: readonly Vector3[], triangles: readonly [number, number, number][], centre: Vector3, role: MeasureRole): BufferGeometry {
  const out: number[] = [], ab = new Vector3(), ac = new Vector3(), mid = new Vector3();
  for (const [i, j, k] of triangles) {
    const a = points[i], b = points[j], c = points[k]; if (a === undefined || b === undefined || c === undefined) throw new Error('tent: a point per corner');
    const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a)), away = mid.copy(a).add(b).add(c).divideScalar(3).sub(centre);
    for (const p of normal.dot(away) >= 0 ? [a, b, c] : [a, c, b]) out.push(p.x, p.y, p.z);
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3)); geometry.computeVertexNormals();
  return foliageUv(geometry, role);
}
/** M2: the brazier stand, the cleanroom's: a lettered slab pad, a stepped plinth, a round stem and a wide lathed bowl whose rim
 *  sits 1.5 m over the pad (the flame panel and the fire's particles rise from there). */
function brazierStand(x: number, by: number, z: number): Group {
  const root = new Group(), bowl: Vector2[] = [new Vector2(0, 0)];
  for (let i = 0; i <= 8; i++) { const t = i / 8; bowl.push(new Vector2(0.26 + 0.5 * Math.sin((t * Math.PI) / 2), t * 0.48)); }
  bowl.push(new Vector2(0.86, 0.5), new Vector2(0.84, 0.55), new Vector2(0.72, 0.5), new Vector2(0, 0.38));
  root.add(block(2.1, 0.1, 2.1, 1, x, by + 0.05, z, 0, 0, SLAB), block(1.18, 0.17, 1.18, 1, x, by + 0.085, z, 0, 0, STONE), block(0.94, 0.6, 0.94, 1, x, by + 0.4, z, 0, 0, STONE));
  const stem = new Mesh(foliageUv(new CylinderGeometry(0.24, 0.36, 0.3, 8), 1), foliageMaterial(STONE)); stem.position.set(x, by + 0.85, z);
  const cup = new Mesh(foliageUv(new LatheGeometry(bowl, 8), 1), foliageMaterial(0x6c6264)); cup.position.set(x, by + 0.95, z);
  root.add(stem, cup);
  return root;
}
/** A leafy ivy strand hanging `len` down from (x, y, z): small two-sided leaf diamonds either side of a stem, in the plane turned
 *  `yaw` (its width runs along (cos yaw, 0, −sin yaw)), `w` its spread. */
function ivy(x: number, y: number, z: number, len: number, yaw: number, w: number, seed: number): Mesh {
  const out: number[] = [], ux = Math.cos(yaw), uz = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);
  for (let k = 0, d = 0.04; d < len; k++, d += 0.065 + (jitter(seed, 300 + k) + 1) * 0.02) {
    const side = (k % 2 === 0 ? 1 : -1) * (0.3 + (jitter(seed, 320 + k) + 1) * 0.35) * w * 0.5, sway = Math.sin(d * 2.2 + seed) * 0.06;
    const cx = (side + sway) * ux, cz = (side + sway) * uz, cy = -d, s = 0.045 + (jitter(seed, 340 + k) + 1) * 0.02, lift = 0.02 + (jitter(seed, 360 + k) + 1) * 0.02;
    const p = [[cx - s * ux, cy, cz - s * uz], [cx, cy + s * 1.2, cz], [cx + s * ux, cy, cz + s * uz], [cx, cy - s * 0.9, cz]].map(([a = 0, b = 0, c = 0]) => [a + nx * lift, b, c + nz * lift]);
    for (const [i, j, l] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]] as const) for (const q of [p[i], p[j], p[l]]) out.push(...(q ?? [0, 0, 0]));
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3)); geometry.computeVertexNormals();
  const mesh = new Mesh(foliageUv(geometry, 2), foliageMaterial(IVY)); mesh.position.set(x, y, z); return mesh;
}
/** A strip of hanging moss `len` long under a cap's edge at (x, y, z), its ragged lower edge 0.35 to 1 × `h` down; two-sided, in
 *  the plane turned `yaw` like `ivy`. */
function drape(x: number, y: number, z: number, len: number, yaw: number, h: number, seed: number): Mesh {
  const out: number[] = [], ux = Math.cos(yaw), uz = -Math.sin(yaw), n = Math.max(2, Math.round(len * 4));
  const at = (c: number, down: number): number[] => { const t = -len / 2 + (len * c) / n; return [t * ux, -down, t * uz]; };
  for (let c = 0; c < n; c++) {
    const d0 = c === 0 ? 0.1 : h * (0.35 + (jitter(seed, 400 + c) + 1) * 0.32), d1 = c === n - 1 ? 0.1 : h * (0.35 + (jitter(seed, 401 + c) + 1) * 0.32);
    const a = at(c, 0), b = at(c + 1, 0), e = at(c, d0), f = at(c + 1, d1), tip = at(c + 0.5, Math.max(d0, d1) * (1.05 + (jitter(seed, 450 + c) + 1) * 0.2));
    for (const tri of [[a, b, e], [b, f, e], [e, f, tip]]) { for (const q of tri) out.push(...q); for (const q of [...tri].reverse()) out.push(...q); }
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3)); geometry.computeVertexNormals();
  const mesh = new Mesh(foliageUv(geometry, 2), foliageMaterial(DRAPE)); mesh.position.set(x, y, z); return mesh;
}
/**
 * TEMPLATES-CLEANROOM M2: the yard's walls (layout.YARD), the cleanroom's: low coursed stone runs with fat moss caps, hanging
 * moss under the caps and ivy down both faces; open at the moss gate (west) and toward the arena arch (east). The pond garden's
 * lower walls run west from the yard round brazier B. Axis-aligned runs, cut in pieces of at most 4.2 m, a collider each.
 */
export function yardWalls(heightAt: (x: number, z: number) => number): { object: Group; colliders: Colliders } {
  const root = new Group(), colliders: Colliders = [], T = 0.75, SINK = 0.25;
  const gx = layout.MOSSGATE, g = GATE_GAP + GATE_PILLAR - 0.05, px = POND.x - POND.hx - 7;
  const runs: [number, number, number, number, number, [number, number][]][] = [
    [YX0, YZ0, YX1, YZ0, 1.45, []], [YX1, YZ0, YX1, YZ1, 1.45, [[layout.ARENA.z - 1.9, layout.ARENA.z + 1.9]]], [YX0, YZ1, YX1, YZ1, 1.2, []],
    [YX0, YZ0, YX0, YZ1, 1.45, [[gx.z - g, gx.z + g]]], [px, -9, YX0 - T / 2, -9, 1.2, []], [px, 9, YX0 - T / 2, 9, 1.2, []], [px, -9, px, 9, 1.2, []],
  ];
  let seed = 0;
  for (const [x0, z0, x1, z1, h, gaps] of runs) {
    const alongX = z0 === z1, lo = alongX ? x0 : z0, hi = alongX ? x1 : z1, cuts = [lo, ...gaps.flat(), hi];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i] ?? lo, b = cuts[i + 1] ?? hi, n = Math.ceil((b - a) / 4.2), L = (b - a) / n;
      for (let k = 0; k < n; k++, seed++) {
        const m = a + (k + 0.5) * L, x = alongX ? m : x0, z = alongX ? z0 : m, yaw = alongX ? 0 : Math.PI / 2;
        const ends = [-0.5, 0, 0.5].map((t) => heightAt(alongX ? m + t * L : x, alongX ? z : m + t * L)), y = Math.min(...ends) - SINK, top = Math.max(...ends) + h;
        const wall = alongX ? block(L + 0.02, top - y, T, 1, x, (y + top) / 2, z, 0, 0, STONE) : block(T, top - y, L + 0.02, 1, x, (y + top) / 2, z, 0, 0, STONE);
        const cap = alongX ? block(L + 0.14, 0.3, T + 0.24, 2, x, top + 0.1, z) : block(T + 0.24, 0.3, L + 0.14, 2, x, top + 0.1, z);
        root.add(wall, cap);
        colliders.push(BoxCollider.fromData({ kind: 'box', x, y: (y + top) / 2 + 0.1, z, hx: alongX ? L / 2 : T / 2, hy: (top - y) / 2 + 0.1, hz: alongX ? T / 2 : L / 2, yaw: -0, surface: 'stone' }).toColliderData());
        for (const side of [-1, 1]) {
          const ox = alongX ? 0 : side * (T / 2 + 0.13), oz = alongX ? side * (T / 2 + 0.13) : 0, ux = alongX ? 1 : 0, uz = alongX ? 0 : 1;
          const dl = Math.min(L - 0.4, 0.8 + (jitter(seed, 512 + side) + 1) * 0.6), d0 = jitter(seed, 510 + side) * (L - dl - 0.2) * 0.5;
          if (dl > 0.3) root.add(drape(x + ox + ux * d0, top - 0.03, z + oz + uz * d0, dl, yaw, 0.3 + (jitter(seed, 514 + side) + 1) * 0.18, seed * 2 + side));
          if (jitter(seed, 516 + side) > -0.2) { const t = jitter(seed, 518 + side) * L * 0.4; root.add(ivy(x + ox * 0.6 + ux * t, top - 0.02, z + oz * 0.6 + uz * t, 0.6 + (jitter(seed, 520 + side) + 1) * (h - 0.4) * 0.5, yaw, 0.3, seed * 3 + side)); }
        }
      }
    }
  }
  return { object: root, colliders };
}

/** A fern at (x, y, z), `s` its size: seven tent fronds (six triangles each, seen from above and below) fanned up and out. */
function fern(x: number, y: number, z: number, s: number, i: number): Group {
  const root = new Group(), material = foliageMaterial(0x4f7a2a); root.position.set(x, y + 0.02, z);
  for (let k = 0; k < 7; k++) {
    const yaw = (k / 7) * Math.PI * 2 + jitter(i, 10) + jitter(i * 7 + k, 11) * 0.2, len = s * (0.75 + jitter(i * 7 + k, 12) * 0.15), w = 0.11 * s;
    const lift = 0.75 + jitter(i * 7 + k, 13) * 0.15, tip = new Vector3(0, 0, len), points = [new Vector3(0, 0, 0), new Vector3(-w, 0, len * 0.42), new Vector3(0, 0.035 * s, len * 0.45), new Vector3(w, 0, len * 0.42), tip];
    const frond = new Mesh(tent(points, [[0, 1, 2], [1, 4, 2], [0, 2, 3], [2, 4, 3], [0, 3, 1], [1, 3, 4]], new Vector3(0, 0.012 * s, len * 0.4), 2), material);
    frond.rotation.set(-lift * 0.75, 0, 0); const pivot = new Group(); pivot.rotation.y = yaw; pivot.add(frond); root.add(pivot);
  }
  return root;
}
/** A grass tuft at (x, y, z): five thin three-sided blades leaning out from one root, `s` its height in ~0.4 m. */
function tuft(x: number, y: number, z: number, s: number, i: number): Mesh {
  const points: Vector3[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + jitter(i, 70 + k) * 0.5, h = s * (0.34 + jitter(i, 75 + k) * 0.1), r = 0.035 * s, cx = Math.cos(a) * 0.05 * s, cz = Math.sin(a) * 0.05 * s;
    for (let c = 0; c < 3; c++) points.push(new Vector3(cx + Math.cos(a + (c * 2 * Math.PI) / 3) * r, 0, cz + Math.sin(a + (c * 2 * Math.PI) / 3) * r));
    points.push(new Vector3(cx + Math.cos(a) * h * 0.4, h, cz + Math.sin(a) * h * 0.4));
  }
  // each blade faces out from its own axis, so wind each side against that blade's base centre, not the tuft's
  const geometry = new BufferGeometry(), out: number[] = [];
  for (let k = 0; k < 5; k++) {
    const blade = points.slice(k * 4, k * 4 + 4), base = blade.slice(0, 3).reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(3);
    const one = tent(blade, [[0, 1, 3], [1, 2, 3], [2, 0, 3]], base, 2).getAttribute('position');
    for (let v = 0; v < one.count; v++) out.push(one.getX(v), one.getY(v), one.getZ(v));
  }
  geometry.setAttribute('position', new Float32BufferAttribute(out, 3)); geometry.computeVertexNormals();
  const mesh = new Mesh(foliageUv(geometry, 2), foliageMaterial(0x6a8a34)); mesh.position.set(x, y, z); return mesh;
}
/** A domed mushroom cap, `r` across, seated on its stem's top: an eight-sided frustum with its lid. */
function mushroomCap(r: number, material: MeshStandardMaterial, role: MeasureRole = 1): Mesh {
  const geometry = foliageUv(new CylinderGeometry(r * 0.35, r, r * 0.55, 8, 1, false), role); geometry.translate(0, r * 0.2, 0);
  return new Mesh(geometry, material);
}

/**
 * LF1-7: the hut's pitched moss roof, in the hut's own frame (walls 3 m up at x, z = ±3). The ridge runs east to west: two
 * moss slabs (trim, so the look's trim grid draws their shingle courses) with a 0.5 m overhang, a pale ridge cap, and stone
 * gables closing the ends. Replaces MH-1's flat slab. Lean on purpose: L0 tile 0/3/3 is near its 300 000-byte cap.
 */
function hutRoof(): Group {
  const roof = new Group(), run = 3.5, rise = 1.5, pitch = Math.atan2(rise, run), length = Math.hypot(run, rise), ridge = 4.55;
  for (const side of [1, -1]) {
    const slab = cube(7.0, 0.26, length, MOSS, 2);
    slab.position.set(0, ridge - (length / 2) * Math.sin(pitch), side * (length / 2) * Math.cos(pitch)); slab.rotation.x = side * pitch; roof.add(slab);
  }
  const cap = cube(7.1, 0.2, 0.44, MOSS_LIGHT, 2); cap.position.y = ridge + 0.16; roof.add(cap);
  // each gable's top edges lie on its slab's underside (Codex review): a base `half` wide at the wall top meets the slope
  const under = ridge - 0.13 / Math.cos(pitch), half = (under - 3) / Math.tan(pitch);
  for (const x of [-3, 3]) {
    const points = [[-0.15, 3, -half], [-0.15, 3, half], [-0.15, under, 0], [0.15, 3, -half], [0.15, 3, half], [0.15, under, 0]].map(([px = 0, py = 0, pz = 0]) => new Vector3(x + px, py, pz));
    roof.add(new Mesh(tent(points, [[0, 1, 2], [3, 4, 5], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]], new Vector3(x, 3.4, 0), 1), foliageMaterial(HUT_STONE)));
  }
  return roof;
}
/**
 * LF1-7: the hut's front, around the door at (layout.HUT.x, doorZ): wood door posts and a lintel, a bench left of the door
 * and two hooped barrels right of it (eight-sided, open hoops: bytes are tight; each with a wood collider), all in the static draw (bytes, not draws).
 */
function hutFront(root: Group, colliders: Colliders, heightAt: (x: number, z: number) => number): void {
  const { x: hx, doorZ } = layout.HUT, y = heightAt(hx, doorZ), front = doorZ + 0.17;
  const wood = (x: number, z: number, hx2: number, hy: number, hz: number, y0: number): void => { colliders.push(BoxCollider.fromData({ kind: 'box', x, y: y0 + hy, z, hx: hx2, hy, hz, yaw: -0, surface: 'wood' }).toColliderData()); };
  for (const side of [-1, 1]) root.add(block(0.26, 2.7, 0.36, 1, hx + side * 1.06, y + 1.35, front, 0, 0, WOOD));
  root.add(block(2.6, 0.3, 0.4, 1, hx, y + 2.85, front, 0, 0, WOOD));
  // the bench: a seat on two legs against the wall, left of the door
  const bx = hx - 2.05, bz = doorZ + 0.5, by = heightAt(bx, bz);
  root.add(block(1.5, 0.1, 0.42, 1, bx, by + 0.45, bz, 0, 0, WOOD), block(0.12, 0.4, 0.36, 1, bx - 0.6, by + 0.2, bz, 0, 0, WOOD_DARK), block(0.12, 0.4, 0.36, 1, bx + 0.6, by + 0.2, bz, 0, 0, WOOD_DARK));
  wood(bx, bz, 0.75, 0.25, 0.21, by);
  // two barrels right of the door: a ten-sided staved body with two iron hoops
  for (const [x, z, s] of [[hx + 2.2, doorZ + 0.52, 1], [hx + 2.82, doorZ + 0.42, 0.9]] as const) {
    const gy = heightAt(x, z), h = 0.82 * s, r = 0.3 * s;
    const body = new Mesh(foliageUv(new CylinderGeometry(r * 0.9, r * 0.9, h, 8), 1), foliageMaterial(WOOD)); body.position.set(x, gy + h / 2, z); root.add(body);
    for (const at of [0.22, 0.78]) { const hoop = new Mesh(foliageUv(new CylinderGeometry(r, r, 0.07, 8, 1, true), 1), foliageMaterial(IRON)); hoop.position.set(x, gy + h * at, z); root.add(hoop); }
    wood(x, z, r, h / 2, r, gy);
  }
}
/** M2: the room inside the hut (its own frame, door at z = +3, walls 0.3 m thick at ±3), the cleanroom's: a plank floor, a red
 *  rug, a table with a bowl and two stools, a shelf of jars on the back wall, stacked crates and a barrel; ivy up the front
 *  corners and hanging moss off the eaves. No colliders (the walk in and out stays as it was). */
function hutInterior(): Group {
  const root = new Group(), JARS = [0x6a8a5a, 0xb08a4a, 0x8a4a3a, 0x5a6a8a, 0xc0a070];
  const at = (mesh: Mesh, x: number, y: number, z: number): Mesh => { mesh.position.set(x, y, z); return mesh; };
  root.add(block(5.66, 0.06, 5.66, 1, 0, 0.04, 0, 0, 0, PLANK), block(1.9, 0.02, 1.25, 1, 0.1, 0.08, 0.7, 0.05, 0, CLOTH));
  root.add(block(1.3, 0.08, 0.75, 1, 0.8, 0.8, -0.5, 0, 0, WOOD));
  for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]] as const) root.add(block(0.08, 0.76, 0.08, 1, 0.8 + lx, 0.4, -0.5 + lz, 0, 0, WOOD_DARK));
  root.add(at(new Mesh(foliageUv(new CylinderGeometry(0.14, 0.09, 0.12, 8), 1), foliageMaterial(0x7a5634)), 0.55, 0.9, -0.45));
  for (const [x, z] of [[-0.35, -0.1], [1.95, -0.3]] as const) root.add(at(new Mesh(foliageUv(new CylinderGeometry(0.2, 0.18, 0.46, 8), 1), foliageMaterial(WOOD)), x, 0.27, z));
  for (const y of [0.95, 1.5]) root.add(block(1.9, 0.06, 0.34, 1, -1.1, y, -2.62, 0, 0, WOOD));
  for (const x of [-2.02, -0.18]) root.add(block(0.06, 1.62, 0.34, 1, x, 0.85, -2.62, 0, 0, WOOD_DARK));
  for (let i = 0; i < 9; i++) {
    const h = 0.16 + (jitter(i, 600) + 1) * 0.06, jar = new Mesh(foliageUv(new CylinderGeometry(0.07, 0.08, h, 8), 1), foliageMaterial(JARS[i % 5] ?? WOOD));
    root.add(at(jar, -1.85 + (i % 5) * 0.36 + jitter(i, 601) * 0.04, (i < 5 ? 0.98 : 1.53) + h / 2, -2.6));
  }
  for (const [x, y, z, s, yaw] of [[-2.35, 0, -1.6, 0.62, 0.2], [-2.38, 0, -0.85, 0.52, -0.25], [-2.3, 0.62, -1.5, 0.42, 0.4]] as const) root.add(block(s, s, s, 1, x, 0.06 + y + s / 2, z, yaw, 0, WOOD));
  root.add(at(new Mesh(foliageUv(new CylinderGeometry(0.33, 0.3, 0.8, 10), 1), foliageMaterial(WOOD)), 2.3, 0.46, -2.2));
  for (const y of [0.22, 0.7]) root.add(at(new Mesh(foliageUv(new CylinderGeometry(0.34, 0.34, 0.06, 10, 1, true), 1), foliageMaterial(IRON)), 2.3, y, -2.2));
  // outside: ivy up the two front corners and the right side, hanging moss off both eaves
  root.add(ivy(-3.12, 3.0, 3.12, 2.7, 0, 0.42, 71), ivy(3.12, 3.0, 3.12, 2.1, 0, 0.36, 72), ivy(3.18, 3.0, 1.4, 2.4, Math.PI / 2, 0.4, 73), ivy(-3.18, 3.0, -1.2, 1.8, Math.PI / 2, 0.36, 74));
  for (const side of [-1, 1]) root.add(drape(0, 3.08, side * 3.72, 6.4, 0, 0.42, 80 + side));
  return root;
}
/**
 * LF1-7 with LF1-2: the door lamp's glass, one whole shape at the lantern (L0 tile 0/4/3) in the GLB material
 * `mossgate.lamp`, which `props.materials` binds to an emissive look entry: one draw, no shadow.
 */
export function hutLamp(heightAt: (x: number, z: number) => number): { mesh: Mesh; transform: Matrix4 } {
  const x = LAMP_POST.x - 1.0, z = LAMP_POST.z, y = heightAt(LAMP_POST.x, LAMP_POST.z) + 2.0;
  // M2: and the hut room's hanging lamp over the table, in the same whole (one draw)
  const room = new BoxGeometry(0.3, 0.38, 0.3).translate(layout.HUT.x + 0.8 - x, heightAt(layout.HUT.x, layout.HUT.z) + 2.15 - y, layout.HUT.z - 0.5 - z);
  const geometry = mergeGeometries([new BoxGeometry(0.36, 0.48, 0.36), room]).toNonIndexed(); geometry.deleteAttribute('uv');
  // M4.10: warm glass, brightest low where the wick burns (the cleanroom's lamp glass gradient), dimmer under the lid
  const p = geometry.getAttribute('position'), colour = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = p.getY(i) > 0.1 ? 0.62 : 1; colour.set([k, k * (0.9 + 0.1 * k), k * (0.8 + 0.2 * k)], i * 3); }
  geometry.setAttribute('color', new Float32BufferAttribute(colour, 3));
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0xffffff, vertexColors: true })); mesh.castShadow = false;
  return { mesh, transform: new Matrix4().makeTranslation(x, y, z) };
}
/**
 * LF1-7 with LF1-2: brazier A's flame, a panel brazier A's field shows (data/targets.json, field 102): five faceted cones
 * (LF1-8: `which` 1 is brazier B's, field 103, in 0/4/4, paid for by the pond's raised stones casting no shadow)
 * in the bowl, in the GLB material `mossgate.flame` (emissive), with no shadow, so it costs L0 tile 0/3/3 one draw.
 */
export function brazierFlame(heightAt: (x: number, z: number) => number, which = 0): Group {
  const flame = new Group(), [x = 0, z = 0] = layout.BRAZIERS[which] ?? [];
  flameCones(flame, x, heightAt(x, z) + 1.5, z);
  // M2: brazier B's field also lights the row's B beacon at the back of the yard
  if (which === 1) { const [bx = 0, bz = 0] = layout.ROW[0] ?? []; flameCones(flame, bx, heightAt(bx, bz) + 1.5, bz); }
  return flame;
}
/**
 * M4.10 (the cleanroom's layered flame cards, MG textures.js and world.js:338): one flame tongue, a cone whose vertex
 * colours run from `base` at its foot to `tip`, fading to dark at its point. The flame look entry is additive and reads the
 * vertex colours, so a tongue fades out where it is dark and the tongues overlapping in the bowl add up to a hot core.
 */
const FLAME_OUTER: readonly [readonly [number, number, number], readonly [number, number, number]] = [[1, 0.42, 0.07], [0.22, 0.03, 0]];
const FLAME_INNER: readonly [readonly [number, number, number], readonly [number, number, number]] = [[1, 0.78, 0.32], [0.45, 0.13, 0.01]];
function tongue(r: number, h: number, [base, tip]: typeof FLAME_OUTER): Mesh {
  const geometry = foliageUv(new CylinderGeometry(0, r, h, 6, 1, true), 1), p = geometry.getAttribute('position'), colour = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / h + 0.5)), k = t * t;
    for (let c = 0; c < 3; c++) colour[i * 3 + c] = (base[c] ?? 0) * (1 - k) + (tip[c] ?? 0) * k;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colour, 3));
  return new Mesh(geometry, foliageMaterial(0xffffff));
}
/** Five outer tongues and three inner ones in a bowl whose rim is at y (M4.10: was five opaque faceted cones). */
function flameCones(flame: Group, x: number, y: number, z: number, s = 1): void {
  const outer: [number, number, number, number][] = [[0, 0, 0.42, 1.3], [0.24, 0.12, 0.24, 0.8], [-0.22, 0.16, 0.26, 0.9], [0.08, -0.25, 0.22, 0.75], [-0.14, -0.18, 0.2, 0.65]];
  const inner: [number, number, number, number][] = [[0.02, 0.01, 0.24, 0.95], [0.12, -0.08, 0.15, 0.6], [-0.1, 0.07, 0.15, 0.55]];
  for (const [layer, cones, seed] of [[FLAME_OUTER, outer, 110], [FLAME_INNER, inner, 112]] as const) cones.forEach(([dx, dz, r, h], i) => {
    const cone = tongue(r * s, h * s, layer); cone.position.set(x + dx * s, y + (h * s) / 2 - 0.05, z + dz * s); cone.rotation.set(jitter(i, seed + 1) * 0.12, jitter(i, seed) * 1.2, jitter(i, seed + 2) * 0.12); flame.add(cone);
  });
}

/** Round toy trees (TEMPLATES-CLEANROOM M2, the cleanroom's spots): x, z, size. A few in the yard's corners, the rest round its
 *  walls, the pond garden and the arena, framing the goldens' views. Off every walk the proofs take (see foliage test). */
export const TREES: readonly [number, number, number][] = [
  [-8.2, -16.6, 1.0], [0.8, -21, 1.15], [-12.5, -21, 1.2], [6.5, -20.5, 1.05], [11, -16.4, 0.95], [-13, -12, 1.1], [-7.8, 5.6, 0.9], [9.5, 5.5, 1.0],
  [-13.5, 8, 1.15], [-30, 9, 1.2], [-30, -8, 1.15], [-24.5, -10.5, 1.05], [-14.5, 11.5, 1.0], [16, -9.5, 1.0], [16, 6, 1.1], [36, -12, 1.2],
  [37, 8, 1.15], [24, 10, 1.1], [20, -15, 1.25], [3, 12, 1.2],
];
/** Grass tufts and ferns along the inside foot of the yard walls (clear of the gate and the arch gaps) and round the hut. */
const WALL_FOOT: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let z = YZ0 + 0.9, i = 0; z < YZ1 - 0.6; z += 1.6 + (jitter(i, 200) + 1) * 0.6, i++) {
    if (Math.abs(z - layout.MOSSGATE.z) > 3.2) out.push([YX0 + 0.85, z]);
    if (Math.abs(z - layout.ARENA.z) > 2.6) out.push([YX1 - 0.85, z + 0.4]);
  }
  for (let x = YX0 + 0.9, i = 0; x < YX1 - 0.6; x += 1.7 + (jitter(i, 201) + 1) * 0.6, i++) { out.push([x, YZ0 + 0.85]); out.push([x + 0.5, YZ1 - 0.85]); }
  return out;
})();
const HUT_FOOT: readonly [number, number][] = [[-3.4, 3.25], [3.4, 3.25], [-3.3, 1.6], [-3.3, -0.6], [-3.3, -2.3], [3.3, 1.4], [3.3, -0.5], [3.3, -2.5], [-1.4, -3.3], [1.3, -3.35]];
const TUFTS: readonly [number, number, number][] = [
  ...WALL_FOOT.filter((_, i) => i % 2 === 0).map(([x, z], i): [number, number, number] => [x, z, 0.9 + (jitter(i, 202) + 1) * 0.1]),
  ...HUT_FOOT.map(([x, z], i): [number, number, number] => [layout.HUT.x + x, layout.HUT.z + z, 0.9 + (jitter(i, 203) + 1) * 0.1]),
  [3.6, -1.6, 0.8], [-2.2, -5.6, 0.8], [5.8, -7.0, 0.9], [7.5, -1.2, 0.9], [-0.8, 3.2, 0.8], [4.2, 4.8, 0.9], [-5.5, 2.8, 0.9],
];
/** Ferns along the wall feet (the other half of `WALL_FOOT`) and at the hut's back corners. */
const WALL_FERNS: readonly [number, number, number][] = [
  ...WALL_FOOT.filter((_, i) => i % 2 === 1).map(([x, z], i): [number, number, number] => [x, z, 0.9 + (jitter(i, 204) + 1) * 0.12]),
  [layout.HUT.x + 3.5, layout.HUT.z - 2.9, 0.95], [layout.HUT.x - 3.55, layout.HUT.z - 2.8, 0.9],
];

/**
 * LF1-5: the yard's foliage, all in the measure stone's one static draw per tile (the props bake merges a tile's static
 * shapes into one primitive, so a tree, a tuft or a fern costs bytes, never a draw): eight round toy trees (a six-sided
 * trunk under an 80-face crown, a trunk collider each), grass tufts and fern clumps at the wall bases and around the arena
 * ring. The red mushroom caps are separate (`mushroomCaps`): an emissive surface is its own draw.
 */
export function mossgateFoliage(heightAt: (x: number, z: number) => number): { object: Group; colliders: Colliders } {
  const root = new Group(), colliders: Colliders = [], bark = foliageMaterial(0x6b4a2e), leaves = foliageMaterial(0x557a2c);
  TREES.forEach(([x, z, s], i) => {
    const y = heightAt(x, z), h = 2.3 * s, r = 1.3 * s;
    const trunk = new Mesh(foliageUv(new CylinderGeometry(0.17 * s, 0.26 * s, h + 0.3, 6, 1, true), 1), bark); trunk.position.set(x, y + h / 2 - 0.15, z);
    const crown = new Mesh(lumpyCrown(r * 1.12, i), leaves); crown.position.set(x, y + h + r * 0.8, z); crown.rotation.set(0, jitter(i, 101) * 3, 0);
    root.add(trunk, crown);
    colliders.push(BoxCollider.fromData({ kind: 'box', x, y: y + h / 2, z, hx: 0.24 * s, hy: h / 2, hz: 0.24 * s, yaw: -0, surface: 'wood' }).toColliderData());
  });
  TUFTS.forEach(([x, z, s], i) => { root.add(tuft(x, heightAt(x, z), z, s, i)); });
  WALL_FERNS.forEach(([x, z, s], i) => { root.add(fern(x, heightAt(x, z), z, s, 20 + i)); });
  // the arena ring's outer foot, on the yard's side of it: tufts and two ferns either side of the way in
  const { x: cx, z: cz, radius } = layout.ARENA, door = arenaDoor();
  [-0.62, -0.44, -0.3, 0.3, 0.46, 0.66, -0.95, 0.98].forEach((da, k) => {
    const x = cx + (radius + 0.75) * Math.sin(door + da), z = cz + (radius + 0.75) * Math.cos(door + da);
    root.add(k < 6 ? tuft(x, heightAt(x, z), z, 1, 40 + k) : fern(x, heightAt(x, z), z, 0.95, 30 + k));
  });
  return { object: root, colliders };
}
/**
 * LF1-5 with LF1-2: the red caps of the dressing's mushrooms in tile 0/4/3, as one whole shape at its first cap (one
 * draw, no shadow) in the `mossgate.mushroom-cap` GLB material, which `props.materials` binds to an emissive look entry.
 */
export function mushroomCaps(heightAt: (x: number, z: number) => number): { mesh: Mesh; transform: Matrix4 } {
  const out: number[] = [], normals: number[] = [];
  let origin: Vector3 | undefined;
  MUSHROOMS.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      const mx = x + jitter(i, 20 + k) * 0.28, mz = z + jitter(i, 30 + k) * 0.28, h = 0.16 + (k === 0 ? 0.12 : 0) + jitter(i, 40 + k) * 0.04, y = heightAt(mx, mz);
      origin ??= new Vector3(mx, y, mz);
      const cap = mushroomCap(0.12 - k * 0.02, foliageMaterial(0xffffff)); cap.position.set(mx - origin.x, y + h - origin.y, mz - origin.z); cap.updateMatrix();
      const g = cap.geometry.toNonIndexed().applyMatrix4(cap.matrix), p = g.getAttribute('position'), n = g.getAttribute('normal');
      for (let v = 0; v < p.count; v++) { out.push(p.getX(v), p.getY(v), p.getZ(v)); normals.push(n.getX(v), n.getY(v), n.getZ(v)); }
    }
  });
  if (origin === undefined) throw new Error('mushroomCaps: no cap');
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3)).setAttribute('normal', new Float32BufferAttribute(normals, 3))
    .setAttribute('color', new Float32BufferAttribute(new Float32Array(out.length).fill(1), 3));
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0xffffff, vertexColors: true })); mesh.castShadow = false;
  return { mesh, transform: new Matrix4().makeTranslation(origin.x, origin.y, origin.z) };
}

/**
 * The moss gate (MH-2, LF1-0's form) at `layout.MOSSGATE`: two chunky square stone pillars with moss caps, a lintel between
 * them and low wing walls running north and south, and across the 2.6 m gap a row of thick stone bars on a sill (the
 * panel, with its own collider) that brazier A's field takes away. Vines hang down the pillars' yard faces; they are their
 * own piece so the coarse (L1) tiles can skip them. You walk west through it.
 */
export function mossGate(heightAt: (x: number, z: number) => number): { frame: Group; panel: Group; vines: Group; frameColliders: NonNullable<TemplatePart['colliders']>; panelColliders: NonNullable<TemplatePart['colliders']> } {
  const { x, z } = layout.MOSSGATE, y = heightAt(x, z), frame = new Group(), panel = new Group(), vines = new Group(), frameColliders: NonNullable<TemplatePart['colliders']> = [];
  const box = (bx: number, by: number, bz: number, hx: number, hy: number, hz: number): NonNullable<TemplatePart['colliders']>[number] => BoxCollider.fromData({ kind: 'box', x: bx, y: by, z: bz, hx, hy, hz, yaw: -0, surface: 'stone' }).toColliderData();
  const GAP = GATE_GAP, P = GATE_PILLAR, H = 3.6;
  for (const side of [-1, 1]) {
    const pz = z + side * (GAP + P / 2);
    // M2: two tall stone pillars in four courses (the cleanroom's), a fat moss cushion on each; the yard's west wall meets them
    for (let r = 0; r < 4; r++) frame.add(block(P - r * 0.03, 0.88, P - r * 0.03, 1, x, y + r * 0.9 + 0.45, pz, jitter(r + side * 4, 94) * 0.04, 0, STONE));
    frame.add(block(P + 0.3, 0.5, P + 0.3, 2, x, y + H + 0.1, pz, jitter(side, 95) * 0.06), block(P + 0.12, 0.3, P + 0.12, 1, x, y + 0.15, pz));
    frameColliders.push(box(x, y + H / 2, pz, P / 2, H / 2, P / 2));
    // ivy up both faces and hanging moss off the cushion, the gate's own piece so the coarse tiles can skip it
    for (const face of [-1, 1]) {
      for (let k = 0; k < 3; k++) vines.add(ivy(x + face * (P / 2 + 0.03), y + H - 0.05, pz + (k - 1) * 0.42 + jitter(k, 90 + side) * 0.08, 1.3 + (jitter(k, 92 + side * face) + 1) * 0.7, Math.PI / 2, 0.36, k + side * 7 + face * 3));
      vines.add(drape(x + face * (P / 2 + 0.17), y + H - 0.12, pz, P + 0.3, Math.PI / 2, 0.5 + (jitter(side, 93 + face) + 1) * 0.15, side * 5 + face));
    }
  }
  frame.add(block(0.8, 0.4, GAP * 2, 1, x, y + H - 0.55, z), block(0.96, 0.16, GAP * 2, 2, x, y + H - 0.27, z));
  // LF1-8: four flagstones leading up to the sill from the yard (t1-06): flat quads, two triangles each (0/3/3 is near its bytes)
  for (let k = 0; k < 4; k++) {
    const fx = x + 1.25 + k * 1.05, fz = z + jitter(k, 96) * 0.22, w = 0.95 + jitter(k, 97) * 0.12, d = 1.15 + jitter(k, 98) * 0.15, slab = new Mesh(flagstone(w, d), foliageMaterial(STONE));
    slab.position.set(fx, Math.max(...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx = 0, sz = 0]) => heightAt(fx + sx * 0.75, fz + sz * 0.75))) + 0.03, fz);
    slab.rotation.y = jitter(k, 99) * 0.25; frame.add(slab); // over its highest corner (Codex review), so no edge sinks into the ground
  }
  // the panel: five thick stone bars on a sill, under the lintel
  panel.add(block(0.34, 0.2, GAP * 2, 1, x, y + 0.1, z));
  for (let k = 0; k < 6; k++) panel.add(block(0.26, 2.75, 0.26, 1, x, y + 0.2 + 2.75 / 2, z - GAP + 0.25 + k * ((GAP * 2 - 0.5) / 5)));
  return { frame, panel, vines, frameColliders, panelColliders: [box(x, y + 1.6, z, 0.2, 1.6, GAP)] };
}

/**
 * The moss bridge (MH-3): five stone pillars across the pond at `layout.POND` (radius 5, bed −3, water at 0), west to east.
 * `raised` stands their moss-capped tops 0.1 m over the water, with colliders, for brazier B's field to show; `sunk` is the
 * same pillars, a little thinner and 1.4 m under, with no collider, so before B the walk ends in the water.
 */
/** The raised bridge stones' top over the water, and the sunk slabs' wet stone. */
const STONE_TOP = 0.3, WET_STONE = 0x5a524a;
export function pondStones(): { raised: Group; sunk: Group; colliders: Colliders } {
  const { x: cx, z: cz } = layout.POND, raised = new Group(), sunk = new Group(), colliders: Colliders = [], BED = -3, w = 1.75;
  for (let i = 0; i < BRIDGE_STONES; i++) {
    const x = cx - BRIDGE_REACH + i * ((BRIDGE_REACH * 2) / (BRIDGE_STONES - 1)), z = cz + jitter(i, 80) * 0.12, yaw = jitter(i, 81) * 0.1;
    // M4.10: the sunk stones are the cleanroom's stepping slabs, a hand over the water (the mirror pond hides anything under
    // it); the raised bridge stands a step (under the motor's 0.35 m autostep) above them once brazier B burns
    for (const [root, top, s] of [[raised, STONE_TOP, w], [sunk, 0.05, w - 0.2]] as const) {
      const h = top - BED - 0.1;
      // the slabs read as wet dark stone, as the cleanroom's sunk blocks do (not the bridge's moss caps)
      const wet = root === sunk ? WET_STONE : undefined;
      root.add(block(s, h, s, 1, x, BED + h / 2, z, yaw, 0, wet), block(s + 0.1, 0.1, s + 0.1, wet === undefined ? 2 : 1, x, top - 0.05, z, yaw, 0, wet));
    }
    colliders.push(stoneBox(x, (STONE_TOP + BED) / 2, z, w / 2, (STONE_TOP - BED) / 2, w / 2, yaw));
  }
  return { raised, sunk, colliders };
}
/** LF1-8: the pond's planting colours (the look's `tint` keeps them: reeds and pads trim green, cattails and flowers structure). */
export const REED = 0x5f8a32, CATTAIL = 0x6b4226, LILY = 0x4c8a3a, LILY_FLOWER = 0xf2a6c2;
/** LF1-8: the crossing's line (the MH-3 bridge walk runs along z = POND.z) and the half width kept clear of plants and lip. */
export const CROSSING_CLEAR = 1.5;
/** LF1-8: reed clumps round the pond: angle (degrees from +x), metres past the edge (negative: in the shallows), size. Off
 *  the crossing line and B's pad. */
export const REEDS: readonly [number, number, number][] = [
  [28, 0.3, 1.05], [40, -0.4, 0.95], [52, -0.4, 0.9], [74, 0.4, 1.1], [101, 0.25, 0.95], [126, -0.3, 1.0], [140, 0.35, 1.05], [152, 0.4, 1.1],
  [205, 0.3, 1.0], [220, -0.35, 0.95], [228, -0.4, 0.9], [251, 0.45, 1.1], [283, 0.2, 0.95], [306, -0.35, 1.05], [320, 0.3, 1.0], [333, 0.35, 0.9],
];
/** LF1-8: lily pads on the water: x and z off the pond's centre, radius; `flower` marks the ones in bloom. */
export const LILIES: readonly [number, number, number, boolean][] = [
  [-3.4, 2.6, 0.42, true], [-1.6, 3.6, 0.34, false], [1.8, 2.9, 0.4, false], [3.8, 2.1, 0.3, true], [0.3, 4.2, 0.28, false], [-4.6, 3.6, 0.3, false],
  [-3.8, -2.3, 0.38, false], [-1.0, -3.5, 0.44, true], [2.3, -3.0, 0.32, false], [4.0, -2.0, 0.36, false], [-2.5, -4.0, 0.26, false], [4.7, -3.6, 0.3, true],
];
/** LF1-8: a flat, upward-facing w × d quad (a flagstone): two triangles, no grid. */
function flagstone(w: number, d: number): BufferGeometry {
  const a = w / 2, b = d / 2, geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-a, 0, -b, -a, 0, b, a, 0, b, -a, 0, -b, a, 0, b, a, 0, -b], 3));
  geometry.computeVertexNormals(); return foliageUv(geometry, 1);
}
/** A flat, upward-facing fan (a lily pad): `n` wedges round (0, 0, 0) with one wedge left out as the notch. */
function lilyPad(r: number, notch: number): BufferGeometry {
  const out: number[] = [], n = 9;
  for (let k = 1; k < n; k++) {
    const a = notch + (k / n) * Math.PI * 2, b = notch + ((k + 1) / n) * Math.PI * 2;
    out.push(0, 0, 0, Math.cos(b) * r, 0, Math.sin(b) * r, Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3)); geometry.computeVertexNormals();
  return foliageUv(geometry, 2);
}
/** A reed clump at (x, y, z): six tall three-sided blades leaning out, and two cattail heads on stalks, `s` its size. */
function reedClump(x: number, y: number, z: number, s: number, i: number): Group {
  const root = new Group(), blades: number[] = [];
  root.position.set(x, y, z);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + jitter(i, 120 + k) * 0.5, h = s * (1.05 + jitter(i, 126 + k) * 0.3), r = 0.035 * s, cx = Math.cos(a) * 0.09 * s, cz = Math.sin(a) * 0.09 * s;
    const base = [0, 1, 2].map(c => new Vector3(cx + Math.cos(a + (c * 2 * Math.PI) / 3) * r, 0, cz + Math.sin(a + (c * 2 * Math.PI) / 3) * r));
    const blade = tent([...base, new Vector3(cx + Math.cos(a) * h * 0.22, h, cz + Math.sin(a) * h * 0.22)], [[0, 1, 3], [1, 2, 3], [2, 0, 3]], new Vector3(cx, 0, cz), 2).getAttribute('position');
    for (let v = 0; v < blade.count; v++) blades.push(blade.getX(v), blade.getY(v), blade.getZ(v));
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(blades, 3)); geometry.computeVertexNormals();
  root.add(new Mesh(foliageUv(geometry, 2), foliageMaterial(REED)));
  for (let k = 0; k < 2; k++) {
    const dx = jitter(i, 140 + k) * 0.12, dz = jitter(i, 142 + k) * 0.12, h = s * (1.25 + k * 0.18);
    const stalk = new Mesh(foliageUv(new CylinderGeometry(0.012, 0.016, h, 3, 1, true), 2), foliageMaterial(REED)); stalk.position.set(dx, h / 2, dz);
    const head = new Mesh(foliageUv(new CylinderGeometry(0.035, 0.055, 0.26 * s, 4, 1, true), 1), foliageMaterial(CATTAIL)); head.position.set(dx, h + 0.1 * s, dz);
    root.add(stalk, head);
  }
  return root;
}
/**
 * LF1-8: the pond's planting and bank (t1-08 to t1-10): reed clumps round the rim and in the shallows, lily pads on the
 * water with three pink flowers, and a low moss-capped stone lip round the bank that hides the crater's slanted edge,
 * open where the crossing meets each bank. All in L0 tile 0/4/4's static draw (bytes, not draws: it is at 8). No
 * colliders: the bridge walk and the swim are unchanged.
 */
export function pondPlanting(heightAt: (x: number, z: number) => number): Group {
  const { x: cx, z: cz } = layout.POND, root = new Group(), WATER = 0;
  REEDS.forEach(([deg, out, s], i) => {
    const [x, z] = pondEdge((deg * Math.PI) / 180, out);
    // a clump in the shallows (inside the edge) stands up from just under the surface; one on the bank from the ground
    root.add(reedClump(x, out < 0 ? WATER - 0.35 : heightAt(x, z), z, s, i));
  });
  const flowers = foliageMaterial(LILY_FLOWER), pads = foliageMaterial(LILY);
  LILIES.forEach(([dx, dz, r, flower], i) => {
    const pad = new Mesh(lilyPad(r, jitter(i, 150) * Math.PI), pads); pad.name = 'lily-pad'; pad.position.set(cx + dx, WATER + 0.03, cz + dz); root.add(pad);
    if (!flower) return;
    const points = [0, 1, 2, 3, 4].map(k => new Vector3(Math.cos((k / 5) * Math.PI * 2) * 0.13, 0, Math.sin((k / 5) * Math.PI * 2) * 0.13));
    const bloom = new Mesh(tent([...points, new Vector3(0, 0.14, 0)], [[0, 1, 5], [1, 2, 5], [2, 3, 5], [3, 4, 5], [4, 0, 5]], new Vector3(0, 0.03, 0), 1), flowers);
    bloom.position.set(cx + dx + 0.08, WATER + 0.05, cz + dz - 0.05); root.add(bloom);
  });
  // M2: the kerb, the cleanroom's: a ring of low tumbled stone blocks along the water's edge, every fourth with a moss cap,
  // open where the crossing lands on each bank. No collider: the swim and the bridge walk are unchanged.
  for (let k = 0, at = 0; k < 140; k++) {
    const [ax, az] = pondEdge((k / 140) * Math.PI * 2, 0.05), [bx, bz] = pondEdge(((k + 1) / 140) * Math.PI * 2, 0.05);
    at += Math.hypot(bx - ax, bz - az);
    if (at < 0.85) continue;
    at = 0;
    if (Math.abs(az - cz) < CROSSING_CLEAR + 0.45) continue;
    const yaw = Math.atan2(-(bz - az), bx - ax) + jitter(k, 180) * 0.15, w = 0.82 + jitter(k, 181) * 0.12, d = 0.58 + jitter(k, 182) * 0.07;
    root.add(block(w, 0.36, d, 1, ax, WATER - 0.1 + jitter(k, 183) * 0.03, az, yaw, jitter(k, 184) * 0.05, STONE));
    if (k % 4 === 1) root.add(block(w * 0.7, 0.09, d * 0.75, 2, ax, WATER + 0.11, az, yaw + 0.2));
  }
  return root;
}

/**
 * The arena (MH-3): a low stone ring (M2: `ARENA_WALL`) at `layout.ARENA` round the boss's floor, twenty segments with the one facing the yard
 * left out as the way in. Two posts and a lintel frame it, and `gate` (bars, a panel with its own collider) shuts it
 * until brazier C's field takes it away. It sits north-west of spawn so the gate's panel lands in L0 tile 0/3/4, the
 * one tile there with two draws to spare.
 */
export function arenaRing(heightAt: (x: number, z: number) => number): { wall: Group; gate: Group; wallColliders: Colliders; gateColliders: Colliders } {
  const { x: cx, z: cz, radius: r } = layout.ARENA, wall = new Group(), gate = new Group(), wallColliders: Colliders = [], N = 20, H = ARENA_WALL;
  const door = arenaDoor(), len = 2 * r * Math.sin(Math.PI / N) + 0.2;
  for (let k = 1; k < N; k++) {
    const a = door + (k / N) * Math.PI * 2, x = cx + r * Math.sin(a), z = cz + r * Math.cos(a), y = heightAt(x, z) - 0.2;
    wall.add(block(len, H, 0.8, 1, x, y + H / 2, z, a), block(len + 0.12, 0.3, 1.0, 2, x, y + H + 0.12, z, a));
    wallColliders.push(stoneBox(x, y + H / 2, z, len / 2, H / 2, 0.35, a));
  }
  // the way in: posts at the gap's two ends, a lintel over it, and the bars between, all in the gap's own frame
  const half = r * Math.sin(Math.PI / N), inner = r * Math.cos(Math.PI / N), at = (along: number): [number, number] =>
    [cx + inner * Math.sin(door) + along * Math.cos(door), cz + inner * Math.cos(door) - along * Math.sin(door)];
  const [gx, gz] = at(0), gy = heightAt(gx, gz) - 0.2;
  // M2: the arch is taller than the low ring (the cleanroom's): four-course posts, a lintel with a moss cushion
  const GH = ARENA_GATE;
  for (const side of [-1, 1]) {
    const [px, pz] = at(side * half);
    for (let c = 0; c < 4; c++) wall.add(block(1.05 - c * 0.03, (GH + 0.6) / 4 - 0.02, 1.05 - c * 0.03, 1, px, gy + ((c + 0.5) * (GH + 0.6)) / 4, pz, door + jitter(c + side * 4, 96) * 0.04, 0, STONE));
    wall.add(block(1.15, 0.3, 1.15, 2, px, gy + GH + 0.72, pz, door));
    wallColliders.push(stoneBox(px, gy + (GH + 0.6) / 2, pz, 0.5, (GH + 0.6) / 2, 0.5, door));
  }
  wall.add(block(half * 2 + 1.0, 0.55, 0.9, 1, gx, gy + GH + 0.85, gz, door, 0, STONE), block(half * 2 + 1.2, 0.36, 1.1, 2, gx, gy + GH + 1.25, gz, door));
  for (let k = 0; k < 7; k++) { const [bx, bz] = at(-half + 0.45 + (k + 0.5) * (half * 2 - 0.9) / 7); gate.add(block(0.14, GH - 0.1, 0.14, 2, bx, gy + (GH - 0.1) / 2, bz, door)); }
  for (const y of [0.5, 1.5, GH - 0.4]) gate.add(block(half * 2 - 0.9, 0.12, 0.1, 2, gx, gy + y, gz, door));
  return { wall, gate, wallColliders, gateColliders: [stoneBox(gx, gy + GH / 2, gz, half - 0.45, GH / 2, 0.15, door)] };
}

/** LF1-9: the arena floor's slate (the checker's dark squares; the light ones are moss) and its cell, in metres. */
export const SLATE = 0x4f4d52, FLOOR_MOSS = 0x4e6a2a, ARENA_CELL = 1.5;
/** LF1-9: the three braziers on the arena rim, as angles round `layout.ARENA` from the way in (across from it and either side). */
export const RIM_BRAZIERS: readonly number[] = [Math.PI - 0.72, Math.PI, Math.PI + 0.72];
/** M2: the Warden's core gem floats this high over its feet (the Warden is 3 times the blob, was 2.2). */
export const WARDEN_CORE = 4.6;
/** LF1-9: the Warden's slam tell, a ring this far round `layout.BOSS` (MH-4's twelve anchors stood 3.5 m out). */
export const TELL_RADIUS = 3.5;
/** A rim brazier's centre, on the wall cap's top. */
function rimBrazier(heightAt: (x: number, z: number) => number, k: number): [number, number, number] {
  const { x: cx, z: cz, radius: r } = layout.ARENA, a = arenaDoor() + (RIM_BRAZIERS[k] ?? 0), x = cx + r * Math.sin(a), z = cz + r * Math.cos(a);
  return [x, heightAt(x, z) - 0.2 + ARENA_WALL + 0.27, z];
}
/**
 * LF1-9 (t1-12 to t1-15): the arena's floor and rim, in its tile's (0/3/4) one static draw. A checker of flat 1.5 m squares,
 * slate and moss, over the ground inside the ring (each square over its highest corner, no collider: the walk is the
 * ground's); a jagged moss drip under each wall segment's cap on the inner face; and three stone braziers on the rim across
 * from the way in, their flames a panel brazier C's field shows (`rimFlames`).
 */
function arenaDressing(root: Group, heightAt: (x: number, z: number) => number): void {
  const { x: cx, z: cz, radius: r } = layout.ARENA, door = arenaDoor(), N = 20, H = ARENA_WALL, slate = foliageMaterial(SLATE), moss = foliageMaterial(MOSS), floorMoss = foliageMaterial(FLOOR_MOSS);
  const reach = r - 1.0, n = Math.ceil(reach / ARENA_CELL), s = ARENA_CELL / 2 - 0.04;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const x = cx + i * ARENA_CELL, z = cz + j * ARENA_CELL;
    if (Math.hypot(Math.abs(i * ARENA_CELL) + ARENA_CELL / 2, Math.abs(j * ARENA_CELL) + ARENA_CELL / 2) > reach + 0.6) continue;
    const y = Math.max(...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a = 0, b = 0]) => heightAt(x + a * s, z + b * s))) + 0.03;
    const square = new Mesh(flagstone(s * 2, s * 2), (i + j) % 2 === 0 ? slate : floorMoss); square.position.set(x, y, z); root.add(square);
  }
  // the moss drip: under each segment's cap on the inner face, a strip whose lower edge hangs 0.2 to 0.9 m down
  for (let k = 1; k < N; k++) {
    // on the segment box's inner face (a chord `half` long each way, 0.35 m in from the ring), 2 cm proud of it
    const am = door + (k / N) * Math.PI * 2, ri = r - 0.52, half = r * Math.sin(Math.PI / N) + 0.05;
    const top = heightAt(cx + r * Math.sin(am), cz + r * Math.cos(am)) - 0.2 + H, at = (t: number, y: number): Vector3 => new Vector3(cx + ri * Math.sin(am) + t * Math.cos(am), y, cz + ri * Math.cos(am) - t * Math.sin(am));
    const points: Vector3[] = [], tris: [number, number, number][] = [];
    for (let c = 0; c <= 4; c++) { const t = -half + (half * 2 * c) / 4; points.push(at(t, top), at(t, top - 0.2 - (jitter(k, 160 + c) + 1) * 0.35)); }
    for (let c = 0; c < 4; c++) tris.push([c * 2, c * 2 + 2, c * 2 + 1], [c * 2 + 1, c * 2 + 2, c * 2 + 3]);
    root.add(new Mesh(tent(points, tris, new Vector3(cx + (r + 2) * Math.sin(am), top - 0.5, cz + (r + 2) * Math.cos(am)), 2), moss));
  }
  // the rim braziers: a plinth on the cap, a stem and a bowl, turned to the ring
  RIM_BRAZIERS.forEach((da, k) => {
    const [x, y, z] = rimBrazier(heightAt, k), yaw = door + da;
    root.add(block(0.8, 0.3, 0.8, 1, x, y + 0.15, z, yaw, 0, STONE), block(0.46, 0.4, 0.46, 1, x, y + 0.5, z, yaw, 0, STONE), block(1.0, 0.24, 1.0, 1, x, y + 0.82, z, yaw, 0, 0x6c6264));
  });
}
/** LF1-9: the rim braziers' flames, three faceted cones in each bowl, a panel brazier C's field (104) shows, in `mossgate.flame`. */
export function rimFlames(heightAt: (x: number, z: number) => number): Group {
  const flames = new Group();
  RIM_BRAZIERS.forEach((_, k) => {
    const [x, y, z] = rimBrazier(heightAt, k);
    flameCones(flames, x, y + 0.99, z, 0.8);
  });
  // M2: brazier C's field also lights the row's C beacon at the back of the yard; M4.10: and brazier C's own bowl
  const [bx = 0, bz = 0] = layout.ROW[1] ?? [], [cx = 0, cz = 0] = layout.BRAZIERS[2] ?? [];
  flameCones(flames, bx, heightAt(bx, bz) + 1.5, bz); flameCones(flames, cx, heightAt(cx, cz) + 1.5, cz);
  return flames;
}
/**
 * LF1-9: the Warden's slam tell, a glowing ring on the floor `TELL_RADIUS` round it (field 110 shows it), and its core, a
 * faceted gem over its crown where it stands (field 111; a panel is fixed, so when the Warden steps toward a player in a
 * window the gem stays over its spot). Panels in emissive materials with no shadow, one draw each in 0/3/4.
 */
export function wardenTell(heightAt: (x: number, z: number) => number): { ring: Group; core: Group } {
  const { x: bx, z: bz } = layout.BOSS, ring = new Group(), core = new Group(), points: Vector3[] = [], tris: [number, number, number][] = [], N = 48, W = 0.22;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    for (const rr of [TELL_RADIUS - W, TELL_RADIUS + W]) { const x = bx + Math.cos(a) * rr, z = bz + Math.sin(a) * rr; points.push(new Vector3(x, heightAt(x, z) + 0.09, z)); }
    const i = k * 2, j = ((k + 1) % N) * 2;
    tris.push([i, j, i + 1], [i + 1, j, j + 1]);
  }
  // `tent` winds each face away from a point under the ring, so every triangle faces up
  ring.add(new Mesh(tent(points, tris, new Vector3(bx, heightAt(bx, bz) - 5, bz), 1), foliageMaterial(0xffffff)));
  const gem = new Mesh(foliageUv(new IcosahedronGeometry(0.42, 0), 1), foliageMaterial(0xffffff)); gem.position.set(bx, heightAt(bx, bz) + WARDEN_CORE, bz); gem.scale.set(1.2, 1.8, 1.2); core.add(gem);
  return { ring, core };
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
