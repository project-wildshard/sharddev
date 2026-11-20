// MOSSGATE-ZONE MZ17 (J452): the Barrow Downs, the region east of the yard (layout.ts `downs`). The barrow ring, the Warden's
// arena (world.ts `arena`, its rim braziers and the Warden at its heart), moved out of the yard onto the Downs' level crown.
// Its approach: the roads meet 10 m west of its arch and walk in between paired standing stones. Grassy burial mounds with
// stone doorways stand round it, and on the far rise the Old Cairn, a great stack of stones with a capstone. The ring and the
// cairn are region triggers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { BARROW_APPROACH, PATHS, PLACES } from './layout';
import { roadDistance } from './ground';
import { groundHeight, LAYOUT } from './world';
import * as T from './textures';

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return { x: found.x, z: found.z };
};

/** The Downs' places: the ring (the arena's centre), its approach, the cairn, and the burial mounds round the ring. */
export const DOWNS = {
  RING: place('downs.barrow'),
  APPROACH: { x: BARROW_APPROACH[0], z: BARROW_APPROACH[1] },
  CAIRN: place('downs.cairn'),
  /** each mound: its centre, radius and height, and the way its doorway faces (a yaw, 0 = +z) */
  MOUNDS: [[182, 22, 7, 3.2, -2.2], [186, 66, 6, 2.8, -1.1], [128, 66, 6.5, 3, 1.6], [112, 48, 5, 2.4, 2.45]] as const,
} as const;

/** MZ21: the cairn's camp: five barrow crawlers awake round the Old Cairn's east foot, 11 m out, off the road that comes in
 *  from the west (creatures.ts places them; the Warden's own four stay asleep in its ring until its third phase). */
export const CAIRN_CAMP = { seats: [-0.9, -0.45, 0, 0.45, 0.9].map((a) => [place('downs.cairn').x + Math.cos(a) * 11, place('downs.cairn').z + Math.sin(a) * 11] as const) } as const;

export const DOWNS_FLAGS = { ring: 'mossgate.place.downs.barrow', cairn: 'mossgate.place.downs.cairn' } as const;

const stoneM = new THREE.MeshStandardMaterial({ name: 'downs-stone', color: '#8e8b80', roughness: 0.95 });
const paleM = new THREE.MeshStandardMaterial({ name: 'downs-stone-pale', color: '#a8a496', roughness: 0.9 });
const turfM = new THREE.MeshStandardMaterial({ name: 'downs-turf', color: '#6e7a3e', roughness: 1 });
const darkM = new THREE.MeshStandardMaterial({ name: 'downs-door', color: '#141210', roughness: 1 });

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };
const box = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.05, w / 4, h / 4, d / 4)), m); b.castShadow = true; b.receiveShadow = true; return b; };
/** An invisible collider box (half extents), turned by `yaw`. */
const block = (part: THREE.Group, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): void => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), stoneM)); m.position.set(x, y, z); m.rotation.y = yaw; m.visible = false; part.add(m);
};

/** The approach: pairs of standing stones, 4.2 m either side of the road, every 7 m along its last 40 m to the approach
 *  point, tallest nearest the ring. */
