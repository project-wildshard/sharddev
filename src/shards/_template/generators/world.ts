import { BoxCollider } from '@wildshard/sharddev/physics';
import type { PropsBakeSource } from '@wildshard/sharddev/bake/props';
import { measureUv, type MeasureRole } from '@wildshard/sharddev/measure';
import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, Material, Matrix4, Mesh, MeshStandardMaterial, PointLight, Vector3, type Object3D } from 'three';
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
/**
 * LF1-7: the colours the look's `tint` keeps (look.json `materials.pbr.measure.tint`). Stone is a cool grey-violet, the
 * hut's blocks a warmer grey, moss its own green (so a trim cap stays moss under a trim tint), wood and iron for the hut's
 * posts, bench, barrels and lamp.
 */
export const STONE = 0x847a7d, HUT_STONE = 0x8d8479, MOSS = 0x5b7a30, MOSS_LIGHT = 0x76963c, WOOD = 0x86592f, WOOD_DARK = 0x5e3d22, IRON = 0x3a3634, CAP_RED = 0xb23a26, STEM = 0xd6cbb2;
/** LF1-7: the door lamp's post (the lantern hangs 1 m left of it, over the doorway's right edge, in L0 tile 0/4/3). */
export const LAMP_POST = { x: 1.55, z: -8.3 } as const;
/** a grey-box shape (role 1, structure: stone; role 2, trim: moss) */
const cube = (w: number, h: number, d: number, color?: number, role: MeasureRole = 1): Mesh => new Mesh(measureBox(w, h, d, role), new MeshStandardMaterial({ color: color ?? (role === 2 ? MOSS : STONE), flatShading: true }));
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
  const panel = cube(1.8, 2.5, 0.2, WOOD_DARK, 1); panel.position.set(layout.HUT.x, y + 1.2, layout.HUT.doorZ);
  ctx.root.add(panel); ctx.piece({ id: 'template.door', name: 'Open hut door', category: 'buildings', file, object: panel,
    colliders: [BoxCollider.fromData({ kind: 'box', x: layout.HUT.x, y: (y + 2.5 + y) / 2, z: layout.HUT.doorZ, hx: 0.9, hy: Math.max(0.005, (y + 2.5 - y) / 2), hz: 0.1, yaw: -0, surface: 'wood' }).toColliderData()], active: () => true });
  // Mossgate Hollow v3: braziers A, B and C on labelled pads where the story puts them (LF1-0): A by the moss gate, B on
  // the pond's far bank, C beside the arena gate. Unlit until their fields say so.
  const braziers = new Group(), stands: NonNullable<TemplatePart['colliders']> = [];
  for (const [x, z] of layout.BRAZIERS) {
    if (x === undefined || z === undefined) continue;
    const by = heightAt(x, z), pad = cube(3, 0.1, 3, 0x6f6866, 1), base = cube(1.1, 0.4, 1.1, STONE), stem = cube(0.6, 0.7, 0.6, STONE), bowl = cube(1.3, 0.3, 1.3, 0x6c6264, 1);
    pad.position.set(x, by + 0.05, z); base.position.set(x, by + 0.3, z); stem.position.set(x, by + 0.85, z); bowl.position.set(x, by + 1.35, z);
    braziers.add(pad, base, stem, bowl);
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
  const arena = arenaRing(heightAt);
  ctx.root.add(arena.wall); ctx.piece({ id: 'template.arena-wall', name: 'Arena wall', category: 'buildings', file, object: arena.wall, colliders: arena.wallColliders, surface: 'stone' });
  ctx.root.add(arena.gate); ctx.piece({ id: 'template.arena-gate', name: 'Arena gate', category: 'buildings', file, object: arena.gate, colliders: arena.gateColliders, active: () => true });
  const dressing = mossgateDressing(heightAt);
  ctx.root.add(dressing.object); ctx.piece({ id: 'template.dressing', name: 'Mossgate dressing', category: 'nature', file, object: dressing.object, colliders: dressing.colliders, surface: 'stone' });
  const foliage = mossgateFoliage(heightAt);
  ctx.root.add(foliage.object); ctx.piece({ id: 'template.foliage', name: 'Mossgate trees, tufts and ferns', category: 'nature', file, object: foliage.object, colliders: foliage.colliders, surface: 'wood' });
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
function block(w: number, h: number, d: number, role: MeasureRole, x: number, y: number, z: number, yaw = 0, tilt = 0, color?: number): Mesh {
  const mesh = cube(w, h, d, color, role); mesh.position.set(x, y, z); mesh.rotation.set(tilt, yaw, tilt * 0.6, 'YXZ'); return mesh;
}
type Colliders = NonNullable<TemplatePart['colliders']>;
/** A stone box collider at (x, y, z), half sizes `hx`, `hy`, `hz`, turned `yaw`. */
const stoneBox = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): Colliders[number] =>
  BoxCollider.fromData({ kind: 'box', x, y, z, hx, hy, hz, yaw: yaw === 0 ? -0 : yaw, surface: 'stone' }).toColliderData();
