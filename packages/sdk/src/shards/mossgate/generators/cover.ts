// MOSSGATE-ZONE MZ24: each region's ground cover, so a region reads apart from the yard and its neighbours at a glance.
// One detail layer a region (the engine scatters each round the camera; a shard holds 8 and the yard has 2): flowers in
// Mossling Meadow, ferns in Greyback's Thicket, reed clumps in the Bog, pale tall grass on the Barrow Downs, rubble in
// the Old Quarry, heather on Lookout Ridge. Cover keeps off the roads, out of the mere and off each place's own floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShardWorld } from '@wildshard/sdk/scene/author';
import * as T from './textures';
import { BOG } from './bog';
import { groundHeight } from './hollow';
import { roadDistance } from './ground';
import { PLACES, REGIONS } from './layout';

/** What stands on each place's floor stays clear of cover, metres from the place's centre. */
const CLEAR: Record<string, number> = {
  'meadow.den': 9, 'meadow.stones': 11, 'thicket.clearing': 16, 'thicket.wallow': 11, 'downs.barrow': 24, 'downs.cairn': 10,
  'bog.shrine': 9, 'ridge.lookout': 10,
};

interface Cover {
  readonly region: string;
  readonly card: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  /** copies a square metre, before the noise thins them into drifts */
  readonly density: number;
  readonly scale: readonly [number, number];
  readonly colours: readonly (readonly [number, number, number])[];
  readonly radius: number;
  readonly sway: number;
}

/** One geometry from several, indexed or not (three's polyhedra carry no index; cones and cylinders do). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index === null ? g : g.toNonIndexed())));
  if (merged === null) throw new Error('cover: a clump did not merge');
  return merged;
}

/** A crossed card (two planes at right angles), its normals up so it lights as the ground does. */
function crossCard(w: number, h: number): THREE.BufferGeometry {
  const card = new THREE.PlaneGeometry(w, h); card.translate(0, h / 2 - 0.02, 0);
  const cross = mergeGeometries([card, card.clone().rotateY(Math.PI / 2)]);
  const n = cross.attributes.normal;
  if (n !== undefined) for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return cross;
}

/** Meadow flowers: five heads on thin stalks, the heads the instance's colour. */
function flowerClump(): THREE.BufferGeometry {
  const rand = T.rng(2401), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const x = (rand() - 0.5) * 0.5, z = (rand() - 0.5) * 0.5, h = 0.22 + rand() * 0.2;
    parts.push(new THREE.CylinderGeometry(0.008, 0.012, h, 3).translate(x, h / 2, z));
    parts.push(new THREE.IcosahedronGeometry(0.045, 0).scale(1, 0.6, 1).translate(x, h, z));
  }
  return merge(parts);
}

/** Bog reeds: a clump of seven leaning blades, two with a brown head. */
function reedClump(): THREE.BufferGeometry {
  const rand = T.rng(2402), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.9 + rand() * 0.8;
    const blade = new THREE.ConeGeometry(0.025, h, 3).translate(0, h / 2, 0).rotateX((rand() - 0.5) * 0.35).rotateZ((rand() - 0.5) * 0.35);
    parts.push(blade.translate((rand() - 0.5) * 0.35, 0, (rand() - 0.5) * 0.35));
    if (i < 2) parts.push(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 4).translate(0, h * 0.85, 0));
  }
  return merge(parts);
}

/** Quarry rubble: three flat broken stones. */
function rubble(): THREE.BufferGeometry {
  const rand = T.rng(2403), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const s = 0.08 + rand() * 0.14;
    parts.push(new THREE.DodecahedronGeometry(s, 0).scale(1.3, 0.55, 1).rotateY(rand() * 3).translate((rand() - 0.5) * 0.6, s * 0.3, (rand() - 0.5) * 0.6));
  }
  return merge(parts);
}

/** Ridge heather: two low lumpy mounds. */
function heather(): THREE.BufferGeometry {
  return merge([
    new THREE.IcosahedronGeometry(0.28, 0).scale(1.2, 0.55, 1).translate(0, 0.08, 0),
    new THREE.IcosahedronGeometry(0.18, 0).scale(1, 0.6, 1.2).translate(0.3, 0.05, 0.18),
  ]);
}

/** A thicket fern: six arched fronds. */
function fern(): THREE.BufferGeometry {
  const frond = new THREE.PlaneGeometry(0.32, 1.1, 1, 5); frond.translate(0, 0.55, 0);
  const p = frond.attributes.position;
  if (p !== undefined) for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, y * y * 0.5); p.setY(i, y * (1 - y * 0.22)); }
  frond.computeVertexNormals();
  const lean = T.rng(2404);
  return mergeGeometries(Array.from({ length: 6 }, (_, f) => frond.clone().rotateX(-(0.3 + 0.3 * lean())).rotateY((f / 6) * Math.PI * 2)));
}

