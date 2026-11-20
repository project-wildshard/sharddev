// MOSSGATE-ZONE MZ15 (J452): the Old Quarry, the region south of the yard (layout.ts `quarry`). A dug pit with a rim
// (ground.ts), and on its floor Gritmaw, a quarry golem and the Hollow's second elite, with its own decision script
// (`behaviour/gritmaw.as`): each beat it raises a ring of grit round its feet (its tell), then strikes. On the west floor
// the blobs' camp: spoil heaps, a torn tarp, crates and a dead fire, with four grey blobs round it. Across the haul path to
// the pit runs the Spoil Cut (ground.ts `CUT`), crossed on a timber bridge with rails. Each place is a region trigger.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { CUT } from './ground';
import { PATHS, PLACES } from './layout';
import { groundHeight } from './world';
import * as T from './textures';

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return { x: found.x, z: found.z };
};
const PIT = place('quarry.pit');

/** Where the haul path to the pit crosses the Spoil Cut's line, and the path's heading there (unit x, z). */
function crossing(): { x: number; z: number; dx: number; dz: number } {
  const path = PATHS.find((p) => p.to === 'quarry.pit');
  if (path === undefined) throw new Error('mossgate: no path to the quarry');
  const [ax, az] = CUT.a, [bx, bz] = CUT.b;
  for (let i = 1; i < path.points.length; i++) {
    const [px, pz] = path.points[i - 1] ?? [0, 0], [qx, qz] = path.points[i] ?? [0, 0];
    const rx = qx - px, rz = qz - pz, sx = bx - ax, sz = bz - az, den = rx * sz - rz * sx;
    if (den === 0) continue;
    const t = ((ax - px) * sz - (az - pz) * sx) / den, u = ((ax - px) * rz - (az - pz) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { const len = Math.hypot(rx, rz); return { x: px + rx * t, z: pz + rz * t, dx: rx / len, dz: rz / len }; }
  }
  throw new Error('mossgate: the haul path never crosses the Spoil Cut');
}
const CROSS = crossing();
/** Half the bridge's span along the path: the cut's floor and walls, and 2 m of bank each side. */
const SPAN = CUT.floor + CUT.wall + 2;
const end = (s: number): { x: number; z: number; y: number } => {
  const x = CROSS.x + CROSS.dx * s * SPAN, z = CROSS.z + CROSS.dz * s * SPAN;
  return { x, z, y: groundHeight(x, z) + 0.12 };
};

/** The quarry's places: the pit's floor (Gritmaw's), the blobs' camp, and the bridge over the Spoil Cut. */
export const QUARRY = {
  PIT,
  GRITMAW: { x: PIT.x, z: PIT.z, r: 14 },
  CAMP: { x: -35, z: 192 },
  BRIDGE: { ...CROSS, north: end(-1), south: end(1), width: 3.2 },
} as const;
/** The camp's four grey blobs, round its dead fire. */
export const QUARRY_BLOBS = [[-31, 188], [-39, 189], [-33, 197], [-38, 196]] as const;

/** MZ19: the Quarrymaster, the Hollow's third talker, on the haul path's east side past the bridge, looking over the
 *  path toward the pit where Gritmaw took her crew's work; her lean-to and tool crates behind her. */
export const QUARRYMASTER = { x: 35, z: 164, yaw: -Math.PI / 2 } as const;
export const QUARRYMASTER_TALK = { id: 'mossgate.quarrymaster.talk', dialogue: 'mossgate.quarrymaster' } as const;

export const QUARRY_FLAGS = {
  pit: 'mossgate.place.quarry.pit',
  camp: 'mossgate.quarry.camp',
  bridge: 'mossgate.quarry.bridge',
} as const;

const timberM = new THREE.MeshStandardMaterial({ name: 'quarry-timber', color: '#6b5236', roughness: 0.9 });
const darkTimberM = new THREE.MeshStandardMaterial({ name: 'quarry-timber-dark', color: '#4a3826', roughness: 0.95 });
const rockM = new THREE.MeshStandardMaterial({ name: 'quarry-rock', color: '#a8957a', roughness: 0.95 });
const spoilM = new THREE.MeshStandardMaterial({ name: 'quarry-spoil', color: '#8d7a62', roughness: 1 });
const tarpM = new THREE.MeshStandardMaterial({ name: 'quarry-tarp', color: '#7d6c4c', roughness: 0.9, side: THREE.DoubleSide });
const ashM = new THREE.MeshStandardMaterial({ name: 'quarry-ash', color: '#3b3632', roughness: 1 });

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };
const box = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, w / 4, h / 4, d / 4)), m); b.castShadow = true; b.receiveShadow = true; return b; };
/** An invisible collider box, `hx` / `hy` / `hz` half extents, turned by `yaw` (a collider keeps a yaw; any tilt would
 *  become its world bounding box, so a sloped deck is a run of level steps). */