/** L0 tile 0/4/3 (x in [0, 62.5), z in [−62.5, 0)): the one yard tile with draws to spare for the red caps' emissive draw. */
export const redCap = (x: number, z: number): boolean => x >= 0.3 && x < 62 && z < -0.3 && z >= -62;
/** The dressing's mushroom positions, as `mossgateDressing` places them. */
const MUSHROOMS: [number, number][] = [[-1.1, -4.6], [0.9, -6.6], [-3.6, -6.9], [4.4, -3.2], [-5.0, -3.6], [2.2, -8.6], [-1.9, -7.4]];
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
  const { x: lx, z: lz } = LAMP_POST, ly = heightAt(lx, lz);
  root.add(block(0.18, 2.6, 0.18, 1, lx, ly + 1.3, lz, 0, 0, IRON), block(1.2, 0.1, 0.1, 1, lx - 0.5, ly + 2.5, lz, 0, 0, IRON), block(0.06, 0.2, 0.06, 1, lx - 1.0, ly + 2.36, lz, 0, 0, IRON));
  // LF1-7: the lantern's iron frame (lid, base, four corner bars) round the glass (`hutLamp`, emissive)
  root.add(block(0.5, 0.1, 0.5, 1, lx - 1.0, ly + 2.29, lz, 0, 0, IRON), block(0.46, 0.08, 0.46, 1, lx - 1.0, ly + 1.72, lz, 0, 0, IRON), block(0.46, 0.24, 0.46, 1, lx, ly + 0.12, lz));
  for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) root.add(block(0.05, 0.5, 0.05, 1, lx - 1.0 + cx * 0.2, ly + 2.0, lz + cz * 0.2, 0, 0, IRON));
  box(lx, ly + 1.25, lz, 0.12, 1.25, 0.12);
  hutFront(root, colliders, heightAt);
  // mossy boulders: two or three tumbled stones and a moss cap each. LF1-7 checks: the small one moved from (-2.6, 2.6),
  // which sat on the spawn-to-arena walk, to between the arena and brazier C walks (foliage.test.ts keeps them clear)
  const boulders: [number, number, number][] = [[-4.4, -6.2, 1.3], [-5.2, 1.9, 1.0], [5.2, -2.6, 1.15], [-6.8, -10.4, 1.6], [13.2, -7.4, 1.4], [-1.0, 4.0, 0.8]];
  boulders.forEach(([x, z, s], i) => {
    const y = heightAt(x, z);
    root.add(block(s, s * 0.7, s * 0.9, 1, x, y + s * 0.3, z, jitter(i, 5) * 1.5, jitter(i, 6) * 0.18));
    root.add(block(s * 0.62, s * 0.5, s * 0.6, 1, x + s * 0.45, y + s * 0.2, z + s * 0.28, jitter(i, 7) * 1.5, jitter(i, 8) * 0.25));
    if (s > 1.1) root.add(block(s * 0.45, s * 0.38, s * 0.5, 1, x - s * 0.5, y + s * 0.14, z - s * 0.2, jitter(i, 9) * 1.5, 0.2));
    root.add(block(s * 0.8, 0.1, s * 0.7, 2, x, y + s * 0.67, z, jitter(i, 5) * 1.5, jitter(i, 6) * 0.18));
    box(x, y + s * 0.35, z, s * 0.55, s * 0.35, s * 0.5);
  });
  // ferns: seven moss fronds fanned up and out from one root (LF1-5: tent fronds, half a box frond's bytes)
  const ferns: [number, number, number][] = [[-3.45, -8.1, 1], [3.5, -8.1, 1], [-3.5, -5.2, 0.9], [1.7, -3.3, 0.8], [-1.6, -2.0, 0.75], [6.0, -4.4, 0.9], [-5.3, -8.4, 1.1], [-4.4, -0.6, 0.85], [8.3, -8.6, 1], [-3.2, -9.6, 0.8]];
  ferns.forEach(([x, z, s], i) => { root.add(fern(x, heightAt(x, z), z, s, i)); });
  // mushroom clumps: pale stems under domed caps, by the path and the boulders. LF1-5: a cap in L0 tile 0/4/3 (x ≥ 0, z < 0)
  // is red (`mushroomCaps`, its own emissive draw); 0/3/3 is at its 8 draws, so a cap there stays a stone box (its bytes
  // are near the 300 000-byte L0 cap too)
  MUSHROOMS.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      const mx = x + jitter(i, 20 + k) * 0.28, mz = z + jitter(i, 30 + k) * 0.28, h = 0.16 + (k === 0 ? 0.12 : 0) + jitter(i, 40 + k) * 0.04, y = heightAt(mx, mz);
      root.add(block(0.06, h, 0.06, 1, mx, y + h / 2, mz, 0, 0, STEM));
      if (!redCap(mx, mz)) root.add(block(0.24 - k * 0.04, 0.07, 0.24 - k * 0.04, 1, mx, y + h + 0.03, mz, jitter(i, 50 + k), jitter(i, 60 + k) * 0.2, CAP_RED));
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
/**
 * LF1-7 with LF1-2: the door lamp's glass, one whole shape at the lantern (L0 tile 0/4/3) in the GLB material
 * `mossgate.lamp`, which `props.materials` binds to an emissive look entry: one draw, no shadow.
 */