function covers(): Cover[] {
  const grass = T.grassCard(), frond = T.frond();
  return [
    { region: 'meadow', card: flowerClump(), material: new THREE.MeshStandardMaterial({ name: 'meadow-flowers', roughness: 0.8 }), density: 0.6, scale: [0.8, 1.3],
      colours: [[1, 0.95, 0.85], [1, 0.85, 0.25], [0.95, 0.55, 0.75], [0.7, 0.75, 1]], radius: 45, sway: 0.05 },
    { region: 'thicket', card: fern(), material: new THREE.MeshStandardMaterial({ name: 'thicket-fern', map: frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }), density: 0.5, scale: [0.9, 1.6],
      colours: [[0.6, 0.75, 0.55], [0.75, 0.85, 0.6]], radius: 40, sway: 0.05 },
    { region: 'bog', card: reedClump(), material: new THREE.MeshStandardMaterial({ name: 'bog-reeds', color: '#7c7a3c', roughness: 0.9 }), density: 0.6, scale: [0.8, 1.4],
      colours: [[0.75, 0.75, 0.6], [1, 0.95, 0.7]], radius: 45, sway: 0.08 },
    { region: 'downs', card: crossCard(0.55, 0.7), material: new THREE.MeshStandardMaterial({ name: 'downs-grass', map: grass, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }), density: 1.5, scale: [0.8, 1.4],
      colours: [[1.35, 1.15, 0.6], [1.5, 1.3, 0.75]], radius: 40, sway: 0.08 },
    { region: 'quarry', card: rubble(), material: new THREE.MeshStandardMaterial({ name: 'quarry-rubble', color: '#a49884', roughness: 0.95, flatShading: true }), density: 0.5, scale: [0.8, 1.6],
      colours: [[0.8, 0.78, 0.74], [1.05, 1, 0.92]], radius: 40, sway: 0 },
    { region: 'ridge', card: heather(), material: new THREE.MeshStandardMaterial({ name: 'ridge-heather', color: '#ffffff', roughness: 0.95, flatShading: true }), density: 0.6, scale: [0.7, 1.3],
      colours: [[0.45, 0.32, 0.45], [0.6, 0.42, 0.55], [0.42, 0.48, 0.32]], radius: 40, sway: 0 },
  ];
}

/** Whether cover may stand at (x, z): off the roads, out of the mere's water, off every place's floor. */
export function coverClear(x: number, z: number): boolean {
  if (roadDistance(x, z) < 1.8) return false;
  const m = BOG.MERE;
  if (Math.hypot(x - m.x, z - m.z) < m.r + 2 && groundHeight(x, z) < m.waterY - 0.15) return false;
  return PLACES.every((p) => Math.hypot(x - p.x, z - p.z) >= (CLEAR[p.id] ?? 0));
}

/** Every region's cover, one detail layer each. */
export function buildCover(world: ShardWorld): void {
  const noise = T.makeNoise(2400);
  for (const [n, cover] of covers().entries()) {
    const rect = REGIONS.find((r) => r.id === cover.region)?.rect;
    if (rect === undefined) throw new Error(`cover: no region ${cover.region}`);
    const rand = T.rng(2410 + n), area = (rect.x1 - rect.x0) * (rect.z1 - rect.z0), tries = Math.round(area * cover.density);
    const seats: [number, number, number][] = [];
    for (let i = 0; i < tries; i++) {
      const x = rect.x0 + rand() * (rect.x1 - rect.x0), z = rect.z0 + rand() * (rect.z1 - rect.z0), drift = noise.fbm(x * 0.06, z * 0.06, 2);
      // drifts: thick in some hollows, bare in others; thinner toward the region's edge
      const edge = Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
      if (rand() > (drift - 0.3) * 2.2 || rand() > edge / 12 || !coverClear(x, z)) continue;
      seats.push([x, z, rand()]);
    }
    const mesh = new THREE.InstancedMesh(cover.card, cover.material, seats.length), o = new THREE.Object3D(), c = new THREE.Color();
    seats.forEach(([x, z, r], i) => {
      o.position.set(x, groundHeight(x, z) - 0.03, z); o.rotation.set(0, r * Math.PI * 2, 0);
      o.scale.setScalar(cover.scale[0] + (cover.scale[1] - cover.scale[0]) * ((r * 7.3) % 1)); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      const pick = cover.colours[Math.floor(((r * 13.7) % 1) * cover.colours.length)] ?? [1, 1, 1];
      mesh.setColorAt(i, c.setRGB(pick[0], pick[1], pick[2]));
    });
    world.detail(`${cover.region}-cover`, mesh, { cell: 2, radius: cover.radius, sway: { amount: cover.sway, rate: 0.5 } });
  }
}