const block = (part: THREE.Group, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): void => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), rockM)); m.position.set(x, y, z); m.rotation.y = yaw; m.visible = false; part.add(m);
};
/** How many level steps the deck's collider takes from bank to bank. */
const STEPS = 12;

/** The bridge over the Spoil Cut: a plank deck from bank to bank along the haul path, posts and rails each side, stone
 *  footings at the ends. Its deck and rails are solid: a walker crosses on the deck and cannot step off its sides. The deck
 *  is drawn as one sloped run; its collider is twelve level steps under it (each under a fifth of a metre). */
function bridge(part: THREE.Group, rand: () => number): void {
  const { north: n, south: s, width } = QUARRY.BRIDGE;
  const len = Math.hypot(s.x - n.x, s.z - n.z), yaw = Math.atan2(s.x - n.x, s.z - n.z), pitch = Math.atan2(s.y - n.y, len);
  const mid = { x: (n.x + s.x) / 2, y: (n.y + s.y) / 2, z: (n.z + s.z) / 2 };
  const deck = new THREE.Group(); deck.position.set(mid.x, mid.y, mid.z); deck.rotation.set(-pitch, yaw, 0, 'YXZ'); part.add(deck);
  // planks across the span, each a little uneven
  for (let d = -len / 2 + 0.2; d < len / 2; d += 0.42) {
    const plank = box(width + (rand() - 0.5) * 0.2, 0.12, 0.36, rand() < 0.2 ? darkTimberM : timberM); plank.position.set((rand() - 0.5) * 0.08, -0.06, d); plank.rotation.y = (rand() - 0.5) * 0.04; deck.add(plank);
  }
  for (const side of [-1, 1]) {
    const stringer = box(0.28, 0.4, len + 0.6, darkTimberM); stringer.position.set(side * (width / 2 - 0.2), -0.32, 0); deck.add(stringer);
    for (let d = -len / 2; d <= len / 2 + 0.01; d += len / 4) {
      const post = box(0.18, 1.15, 0.18, darkTimberM); post.position.set(side * (width / 2 + 0.05), 0.5, d); deck.add(post);
    }
    const rail = box(0.12, 0.12, len, timberM); rail.position.set(side * (width / 2 + 0.05), 1.0, 0); deck.add(rail);
  }
  // the deck's collider: level steps along the span, each topped at the sloped deck's height over its middle, a rail each side
  const piece = len / STEPS, ax = Math.sin(yaw), az = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
  for (let k = 0; k < STEPS; k++) {
    const along = -len / 2 + piece * (k + 0.5), top = mid.y + Math.tan(pitch) * along, cx = mid.x + ax * along, cz = mid.z + az * along;
    // the end steps reach 0.3 m past the deck, onto the bank
    const shift = k === 0 ? -0.15 : k === STEPS - 1 ? 0.15 : 0, reach = shift === 0 ? 0 : 0.15;
    block(part, cx + ax * shift, top - 0.2, cz + az * shift, width / 2, 0.2, piece / 2 + reach, yaw);
    for (const side of [-1, 1]) block(part, cx + sx * side * (width / 2 + 0.05), top + 0.6, cz + sz * side * (width / 2 + 0.05), 0.1, 0.6, piece / 2, yaw);
  }
  // stone footings under each end, down into the bank
  for (const e of [n, s]) {
    const footing = box(width + 0.8, 1.6, 1.2, rockM); footing.position.set(e.x, e.y - 0.95, e.z); footing.rotation.y = yaw; part.add(footing);
  }
}

