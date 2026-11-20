// MOSSGATE-ZONE MZ16 (J452): Lookout Ridge, the region north-west of the yard (layout.ts `ridge`). The ground climbs to a
// level top 15 m up (ground.ts); on it the Lookout, a stone dais with steps up its east face, a low parapet, a timber watch
// roof and a beacon stack, and beside the steps a view stone that reads as a talk naming what you see. Cairns mark the path
// up from the meadow; wind-bent pines and boulders stand on the slopes. The Lookout is a region trigger.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';
import { fire } from '@wildshard/sdk/scene/fire';
import { inside, PATHS, PLACES, REGIONS } from './layout';
import { roadDistance } from './ground';
import { groundHeight } from './world';
import * as T from './textures';
import { leave, LORE_FLAGS } from './finds';

const place = (id: string): { x: number; z: number } => {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`mossgate: no place ${id}`);
  return { x: found.x, z: found.z };
};
const LOOKOUT = place('ridge.lookout');
const RECT = REGIONS.find((r) => r.id === 'ridge')?.rect ?? { x0: 0, x1: 0, z0: 0, z1: 0 };
/** The path up: its last leg, from the meadow side to the top. */
const CLIMB = PATHS.find((p) => p.to === 'ridge.lookout')?.points ?? [];

/** The Lookout's dais (half its side, its height, the steps' count on its east face) and the view stone by the steps. */
export const RIDGE = {
  LOOKOUT,
  DAIS: { half: 3.6, h: 1.2, steps: 4 },
  VIEW_STONE: { x: LOOKOUT.x + 6.4, z: LOOKOUT.z - 3.2 },
} as const;

export const RIDGE_FLAGS = { lookout: 'mossgate.place.ridge.lookout' } as const;

/** MZ21: the scavengers' camp on the ridge's lower slope, 70 m south of the Lookout and off the climb: five grey blobs round
 *  its middle (creatures.ts places them); the slopes keep their pines and boulders clear of it. */
export const RIDGE_CAMP = { x: -200, z: -130, seats: [[-197, -127], [-204, -128], [-199, -134.5], [-205, -134], [-201, -130.5]] as const } as const;

/** MZ18: the beacon on the Lookout's west edge, which the main chain lights: its prompt, the shared field it sets, its
 *  fire's panel, and where it stands (on the dais's top). */
export const BEACON = {
  use: 'mossgate.beacon.use',
  field: 'mossgate.beacon',
  panel: 'mossgate.beacon-fire',
  x: LOOKOUT.x - RIDGE.DAIS.half + 1.2,
  z: LOOKOUT.z,
} as const;

/** The view stone's talk: what the Lookout shows, read like a sign. */
export const RIDGE_VIEW_DIALOGUE = {
  id: 'mossgate.ridge.view', name: 'The view stone', start: 'read',
  nodes: [{ id: 'read', lines: [
    'Cut into the stone: SOUTH-EAST, THE HOLLOW AND ITS THREE FLAMES. EAST, THE MEADOW AND THE STANDING STONES.',
    'FAR EAST, THE THICKET WHERE GREYBACK RUNS. SOUTH, THE BOG AND ITS SHRINE. BEYOND THE HOLLOW, THE BARROW DOWNS.',
    'Under it, newer and rougher: when the beacon here burns, the Warden is awake.',
  ], choices: [leave(LORE_FLAGS.ridge)] }],
};
export const RIDGE_TALKS = [{ id: 'mossgate.ridge.view.read', at: [RIDGE.VIEW_STONE.x, groundHeight(RIDGE.VIEW_STONE.x, RIDGE.VIEW_STONE.z), RIDGE.VIEW_STONE.z] as [number, number, number],
  radius: 2.4, label: 'Read the view stone', dialogue: RIDGE_VIEW_DIALOGUE.id }];

const stoneM = new THREE.MeshStandardMaterial({ name: 'ridge-stone', color: '#9a968a', roughness: 0.95 });
const capM = new THREE.MeshStandardMaterial({ name: 'ridge-cap', color: '#b4ae9e', roughness: 0.9 });
const timberM = new THREE.MeshStandardMaterial({ name: 'ridge-timber', color: '#6b5236', roughness: 0.9 });
const roofM = new THREE.MeshStandardMaterial({ name: 'ridge-roof', color: '#4c5a34', roughness: 0.95 });
const logM = new THREE.MeshStandardMaterial({ name: 'ridge-log', color: '#5a4430', roughness: 0.95 });

const node = (part: THREE.Group, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); part.add(o); return o; };
const box = (w: number, h: number, d: number, m: THREE.Material): THREE.Mesh => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.04, w / 4, h / 4, d / 4)), m); b.castShadow = true; b.receiveShadow = true; return b; };
/** An invisible collider box (half extents), turned by `yaw`. */
const block = (part: THREE.Group, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0): void => {
  const m = solid(new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), stoneM)); m.position.set(x, y, z); m.rotation.y = yaw; m.visible = false; part.add(m);
};

