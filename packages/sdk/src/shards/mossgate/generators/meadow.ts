// MOSSGATE-ZONE MZ12 (J452): Mossling Meadow, the region north of the yard (layout.ts `meadow`). The mossling pack's den
// (an earth mound with a burrow, its hoard of bones and bright pebbles behind it) and the Standing Stones, where a second
// pack ranges. Each place is a region trigger, so walking up to it names it; the hoard is the meadow's find spot. The packs'
// rows are fights.ts's, their bodies creatures.ts's; this file is the meadow's ground, its places and its find.
import * as THREE from 'three';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { PLACES } from './layout';
import { groundHeight } from './world';
import * as T from './textures';

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return { x: found.x, z: found.z };
};

/** The meadow's two places (layout.ts) and its find: the hoard behind the den's mound. */
export const MEADOW = {
  DEN: place('meadow.den'),
  STONES: place('meadow.stones'),
  /** the den's mound, its burrow mouth facing south toward the yard */
  MOUND: { r: 4.2, h: 2.2 },
  HOARD: { x: place('meadow.den').x + 1.5, z: place('meadow.den').z - 5.6 },
} as const;

/** Where each pack ranges and stands: the den pack round its burrow, the stones pack inside the ring. */
export const MEADOW_PACKS = {
  den: { home: { x: MEADOW.DEN.x, z: MEADOW.DEN.z + 6 }, seats: [[-24.5, -143], [-15.5, -143.5], [-26, -148], [-14, -147.5]] },
  stones: { home: { x: MEADOW.STONES.x, z: MEADOW.STONES.z }, seats: [[37, -197], [43, -197.5], [38, -203], [42.5, -202.5]] },
} as const;

/** The flags the meadow's region triggers raise: each place named once a player walks up to it, and the hoard found. */
export const MEADOW_FLAGS = {
  den: 'mossgate.place.meadow.den',
  stones: 'mossgate.place.meadow.stones',
  hoard: 'mossgate.meadow.hoard.found',
} as const;

const stone = new THREE.MeshStandardMaterial({ name: 'meadow-stone', color: '#8c8a80', roughness: 0.95 });
const earth = new THREE.MeshStandardMaterial({ name: 'meadow-earth', color: '#4a3a26', roughness: 1 });
const burrow = new THREE.MeshStandardMaterial({ name: 'meadow-burrow', color: '#120e0a', roughness: 1 });
const bone = new THREE.MeshStandardMaterial({ name: 'meadow-bone', color: '#ddd3bb', roughness: 0.8 });
const pebble = new THREE.MeshStandardMaterial({ name: 'meadow-pebble', color: '#7fb0c4', roughness: 0.35, metalness: 0.1, emissive: '#1d3640', emissiveIntensity: 0.6 });

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };
/** An invisible solid box at these numbers (the same as play.ts's). */
const block = (part: THREE.Group, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): void => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), new THREE.MeshStandardMaterial({ color: '#000000' })));
  m.position.set(x, y, z); m.rotation.y = yaw; m.visible = false; part.add(m);
};

/** The den: a squat earth mound, a dark burrow mouth on its south face, rocks round its foot. */
function den(part: THREE.Group, rand: () => number): void {
  const { x, z } = MEADOW.DEN, { r, h } = MEADOW.MOUND, gy = groundHeight(x, z);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), earth);
  mound.scale.set(r, h, r * 0.85); mound.position.set(x, gy - 0.2, z); mound.castShadow = true; mound.receiveShadow = true; part.add(mound);
  // the burrow: a dark arch sunk into the south face
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16, 0, Math.PI), burrow);
  mouth.position.set(x, gy - 0.05, z + r * 0.78); mouth.rotation.x = -0.35; part.add(mouth);
  block(part, x, gy + h * 0.4, z - 0.4, r * 0.7, h * 0.45, r * 0.55);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2, d = r + 0.4 + rand() * 1.6, s = 0.35 + rand() * 0.55;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.5) continue; // keep the burrow mouth clear
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stone);
    const rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d;
    rock.position.set(rx, groundHeight(rx, rz) + s * 0.35, rz); rock.rotation.set(rand() * 3, rand() * 3, rand() * 3); rock.castShadow = true; part.add(rock);
  }
}

/** The hoard behind the mound: gnawed bones and a scatter of bright pebbles the mosslings carry home. */
function hoard(part: THREE.Group, rand: () => number): void {
  const { x, z } = MEADOW.HOARD, gy = groundHeight(x, z);
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5 + rand() * 0.3, 2, 6), bone);
    b.position.set(x + (rand() - 0.5) * 1.6, gy + 0.08, z + (rand() - 0.5) * 1.2); b.rotation.set(Math.PI / 2, 0, rand() * Math.PI); part.add(b);
  }
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + rand() * 0.07, 0), pebble);
    p.position.set(x + (rand() - 0.5) * 1.4, gy + 0.08, z + (rand() - 0.5) * 1.1); part.add(p);
  }
}

/** The Standing Stones: seven tall stones in a ring, one fallen, a flat altar stone in the middle. */
function stones(part: THREE.Group, rand: () => number): void {
  const { x, z } = MEADOW.STONES, ring = 7.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2, sx = x + Math.cos(a) * ring, sz = z + Math.sin(a) * ring, gy = groundHeight(sx, sz);
    const fallen = i === 4, hgt = 3.2 + rand() * 1.4;
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, hgt, 0.7, 1, 3, 1), stone);
    if (fallen) { s.position.set(sx, gy + 0.3, sz); s.rotation.set(Math.PI / 2 - 0.08, 0, a); block(part, sx, gy + 0.35, sz, 0.55, 0.35, hgt / 2, a); }
    else { s.position.set(sx, gy + hgt / 2 - 0.3, sz); s.rotation.set((rand() - 0.5) * 0.12, -a + Math.PI / 2, (rand() - 0.5) * 0.1); block(part, sx, gy + hgt / 2, sz, 0.55, hgt / 2, 0.35, -a + Math.PI / 2); }
    s.castShadow = true; s.receiveShadow = true; part.add(s);
  }
  const gy = groundHeight(x, z), altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.3), stone);
  altar.position.set(x, gy + 0.2, z); altar.rotation.y = 0.3; altar.castShadow = true; part.add(altar);
  block(part, x, gy + 0.25, z, 1.1, 0.25, 0.65, 0.3);
}

/** Mossling Meadow: the den, its hoard and the Standing Stones, with a region trigger at each. */
export function buildMeadow(world: ShardWorld): void {
  world.part('meadow', (part) => {
    const rand = T.rng(1201);
    den(part, rand); hoard(part, rand); stones(part, rand);
    world.trigger(MEADOW_FLAGS.den, node(part, MEADOW.DEN.x, groundHeight(MEADOW.DEN.x, MEADOW.DEN.z), MEADOW.DEN.z), { radius: 16 });
    world.trigger(MEADOW_FLAGS.stones, node(part, MEADOW.STONES.x, groundHeight(MEADOW.STONES.x, MEADOW.STONES.z), MEADOW.STONES.z), { radius: 12 });
    world.trigger(MEADOW_FLAGS.hoard, node(part, MEADOW.HOARD.x, groundHeight(MEADOW.HOARD.x, MEADOW.HOARD.z), MEADOW.HOARD.z), { radius: 1.8 });
  });
}