/** The blobs' camp on the quarry's west floor: spoil heaps, a tarp on poles, crates and a dead fire ringed with stones. */
function camp(part: THREE.Group, rand: () => number): void {
  const { x, z } = QUARRY.CAMP, gy = (px: number, pz: number): number => groundHeight(px, pz);
  for (const [dx, dz, r, h] of [[-9, -6, 4.5, 2.6], [8, -8, 3.6, 2], [-6, 8, 3.2, 1.6], [10, 7, 4, 2.3]] as const) {
    const heap = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), spoilM); heap.position.set(x + dx, gy(x + dx, z + dz) + h / 2 - 0.2, z + dz); heap.rotation.y = rand() * 6; heap.castShadow = true; heap.receiveShadow = true; part.add(heap);
  }
  // the tarp: two poles and a sheet slung from them
  const tx = x + 3, tz = z - 3, ty = gy(tx, tz);
  for (const dx of [-1.6, 1.6]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 6), darkTimberM); pole.position.set(tx + dx, ty + 1.1, tz); part.add(pole); }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6, 4, 3), tarpM); sheet.position.set(tx, ty + 1.45, tz + 1.05); sheet.rotation.x = -0.95; sheet.castShadow = true; part.add(sheet);
  for (const [dx, dz, r] of [[-1.2, 0.8, 0.2], [1, 1, -0.3], [0.3, -1.6, 0.6]] as const) {
    const crate = box(0.8, 0.7, 0.8, timberM); crate.position.set(x + dx, gy(x + dx, z + dz) + 0.35, z + dz + 4); crate.rotation.y = r; part.add(crate);
  }
  block(part, x - 0.25, gy(x, z + 4.5) + 0.35, z + 4.5, 1.2, 0.35, 1.4);
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.08, 12), ashM); ash.position.set(x, gy(x, z) + 0.04, z); part.add(ash);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, stone = box(0.32, 0.22, 0.26, rockM); stone.position.set(x + Math.cos(a) * 1.05, gy(x, z) + 0.1, z + Math.sin(a) * 1.05); stone.rotation.y = a; part.add(stone);
  }
}

/** The pit's floor: fallen blocks and a half-cut face of stone round Gritmaw's ground. */
function pit(part: THREE.Group, rand: () => number): void {
  const { x, z, r } = QUARRY.GRITMAW;
  // the haul path comes down from the north-north-west: no block on its line
  const path = Math.atan2(QUARRY.BRIDGE.z - z, QUARRY.BRIDGE.x - x);
  for (let i = 0; i < 9; i++) {
    let a = rand() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - path), Math.cos(a - path))) < 0.6) a += 1.4;
    const d = r + 2 + rand() * 9, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, s = 0.8 + rand() * 1.4;
    const stone = box(s * 1.6, s, s * 1.1, rockM); stone.position.set(px, groundHeight(px, pz) + s / 2 - 0.1, pz); stone.rotation.set(0, rand() * 3, (rand() - 0.5) * 0.2); part.add(stone);
    block(part, px, groundHeight(px, pz) + s / 2 - 0.1, pz, s * 0.8, s / 2, s * 0.55, stone.rotation.y);
  }
  // cut blocks stacked by the south face, as if the work stopped mid-day
  for (let i = 0; i < 6; i++) {
    const px = x - 6 + (i % 3) * 1.9, pz = z + r + 4, py = groundHeight(px, pz) + 0.45 + Math.floor(i / 3) * 0.9;
    const stone = box(1.8, 0.88, 1.1, rockM); stone.position.set(px, py, pz); part.add(stone);
  }
  block(part, x - 4.1, groundHeight(x - 4, z + r + 4) + 0.9, z + r + 4, 2.85, 0.9, 0.55);
}

