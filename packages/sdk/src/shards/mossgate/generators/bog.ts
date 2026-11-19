// MOSSGATE-ZONE MZ14 (J452): the Bog, the region west of the yard (layout.ts `bog`). Low ground of dark standing water and
// reeds: Wisp Mere, its deepest hollow, where bog wisps circle low over the water and dive, and the Sunken Shrine, a tilted
// stone floor and broken pillars half drowned in the mud, with a chest on its floor. Each place is a region trigger; the
// chest is a shared prompt (as the yard's old chest), and its side quest pays each player who reaches it once it is open.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid, Water, type ShardWorld } from '@wildshard/sdk/scene/author';
import { PLACES } from './layout';
import { groundHeight } from './world';
import * as T from './textures';

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return { x: found.x, z: found.z };
};
const MERE = place('bog.mere'), SHRINE = place('bog.shrine');

/** The bog's places (layout.ts), the mere's water line and the shrine's chest. */
export const BOG = {
  MERE: { ...MERE, r: 26, waterY: groundHeight(MERE.x, MERE.z) + 0.8 },
  SHRINE,
  CHEST: { x: SHRINE.x + 1.2, z: SHRINE.z - 1.4 },
} as const;

/** The mere's wisps: they circle above the water (fights.ts's `mossgate.mere-wisp-dive` brain) and dive at a walker. */
export const BOG_WISPS = { home: { x: BOG.MERE.x, z: BOG.MERE.z, r: 14, y: BOG.MERE.waterY + 2.5 }, seats: [[-196, 74], [-205, 84], [-198, 88]] as const } as const;

export const BOG_FLAGS = {
  shrine: 'mossgate.place.bog.shrine',
  mere: 'mossgate.place.bog.mere',
  /** the walker stands at the shrine's chest (the quest pays a player here once the chest is open) */
  atChest: 'mossgate.bog.chest.reached',
  chestOpened: 'mossgate.bog.chest.opened',
} as const;
export const BOG_FIELD = 'mossgate.bog-chest.open';
export const BOG_USE = 'mossgate.bog-chest.use';

const stoneM = new THREE.MeshStandardMaterial({ name: 'shrine-stone', color: '#6f7468', roughness: 0.95 });
const mossM = new THREE.MeshStandardMaterial({ name: 'shrine-moss', color: '#3d5226', roughness: 1 });
const reedM = new THREE.MeshStandardMaterial({ name: 'bog-reed', color: '#5c6a2c', roughness: 0.9 });
const deadM = new THREE.MeshStandardMaterial({ name: 'bog-deadwood', color: '#4b4136', roughness: 1 });
const woodM = new THREE.MeshStandardMaterial({ name: 'bog-chest-wood', color: '#5d4630', roughness: 0.85 });
const bandM = new THREE.MeshStandardMaterial({ name: 'bog-chest-band', color: '#3f4a3c', roughness: 0.5 });

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };
const box = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.03), m); b.castShadow = true; b.receiveShadow = true; return b; };
const block = (part: THREE.Group, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): void => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), stoneM)); m.position.set(x, y, z); m.rotation.y = yaw; m.visible = false; part.add(m);
};

/** Wisp Mere: dark still water over the hollow's floor (its edge runs under the bank), reeds and drowned trees round it. */
function mere(part: THREE.Group, rand: () => number): void {
  const { x, z, r, waterY } = BOG.MERE;
  const water = new Water(new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false), { tint: '#1f3330', reflect: 'sky', segments: 32 });
  water.position.set(x, waterY, z); part.add(water);
  const reed = new THREE.ConeGeometry(0.05, 1.6, 4); reed.translate(0, 0.8, 0);
  const spots: [number, number][] = [];
  for (let i = 0; i < 220; i++) {
    const a = rand() * Math.PI * 2, d = r * (0.55 + rand() * 0.75), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (Math.abs(groundHeight(px, pz) - waterY) < 0.9) spots.push([px, pz]);
  }
  const reeds = new THREE.InstancedMesh(reed, reedM, spots.length), o = new THREE.Object3D();
  spots.forEach(([px, pz], i) => { o.position.set(px, Math.max(groundHeight(px, pz), waterY - 0.4), pz); o.rotation.set((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3); o.scale.setScalar(0.7 + rand() * 0.7); o.updateMatrix(); reeds.setMatrixAt(i, o.matrix); });
  part.add(reeds);
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, d = r * (0.7 + rand() * 0.5), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, gy = Math.min(groundHeight(px, pz), waterY), h = 4 + rand() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, h, 6), deadM); trunk.position.set(px, gy + h / 2 - 0.4, pz); trunk.rotation.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25); trunk.castShadow = true; part.add(trunk);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.8, 5), deadM); limb.position.set(px + 0.5, gy + h * 0.7, pz); limb.rotation.z = -0.9; part.add(limb);
  }
}