/** The Lookout: a dry-stone dais on the ridge's level top, steps up its east face (where the path arrives), a parapet round
 *  the other three sides, four posts holding a turf roof, and a beacon stack of logs at its west edge. */
function lookout(part: THREE.Group, rand: () => number): void {
  const { x, z } = LOOKOUT, { half, h, steps } = RIDGE.DAIS, gy = groundHeight(x, z);
  // the dais: coursed blocks, a cap slab on top; its collider is one box
  for (let course = 0; course < 3; course++) {
    for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) {
      const len = (half * 2) / 7, y = gy + course * (h / 3) + h / 6 - 0.05, jitter = (rand() - 0.5) * 0.06;
      const a = box(len - 0.04, h / 3 - 0.03, 0.5, stoneM); a.position.set(x + i * len + jitter, y, z + side * (half - 0.25)); part.add(a);
      const b = box(0.5, h / 3 - 0.03, len - 0.04, stoneM); b.position.set(x + side * (half - 0.25), y, z + i * len + jitter); part.add(b);
    }
  }
  const cap = box(half * 2 + 0.2, 0.16, half * 2 + 0.2, capM); cap.position.set(x, gy + h + 0.03, z); part.add(cap);
  block(part, x, gy + (h + 0.1) / 2, z, half, (h + 0.1) / 2, half);
  // steps down the east face: each a level block a riser lower
  const rise = (h + 0.1) / (steps + 1), tread = 0.55;
  for (let s = 0; s < steps; s++) {
    const top = gy + rise * (steps - s), sx = x + half + tread * (s + 0.5);
    const step = box(tread + 0.02, top - gy + 0.3, 2.4, stoneM); step.position.set(sx, (top + gy - 0.3) / 2, z); part.add(step);
    block(part, sx, (top + gy - 0.3) / 2, z, tread / 2, (top - gy + 0.3) / 2, 1.2);
  }
  // the parapet on the north, south and west edges, knee high, with a gap for the steps on the east
  const top = gy + h + 0.11;
  for (const [px, pz, w, d] of [[x, z - half + 0.2, half * 2, 0.4], [x, z + half - 0.2, half * 2, 0.4], [x - half + 0.2, z, 0.4, half * 2]] as const) {
    const wall = box(w, 0.6, d, capM); wall.position.set(px, top + 0.3, pz); part.add(wall);
    block(part, px, top + 0.3, pz, w / 2, 0.3, d / 2);
  }
  // the watch roof: four timber posts and a turf-topped pitch over the middle of the dais
  const r = half - 1.1, postH = 2.6;
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const) {
    const post = box(0.22, postH, 0.22, timberM); post.position.set(x + dx, top + postH / 2, z + dz); part.add(post);
    block(part, x + dx, top + postH / 2, z + dz, 0.11, postH / 2, 0.11);
  }
  for (const side of [-1, 1]) {
    const slope = box(r * 2 + 1.2, 0.18, r + 0.8, roofM); slope.position.set(x, top + postH + 0.45, z + side * (r + 0.8) / 2); slope.rotation.x = side * 0.42; part.add(slope);
  }
  const beam = box(r * 2 + 1.3, 0.2, 0.2, timberM); beam.position.set(x, top + postH + 0.62, z); part.add(beam);
  // the beacon: a cone of logs at the west edge, unlit
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.9, 6), logM);
    log.position.set(x - half + 1.2 + Math.cos(a) * 0.32, top + 0.85, z + Math.sin(a) * 0.32); log.rotation.set(-Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35); log.castShadow = true; part.add(log);
  }
}

/** The view stone: a squat standing stone by the foot of the steps, its face toward the path. */
function viewStone(part: THREE.Group): void {
  const { x, z } = RIDGE.VIEW_STONE, gy = groundHeight(x, z);
  const stone = box(1.3, 1.25, 0.5, capM); stone.position.set(x, gy + 0.55, z); stone.rotation.set(-0.12, 0.5, 0); part.add(stone);
  block(part, x, gy + 0.6, z, 0.65, 0.6, 0.25, 0.5);
}

/** Cairns up the path: a stack of stones every 22 m along the climb, a step off its right-hand side. */
function cairns(part: THREE.Group, rand: () => number): void {
  for (let i = 1; i < CLIMB.length; i++) {
    const [ax, az] = CLIMB[i - 1] ?? [0, 0], [bx, bz] = CLIMB[i] ?? [0, 0], len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let d = 22; d < len - 12; d += 22) {
      const cx = ax + ux * d - uz * 3.4, cz = az + uz * d + ux * 3.4;
      if (!inside({ x0: RECT.x0 - 30, x1: RECT.x1 + 30, z0: RECT.z0 - 30, z1: RECT.z1 + 30 }, cx, cz)) continue;
      let y = groundHeight(cx, cz);
      for (let k = 0; k < 4; k++) {
        const s = 0.55 - k * 0.1, st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneM);
        st.scale.y = 0.6; st.position.set(cx + (rand() - 0.5) * 0.08, y + s * 0.5, cz + (rand() - 0.5) * 0.08); st.rotation.y = rand() * 3; st.castShadow = true; part.add(st);
        y += s * 0.75;
      }
      block(part, cx, groundHeight(cx, cz) + 0.6, cz, 0.45, 0.6, 0.45);
    }
  }
}