export function hutLamp(heightAt: (x: number, z: number) => number): { mesh: Mesh; transform: Matrix4 } {
  const x = LAMP_POST.x - 1.0, z = LAMP_POST.z, y = heightAt(LAMP_POST.x, LAMP_POST.z) + 2.0;
  const geometry = new BoxGeometry(0.36, 0.48, 0.36).toNonIndexed(); geometry.deleteAttribute('uv');
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0xffffff, vertexColors: true })); mesh.castShadow = false;
  return { mesh, transform: new Matrix4().makeTranslation(x, y, z) };
}
/**
 * LF1-7 with LF1-2: brazier A's flame, a panel brazier A's field shows (data/targets.json, field 102): five faceted cones
 * in the bowl, in the GLB material `mossgate.flame` (emissive), with no shadow, so it costs L0 tile 0/3/3 one draw.
 */
export function brazierFlame(heightAt: (x: number, z: number) => number): Group {
  const [x = 0, z = 0] = layout.BRAZIERS[0] ?? [], y = heightAt(x, z) + 1.5, flame = new Group();
  const cones: [number, number, number, number][] = [[0, 0, 0.42, 1.3], [0.24, 0.12, 0.24, 0.8], [-0.22, 0.16, 0.26, 0.9], [0.08, -0.25, 0.22, 0.75], [-0.14, -0.18, 0.2, 0.65]];
  cones.forEach(([dx, dz, r, h], i) => {
    const cone = new Mesh(foliageUv(new CylinderGeometry(0, r, h, 5), 1), foliageMaterial(0xffffff)); cone.position.set(x + dx, y + h / 2, z + dz); cone.rotation.y = jitter(i, 110) * 1.2; flame.add(cone);
  });
  return flame;
}