/** The Sunken Shrine: a tilted floor of slabs half in the mud, four pillars (two snapped), a mossy altar block. */
function shrine(part: THREE.Group, rand: () => number): void {
  const { x, z } = BOG.SHRINE, gy = groundHeight(x, z);
  const floor = box(9, 0.5, 9, stoneM); floor.position.set(x, gy + 0.05, z); floor.rotation.set(0.04, 0.35, -0.05); part.add(floor);
  block(part, x, gy + 0.05, z, 4.5, 0.25, 4.5, 0.35);
  for (const [dx, dz, broken] of [[-3.6, -3.6, false], [3.6, -3.6, true], [-3.6, 3.6, true], [3.6, 3.6, false]] as const) {
    const c = Math.cos(0.35), s = Math.sin(0.35), px = x + dx * c + dz * s, pz = z - dx * s + dz * c, h = broken ? 1.2 + rand() * 0.8 : 4.2;
    const pillar = box(0.8, h, 0.8, stoneM); pillar.position.set(px, gy + h / 2, pz); pillar.rotation.set((rand() - 0.5) * 0.1, 0.35, (rand() - 0.5) * 0.1); part.add(pillar);
    block(part, px, gy + h / 2, pz, 0.4, h / 2, 0.4, 0.35);
    if (broken) { const top = box(0.8, 1.6, 0.8, stoneM); top.position.set(px + 1.3, gy + 0.3, pz + 0.6); top.rotation.set(Math.PI / 2 - 0.2, rand(), 0.1); part.add(top); }
    const cap = box(0.95, 0.12, 0.95, mossM); cap.position.set(px, gy + h + 0.06, pz); cap.rotation.y = 0.35; part.add(cap);
  }
  const altar = box(1.6, 1, 1, stoneM); altar.position.set(x - 1.5, gy + 0.75, z + 1.5); altar.rotation.y = 0.35; part.add(altar);
  block(part, x - 1.5, gy + 0.75, z + 1.5, 0.8, 0.5, 0.5, 0.35);
}

/** The shrine's chest: a shared prompt as the yard's old chest, its lid a panel its field shows shut or open. */
function chest(world: ShardWorld): void {
  const { x, z } = BOG.CHEST, gy = groundHeight(BOG.SHRINE.x, BOG.SHRINE.z) + 0.3;
  world.part('bog-chest', (part) => {
    const body = box(0.9, 0.5, 0.6, woodM); body.position.set(x, gy + 0.25, z); part.add(body);
    for (const dx of [-0.3, 0.3]) { const strap = box(0.06, 0.52, 0.62, bandM); strap.position.set(x + dx, gy + 0.25, z); part.add(strap); }
    block(part, x, gy + 0.25, z, 0.45, 0.25, 0.3);
    world.interact(BOG_USE, node(part, x, gy + 0.6, z), { label: 'Open the drowned chest', radius: 2.2, sets: { field: BOG_FIELD, scope: 'shared', value: true } });
    world.trigger(BOG_FLAGS.atChest, node(part, x, gy, z), { radius: 3 });
  });
  world.part('bog-chest-lid', (part) => {
    const lid = box(0.94, 0.14, 0.64, woodM); lid.position.set(x, gy + 0.57, z); part.add(lid);
  }, { panel: 'mossgate.bog-chest.lid', shownWhen: { field: BOG_FIELD, equals: false } });
  world.part('bog-chest-lid-open', (part) => {
    const lid = box(0.94, 0.64, 0.14, woodM); lid.position.set(x, gy + 0.82, z - 0.32); part.add(lid);
  }, { panel: 'mossgate.bog-chest.lid-open', shownWhen: { field: BOG_FIELD, equals: true } });
}

/** The Bog: Wisp Mere, the Sunken Shrine and its chest, with a region trigger at each place. */
export function buildBog(world: ShardWorld): void {
  world.part('bog', (part) => {
    const rand = T.rng(1401);
    mere(part, rand); shrine(part, rand);
    world.trigger(BOG_FLAGS.shrine, node(part, BOG.SHRINE.x, groundHeight(BOG.SHRINE.x, BOG.SHRINE.z), BOG.SHRINE.z), { radius: 14 });
    world.trigger(BOG_FLAGS.mere, node(part, BOG.MERE.x, BOG.MERE.waterY, BOG.MERE.z), { radius: 30 });
  });
  chest(world);
}