/** The slopes: wind-bent pines leaning away from the west wind, and boulders, clear of the road, the top and the cairns. */
function slopes(part: THREE.Group, rand: () => number): void {
  const R = (a: number, b: number): number => a + (b - a) * rand();
  const pines: [number, number, number][] = [], rocks: [number, number, number][] = [];
  for (let tries = 0; tries < 700 && (pines.length < 46 || rocks.length < 18); tries++) {
    const x = R(RECT.x0, RECT.x1), z = R(RECT.z0, RECT.z1);
    if (Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z) < 15 || Math.hypot(x - RIDGE_CAMP.x, z - RIDGE_CAMP.z) < 10 || roadDistance(x, z) < 5.5) continue;
    if ([...pines, ...rocks].some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 6)) continue;
    if (pines.length < 46 && rand() < 0.75) pines.push([x, z, R(0.8, 1.3)]); else if (rocks.length < 18) rocks.push([x, z, R(0.7, 1.6)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
  const trunk = new THREE.MeshStandardMaterial({ name: 'ridge-pine-trunk', color: '#5a4230', roughness: 0.95 });
  const needles = new THREE.MeshStandardMaterial({ name: 'ridge-pine', color: '#2f4a2a', roughness: 0.9 });
  const tI = new THREE.InstancedMesh(trunkGeo, trunk, pines.length), nI = new THREE.InstancedMesh(coneGeo, needles, pines.length * 2);
  const o = new THREE.Object3D(), col = new THREE.Color();
  pines.forEach(([x, z, s], i) => {
    const gy = groundHeight(x, z), th = 3.4 * s, lean = R(0.08, 0.2);
    o.position.set(x, gy - 0.1, z); o.rotation.set(0, 0, -lean); o.scale.set(s, th, s); o.updateMatrix(); tI.setMatrixAt(i, o.matrix);
    // two tiers of needles, the crown pushed east by the lean
    for (let k = 0; k < 2; k++) {
      const up = th * (0.45 + k * 0.32);
      o.position.set(x + Math.sin(lean) * up, gy + up, z); o.scale.set((1.6 - k * 0.5) * s, (2.2 - k * 0.4) * s, (1.5 - k * 0.5) * s); o.updateMatrix(); nI.setMatrixAt(i * 2 + k, o.matrix);
      col.setRGB(R(0.85, 1.1), R(0.9, 1.1), R(0.85, 1)); nI.setColorAt(i * 2 + k, col);
    }
    block(part, x, gy + 1, z, 0.22 * s, 1, 0.22 * s);
  });
  tI.castShadow = nI.castShadow = true; nI.receiveShadow = true; part.add(tI, nI);
  for (const [x, z, s] of rocks) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneM);
    rock.scale.set(1.3, 0.7, 1); rock.position.set(x, groundHeight(x, z) + s * 0.25, z); rock.rotation.y = rand() * 3; rock.castShadow = true; rock.receiveShadow = true; part.add(rock);
    block(part, x, groundHeight(x, z) + s * 0.35, z, s * 1.1, s * 0.4, s * 0.85, rock.rotation.y);
  }
}

/** Lookout Ridge: the Lookout and its view stone, cairns up the path, pines and boulders, and the Lookout's region trigger. */
export function buildRidge(world: ShardWorld): void {
  world.part('ridge', (part) => {
    const rand = T.rng(1601);
    lookout(part, rand); viewStone(part); cairns(part, rand); slopes(part, rand);
    world.trigger(RIDGE_FLAGS.lookout, node(part, LOOKOUT.x, groundHeight(LOOKOUT.x, LOOKOUT.z), LOOKOUT.z), { radius: 16 });
    const top = groundHeight(LOOKOUT.x, LOOKOUT.z) + RIDGE.DAIS.h + 0.11;
    world.interact(BEACON.use, node(part, BEACON.x + 0.9, top + 1.4, BEACON.z), { label: 'Light the beacon', radius: 2.6, sets: { field: BEACON.field, scope: 'shared', value: true } });
  });
  // MZ18: the beacon's fire, seen from the Hollow once it burns
  world.part('beacon-fire', (part) => {
    const top = groundHeight(LOOKOUT.x, LOOKOUT.z) + RIDGE.DAIS.h + 0.11;
    const f = fire({ size: 2.2, seed: 1611 }); f.position.set(BEACON.x, top + 0.4, BEACON.z); part.add(f);
  }, { panel: BEACON.panel, shownWhen: { field: BEACON.field, equals: true } });
}