function approach(part: THREE.Group, rand: () => number): void {
  const road = PATHS.find((p) => p.from === 'hollow.yard' && p.to === 'downs.barrow')?.points ?? [];
  const i = road.findIndex(([x, z]) => x === BARROW_APPROACH[0] && z === BARROW_APPROACH[1]), prev = road[i - 1];
  if (prev === undefined) throw new Error('mossgate: the Downs road has no approach');
  const { x: ex, z: ez } = DOWNS.APPROACH, len = Math.hypot(ex - prev[0], ez - prev[1]), ux = (ex - prev[0]) / len, uz = (ez - prev[1]) / len;
  for (let k = 0; k < 6; k++) {
    const back = k * 7, h = 3.4 - k * 0.3;
    for (const side of [-1, 1]) {
      const x = ex - ux * back - uz * side * 4.2, z = ez - uz * back + ux * side * 4.2, gy = groundHeight(x, z), yaw = Math.atan2(ux, uz);
      const s = box(1, h, 0.65, k % 2 === 0 ? stoneM : paleM); s.position.set(x, gy + h / 2 - 0.25, z); s.rotation.set((rand() - 0.5) * 0.08, yaw + (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.08); part.add(s);
      block(part, x, gy + h / 2, z, 0.5, h / 2, 0.33, s.rotation.y);
    }
  }
  // the last 10 m, from the approach point to the arch, kerbed with low stones
  const ax = LAYOUT.ARCH.x;
  for (let x = ex + 1.5; x < ax - 1.2; x += 1.6) for (const side of [-1, 1]) {
    const z = ez + side * 2.4, kerb = box(1.2, 0.35, 0.45, paleM); kerb.position.set(x, groundHeight(x, z) + 0.1, z); kerb.rotation.y = (rand() - 0.5) * 0.15; part.add(kerb);
  }
}

/** A burial mound: a grassy dome, a doorway of two jambs and a lintel on its facing side, the door a dark slab. */
function mound(part: THREE.Group, x: number, z: number, r: number, h: number, facing: number): void {
  const gy = groundHeight(x, z), dome = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), turfM);
  dome.scale.set(r, h, r); dome.position.set(x, gy - 0.25, z); dome.castShadow = true; dome.receiveShadow = true; part.add(dome);
  block(part, x, gy + h * 0.35, z, r * 0.72, h * 0.35, r * 0.72);
  block(part, x, gy + h * 0.78, z, r * 0.45, h * 0.15, r * 0.45);
  const fx = Math.sin(facing), fz = Math.cos(facing), dx = x + fx * (r * 0.82), dz = z + fz * (r * 0.82), dy = groundHeight(dx, dz);
  const door = new THREE.Group(); door.position.set(dx, dy, dz); door.rotation.y = facing; part.add(door);
  for (const side of [-1, 1]) { const jamb = box(0.5, 1.9, 0.5, stoneM); jamb.position.set(side * 0.75, 0.9, 0); door.add(jamb); }
  const lintel = box(2.1, 0.45, 0.6, paleM); lintel.position.set(0, 2.05, 0); door.add(lintel);
  const slab = box(1, 1.7, 0.12, darkM); slab.position.set(0, 0.85, -0.1); door.add(slab);
  block(part, dx, dy + 1.1, dz, 1.05, 1.1, 0.3, facing);
}

/** The Old Cairn: a broad stack of stones in shrinking rings, a capstone on top, smaller cairns round its foot. */
function cairn(part: THREE.Group, rand: () => number): void {
  const { x, z } = DOWNS.CAIRN, gy = groundHeight(x, z);
  for (let ring = 0; ring < 6; ring++) {
    const rr = 3.4 - ring * 0.55, n = Math.max(1, Math.round(rr * 4)), y = gy + ring * 0.62;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4, s = 0.55 + rand() * 0.3, st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 3 === 0 ? paleM : stoneM);
      st.scale.y = 0.65; st.position.set(x + Math.cos(a) * rr, y + s * 0.4, z + Math.sin(a) * rr); st.rotation.set(rand() * 3, rand() * 3, rand() * 3); st.castShadow = true; part.add(st);
    }
  }
  const cap = box(1.8, 0.4, 1.3, paleM); cap.position.set(x, gy + 3.9, z); cap.rotation.set(0.06, 0.5, -0.04); part.add(cap);
  block(part, x, gy + 1.2, z, 2.6, 1.2, 2.6);
  block(part, x, gy + 3.1, z, 1.3, 0.9, 1.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, cx = x + Math.cos(a) * 7.5, cz = z + Math.sin(a) * 7.5;
    if (roadDistance(cx, cz) < 2.5) continue;
    let y = groundHeight(cx, cz);
    for (let k = 0; k < 3; k++) { const s = 0.4 - k * 0.09, st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneM); st.scale.y = 0.6; st.position.set(cx, y + s * 0.5, cz); part.add(st); y += s * 0.7; }
  }
}

/** The Barrow Downs: the ring's approach, the mounds and the Old Cairn, with a region trigger at the ring and the cairn. The
 *  ring itself (walls, arch, rim braziers) is world.ts's `arena`, the Warden creatures.ts's. */
export function buildDowns(world: ShardWorld): void {
  world.part('downs', (part) => {
    const rand = T.rng(1701);
    approach(part, rand);
    for (const [x, z, r, h, facing] of DOWNS.MOUNDS) mound(part, x, z, r, h, facing);
    cairn(part, rand);
    world.trigger(DOWNS_FLAGS.ring, node(part, DOWNS.RING.x, groundHeight(DOWNS.RING.x, DOWNS.RING.z), DOWNS.RING.z), { radius: 16 });
    world.trigger(DOWNS_FLAGS.cairn, node(part, DOWNS.CAIRN.x, groundHeight(DOWNS.CAIRN.x, DOWNS.CAIRN.z), DOWNS.CAIRN.z), { radius: 12 });
  });
}