/** The Quarrymaster: boots, a leather apron over a work coat, a broad-brimmed hat, a pick over her shoulder; a lean-to of
 *  poles and tarp behind her and two tool crates. Static: her talk is the scene's (gameplay.ts). */
function quarrymaster(part: THREE.Group): void {
  const { x, z, yaw } = QUARRYMASTER, gy = groundHeight(x, z), g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = yaw; part.add(g);
  const coat = new THREE.MeshStandardMaterial({ name: 'quarrymaster-coat', color: '#5b6a7a', roughness: 0.9 });
  const apron = new THREE.MeshStandardMaterial({ name: 'quarrymaster-apron', color: '#7a5434', roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ name: 'quarrymaster-skin', color: '#c99a78', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ name: 'quarrymaster-boots', color: '#2e2620', roughness: 0.9 });
  for (const side of [-1, 1]) {
    const leg = box(0.2, 0.8, 0.22, dark); leg.position.set(side * 0.13, 0.4, 0); g.add(leg);
    const arm = box(0.16, 0.66, 0.18, coat); arm.position.set(side * 0.36, 1.12, 0.02); arm.rotation.z = side * 0.12; g.add(arm);
  }
  const body = box(0.56, 0.7, 0.32, coat); body.position.set(0, 1.15, 0); g.add(body);
  const front = box(0.44, 0.78, 0.04, apron); front.position.set(0, 1.0, 0.18); g.add(front);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin); head.position.set(0, 1.68, 0); head.castShadow = true; g.add(head);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 14), apron); brim.position.set(0, 1.8, 0); g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 12), apron); crown.position.set(0, 1.89, 0); g.add(crown);
  const haft = box(0.05, 0.05, 1.1, timberM); haft.position.set(0.3, 1.5, -0.1); haft.rotation.x = 0.9; g.add(haft);
  const pick = box(0.6, 0.06, 0.06, rockM); pick.position.set(0.3, 1.92, -0.48); g.add(pick);
  // the lean-to behind her, and her crates
  const back = new THREE.Group(); back.position.set(x + 2.4, gy, z); part.add(back);
  for (const dz of [-1.4, 1.4]) { const pole = box(0.1, 2, 0.1, darkTimberM); pole.position.set(-0.8, 1, dz); back.add(pole); }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3, 2, 2), tarpM); sheet.position.set(0.1, 1.15, 0); sheet.rotation.set(0, Math.PI / 2, 0.95); back.add(sheet);
  for (const [dx, dz] of [[0.3, -0.7], [0.4, 0.5]] as const) { const crate = box(0.7, 0.6, 0.7, timberM); crate.position.set(dx, 0.3, dz); back.add(crate); }
  block(part, x, gy + 0.9, z, 0.3, 0.9, 0.3);
  block(part, x + 2.6, gy + 0.6, z, 0.9, 0.6, 1.5);
}

/** The Old Quarry: the pit's floor, the blobs' camp and the bridge over the Spoil Cut, with a region trigger at each. */
export function buildQuarry(world: ShardWorld): void {
  world.part('quarry', (part) => {
    const rand = T.rng(1501);
    pit(part, rand); camp(part, rand); bridge(part, rand); quarrymaster(part);
    world.trigger(QUARRY_FLAGS.pit, node(part, PIT.x, groundHeight(PIT.x, PIT.z), PIT.z), { radius: 30 });
    world.trigger(QUARRY_FLAGS.camp, node(part, QUARRY.CAMP.x, groundHeight(QUARRY.CAMP.x, QUARRY.CAMP.z), QUARRY.CAMP.z), { radius: 12 });
    world.trigger(QUARRY_FLAGS.bridge, node(part, CROSS.x, groundHeight(CROSS.x, CROSS.z), CROSS.z), { radius: 3 });
  });
}