/** Round toy trees in the yard (LF1-5): x, z, size. Off every walk the MH-2, MH-3 and LF1-0 proofs take (see foliage test). */
export const TREES: readonly [number, number, number][] = [[-6.0, -13.5, 1.1], [-9.0, -16.5, 0.95], [5.3, -13.6, 1.1], [9.5, -2.5, 0.9], [15.5, -5.0, 1.0], [2.5, 7.5, 1.0], [12.5, 3.0, 1.05], [-12.5, 3.5, 0.9]];
/** Grass tufts at the wall bases (the hut, the moss gate's wings and pillars, the arena ring) and a few in the open yard. */
const TUFTS: readonly [number, number, number][] = [
  [-3.6, -8.75, 1], [3.65, -8.7, 0.9], [-3.35, -10.2, 1.1], [-3.35, -12.6, 0.9], [-3.35, -14.3, 1], [3.35, -10.4, 1], [3.35, -12.2, 1.1], [3.35, -14.5, 0.9], [-1.4, -15.35, 1], [1.3, -15.35, 0.9],
  [-8.6, -10.4, 1], [-8.6, -8.2, 0.9], [-8.4, -6.65, 1.1], [-8.4, -3.35, 1], [-8.6, -2.2, 0.9], [-8.6, 0.6, 1],
  [3.6, -1.6, 0.8], [-2.2, -5.6, 0.8], [5.8, -7.0, 0.9], [-5.6, -11.8, 1], [7.5, -1.2, 0.9], [11.2, -4.6, 0.8], [-0.8, 3.2, 0.8], [4.2, 4.8, 0.9],
];
/** New ferns at the wall bases (the dressing's ten stay where they were): the hut's back corners, the gate wings, the arena. */
const WALL_FERNS: readonly [number, number, number][] = [[3.5, -14.9, 0.95], [-3.55, -14.8, 0.9], [-8.5, -9.4, 1], [-8.5, 0.1, 0.9]];

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
    const crown = new Mesh(foliageUv(new IcosahedronGeometry(r, 1), 2), leaves); crown.position.set(x, y + h + r * 0.75, z); crown.rotation.set(jitter(i, 100) * 0.4, jitter(i, 101) * 3, 0);
    root.add(trunk, crown);
    colliders.push(BoxCollider.fromData({ kind: 'box', x, y: y + h / 2, z, hx: 0.24 * s, hy: h / 2, hz: 0.24 * s, yaw: -0, surface: 'wood' }).toColliderData());
  });
  TUFTS.forEach(([x, z, s], i) => { root.add(tuft(x, heightAt(x, z), z, s, i)); });
  WALL_FERNS.forEach(([x, z, s], i) => { root.add(fern(x, heightAt(x, z), z, s, 20 + i)); });
  // the arena ring's outer foot, on the yard's side of it: tufts and two ferns either side of the way in
  const { x: cx, z: cz, radius } = layout.ARENA, door = Math.atan2(-cx, -cz);
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
      if (!redCap(mx, mz)) continue;
      origin ??= new Vector3(mx, y, mz);
      const cap = mushroomCap(0.12 - k * 0.02, foliageMaterial(0xffffff)); cap.position.set(mx - origin.x, y + h - origin.y, mz - origin.z); cap.updateMatrix();
      const g = cap.geometry.toNonIndexed().applyMatrix4(cap.matrix), p = g.getAttribute('position'), n = g.getAttribute('normal');
      for (let v = 0; v < p.count; v++) { out.push(p.getX(v), p.getY(v), p.getZ(v)); normals.push(n.getX(v), n.getY(v), n.getZ(v)); }
    }
  });
  if (origin === undefined) throw new Error('mushroomCaps: no cap in tile 0/4/3');
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
  const GAP = 1.3, P = 1.1, H = 3.2;
  for (const side of [-1, 1]) {
    const pz = z + side * (GAP + P / 2);
    frame.add(block(P, H, P, 1, x, y + H / 2, pz), block(P + 0.16, 0.2, P + 0.16, 2, x, y + H + 0.1, pz), block(P + 0.12, 0.3, P + 0.12, 1, x, y + 0.15, pz));
    frameColliders.push(box(x, y + H / 2, pz, P / 2, H / 2, P / 2));
    const wz = z + side * 4.1;
    frame.add(block(0.6, 1.5, 4.4, 1, x, y + 0.75, wz), block(0.7, 0.1, 4.5, 2, x, y + 1.55, wz));
    frameColliders.push(box(x, y + 0.75, wz, 0.3, 0.75, 2.2));
    // three vines down the pillar's yard (east) face, each a moss strand with two leaf tufts
    for (let k = 0; k < 3; k++) {
      const vz = pz + (k - 1) * 0.34 + jitter(k, 90 + side) * 0.06, len = 1.1 + (jitter(k, 92 + side) + 1) * 0.55, vx = x + P / 2 + 0.03;
      vines.add(block(0.05, len, 0.09, 2, vx, y + H - len / 2, vz));
      for (let t = 0; t < 2; t++) vines.add(block(0.08, 0.16, 0.2, 2, vx + 0.02, y + H - len * (0.35 + t * 0.45), vz + (t === 0 ? 0.07 : -0.07), 0, 0.3));
    }
  }
  frame.add(block(0.8, 0.4, GAP * 2, 1, x, y + 2.85, z), block(0.86, 0.08, GAP * 2, 2, x, y + 3.09, z));
  // the panel: five thick stone bars on a sill, under the lintel
  panel.add(block(0.34, 0.2, GAP * 2, 1, x, y + 0.1, z));
  for (let k = 0; k < 5; k++) panel.add(block(0.26, 2.45, 0.26, 1, x, y + 0.2 + 2.45 / 2, z - 1.04 + k * 0.52));
  return { frame, panel, vines, frameColliders, panelColliders: [box(x, y + 1.6, z, 0.2, 1.6, GAP)] };
}

