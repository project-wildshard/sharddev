// MOSSGATE-ZONE MZ13 (J452): Greyback's Thicket, the region north-east of the yard (layout.ts `thicket`). Close woods with
// two open places: Greyback's Clearing, where the old boar holds his elite camp with three sows, and the Sow Wallow, a mud
// hollow with two more. A lore sign at the clearing's edge tells who Greyback is. Each place is a region trigger. The boar's
// encounter row is fights.ts's, the bodies creatures.ts's; this file is the thicket's ground, its places and its sign.
import * as THREE from 'three';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { PLACES, REGIONS, inside } from './layout';
import { roadDistance } from './ground';
import { groundHeight } from './world';
import * as T from './textures';

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return { x: found.x, z: found.z };
};
const RECT = REGIONS.find((r) => r.id === 'thicket')?.rect ?? { x0: 0, x1: 0, z0: 0, z1: 0 };

/** The thicket's two places (layout.ts), how open each stands, and the lore sign at the clearing's south edge. */
export const THICKET = {
  CLEARING: { ...place('thicket.clearing'), open: 18 },
  WALLOW: { ...place('thicket.wallow'), open: 13 },
  SIGN: { x: place('thicket.clearing').x - 6, z: place('thicket.clearing').z + 15 },
} as const;

/** Greyback's camp: the elite at the clearing's heart, the sows round its rim; three more sows in the wallow. */
export const THICKET_CAMP = {
  greyback: { x: THICKET.CLEARING.x, z: THICKET.CLEARING.z, r: 12 },
  sows: [[128, -134], [151, -146], [138, -153]] as const,
  wallowSows: [[196, -196], [205, -203], [198, -206]] as const,
} as const;

export const THICKET_FLAGS = { clearing: 'mossgate.place.thicket.clearing', wallow: 'mossgate.place.thicket.wallow' } as const;

/** The lore sign's talk: it reads like a talk with no answers. */
export const THICKET_SIGN_DIALOGUE = {
  id: 'mossgate.thicket.sign', name: 'A weathered sign', start: 'read',
  nodes: [{ id: 'read', lines: [
    'GREYBACK. Old boar of the thicket, tusks like plough blades. He has thrown three hunters and a cart.',
    'He charges in a straight line and cannot turn once he starts. Step aside, then strike his flank.',
  ], choices: [] }],
};
export const THICKET_TALKS = [{ id: 'mossgate.thicket.sign.read', at: [THICKET.SIGN.x, groundHeight(THICKET.SIGN.x, THICKET.SIGN.z), THICKET.SIGN.z] as [number, number, number],
  radius: 2.2, label: 'Read the sign', dialogue: THICKET_SIGN_DIALOGUE.id }];

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };

/** The woods: low-poly trees and bushes filling the region, clear of the two places, the sign and every road. */
function woods(part: THREE.Group, rand: () => number): void {
  const R = (a: number, b: number): number => a + (b - a) * rand();
  const spots: [number, number, number][] = [];
  for (let tries = 0; tries < 900 && spots.length < 150; tries++) {
    const x = R(RECT.x0 - 8, RECT.x1 + 8), z = R(RECT.z0 - 8, RECT.z1 + 8);
    if (!inside({ x0: RECT.x0 - 8, x1: RECT.x1 + 8, z0: RECT.z0 - 8, z1: RECT.z1 + 8 }, x, z)) continue;
    if (Math.hypot(x - THICKET.CLEARING.x, z - THICKET.CLEARING.z) < THICKET.CLEARING.open) continue;
    if (Math.hypot(x - THICKET.WALLOW.x, z - THICKET.WALLOW.z) < THICKET.WALLOW.open) continue;
    if (Math.hypot(x - THICKET.SIGN.x, z - THICKET.SIGN.z) < 4 || roadDistance(x, z) < 4.5) continue;
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 5)) continue;
    spots.push([x, z, R(0.9, 1.6)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  const trunk = new THREE.MeshStandardMaterial({ name: 'thicket-trunk', color: '#5e4430', roughness: 0.95 });
  const crown = new THREE.MeshStandardMaterial({ name: 'thicket-crown', color: '#3f5a22', roughness: 0.9 });
  const tI = new THREE.InstancedMesh(trunkGeo, trunk, spots.length), cI = new THREE.InstancedMesh(crownGeo, crown, spots.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    const gy = groundHeight(x, z), th = 2.6 * s;
    o.position.set(x, gy - 0.1, z); o.scale.set(s, th, s); o.rotation.set(0, R(0, 6), 0); o.updateMatrix(); tI.setMatrixAt(i, o.matrix);
    o.position.set(x, gy + th + 0.9 * s, z); o.scale.set(1.7 * s, 1.45 * s, 1.7 * s); o.updateMatrix(); cI.setMatrixAt(i, o.matrix);
    col.setRGB(R(0.8, 1.1), R(0.85, 1.1), R(0.75, 1)); cI.setColorAt(i, col);
    // a trunk stops a walker; the crowns are overhead
    const post = solid(new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 2, 0.5 * s), trunk)); post.position.set(x, gy + 1, z); post.visible = false; part.add(post);
  });
  tI.castShadow = cI.castShadow = true; cI.receiveShadow = true;
  part.add(tI, cI);
}

/** The Sow Wallow: a disc of dark mud in its hollow, a few half-sunk logs round it. */
function wallow(part: THREE.Group, rand: () => number): void {
  const { x, z } = THICKET.WALLOW, mud = new THREE.MeshStandardMaterial({ name: 'wallow-mud', color: '#3b2c1c', roughness: 0.55 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 24), mud); disc.rotation.x = -Math.PI / 2; disc.position.set(x, groundHeight(x, z) + 0.06, z); disc.receiveShadow = true; part.add(disc);
  const log = new THREE.MeshStandardMaterial({ name: 'wallow-log', color: '#5a4430', roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand(), lx = x + Math.cos(a) * 8.5, lz = z + Math.sin(a) * 8.5;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 3.2, 7), log);
    l.position.set(lx, groundHeight(lx, lz) + 0.15, lz); l.rotation.set(Math.PI / 2, 0, a + Math.PI / 2); l.castShadow = true; part.add(l);
  }
}

/** The lore sign: a post and a board, readable from the clearing's road. */
function sign(part: THREE.Group): void {
  const { x, z } = THICKET.SIGN, gy = groundHeight(x, z), wood = new THREE.MeshStandardMaterial({ name: 'thicket-sign', color: '#7a5a3a', roughness: 0.9 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), wood); post.position.set(x, gy + 0.8, z); post.castShadow = true; part.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.08), wood); board.position.set(x, gy + 1.45, z + 0.08); board.castShadow = true; part.add(board);
}

/** Greyback's Thicket: the woods, the wallow, the sign, and a region trigger at each place. */
export function buildThicket(world: ShardWorld): void {
  world.part('thicket', (part) => {
    const rand = T.rng(1301);
    woods(part, rand); wallow(part, rand); sign(part);
    for (const [flag, at, radius] of [[THICKET_FLAGS.clearing, THICKET.CLEARING, 16], [THICKET_FLAGS.wallow, THICKET.WALLOW, 12]] as const) {
      world.trigger(flag, node(part, at.x, groundHeight(at.x, at.z), at.z), { radius });
    }
  });
}