/**
 * The moss bridge (MH-3): five stone pillars across the pond at `layout.POND` (radius 5, bed −3, water at 0), west to east.
 * `raised` stands their moss-capped tops 0.1 m over the water, with colliders, for brazier B's field to show; `sunk` is the
 * same pillars, a little thinner and 1.4 m under, with no collider, so before B the walk ends in the water.
 */
export function pondStones(): { raised: Group; sunk: Group; colliders: Colliders } {
  const { x: cx, z: cz } = layout.POND, raised = new Group(), sunk = new Group(), colliders: Colliders = [], BED = -3, w = 1.75;
  for (let i = 0; i < 5; i++) {
    const x = cx - 4.1 + i * 2.05, z = cz + jitter(i, 80) * 0.12, yaw = jitter(i, 81) * 0.1;
    for (const [root, top, s] of [[raised, 0.1, w], [sunk, -1.4, w - 0.2]] as const) {
      const h = top - BED - 0.1;
      root.add(block(s, h, s, 1, x, BED + h / 2, z, yaw), block(s + 0.1, 0.1, s + 0.1, 2, x, top - 0.05, z, yaw));
    }
    colliders.push(stoneBox(x, (0.1 + BED) / 2, z, w / 2, (0.1 - BED) / 2, w / 2, yaw));
  }
  return { raised, sunk, colliders };
}
/**
 * The arena (MH-3): a 3.2 m stone ring at `layout.ARENA` round the boss's floor, twenty segments with the one facing spawn
 * left out as the way in. Two posts and a lintel frame it, and `gate` (bars, a panel with its own collider) shuts it
 * until brazier C's field takes it away. It sits north-west of spawn so the gate's panel lands in L0 tile 0/3/4, the
 * one tile there with two draws to spare.
 */
export function arenaRing(heightAt: (x: number, z: number) => number): { wall: Group; gate: Group; wallColliders: Colliders; gateColliders: Colliders } {
  const { x: cx, z: cz, radius: r } = layout.ARENA, wall = new Group(), gate = new Group(), wallColliders: Colliders = [], N = 20, H = 3.2;
  const door = Math.atan2(-cx, -cz), len = 2 * r * Math.sin(Math.PI / N) + 0.2;
  for (let k = 1; k < N; k++) {
    const a = door + (k / N) * Math.PI * 2, x = cx + r * Math.sin(a), z = cz + r * Math.cos(a), y = heightAt(x, z) - 0.2;
    wall.add(block(len, H, 0.7, 1, x, y + H / 2, z, a), block(len + 0.05, 0.14, 0.86, 2, x, y + H + 0.07, z, a));
    wallColliders.push(stoneBox(x, y + H / 2, z, len / 2, H / 2, 0.35, a));
  }
  // the way in: posts at the gap's two ends, a lintel over it, and the bars between, all in the gap's own frame
  const half = r * Math.sin(Math.PI / N), inner = r * Math.cos(Math.PI / N), at = (along: number): [number, number] =>
    [cx + inner * Math.sin(door) + along * Math.cos(door), cz + inner * Math.cos(door) - along * Math.sin(door)];
  const [gx, gz] = at(0), gy = heightAt(gx, gz) - 0.2;
  for (const side of [-1, 1]) {
    const [px, pz] = at(side * half);
    wall.add(block(0.9, H + 0.8, 0.9, 1, px, gy + (H + 0.8) / 2, pz, door), block(1.0, 0.14, 1.0, 2, px, gy + H + 0.87, pz, door));
    wallColliders.push(stoneBox(px, gy + (H + 0.8) / 2, pz, 0.45, (H + 0.8) / 2, 0.45, door));
  }
  wall.add(block(half * 2 + 0.9, 0.5, 0.8, 1, gx, gy + H + 0.55, gz, door));
  for (let k = 0; k < 7; k++) { const [bx, bz] = at(-half + 0.45 + (k + 0.5) * (half * 2 - 0.9) / 7); gate.add(block(0.14, H - 0.1, 0.14, 2, bx, gy + (H - 0.1) / 2, bz, door)); }
  for (const y of [0.5, 1.7, 2.8]) gate.add(block(half * 2 - 0.9, 0.12, 0.1, 2, gx, gy + y, gz, door));
  return { wall, gate, wallColliders, gateColliders: [stoneBox(gx, gy + H / 2, gz, half - 0.45, H / 2, 0.15, door)] };
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
