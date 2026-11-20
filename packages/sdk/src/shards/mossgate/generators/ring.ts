// The barrow ring on the Downs (split from world.ts, MZ25; the cleanroom's world.js 699-813, moved out of the yard in
// MZ17): a sunk checker floor, the mossy ring wall, the arch and the rim braziers. downs.ts dresses the land round it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT, STATE, groundHeight, type Materials, type Textures } from './hollow';
import { kit, decal } from './kit';

/** MZ17: the ground the barrow ring stands on (its floor is sunk 0.35 m below it); the arena's heights are over it. */
export function arenaBase(): number { return groundHeight(LAYOUT.ARENA.x, LAYOUT.ARENA.z) + 0.35; }

/** The arena (cleanroom world.js 699-813): a sunk checker floor, a mossy ring wall, a stone arch and rim braziers. The
 *  Barrow Warden that stood in it idle is a live creature since TR-12b (creatures.ts). */
export function arena(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 699, M, tex), { R, rand, stoneBlocks, addBlock, addCap, collider, drape, ivy, bracketLamp } = k;
  const { x: ax, z: az, r } = LAYOUT.ARENA, B = arenaBase();
  const t = tex.checker?.clone();
  if (t !== undefined) { t.repeat.set(r * 2 / 8, r * 2 / 8); t.needsUpdate = true; }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ map: t ?? null, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(ax, B - 0.34, az); floor.receiveShadow = true; part.add(floor);
  const gateA = Math.PI; // the arch faces west, toward the yard and the approach
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const da = Math.atan2(Math.sin(am - gateA), Math.cos(am - gateA));
    if (Math.abs(da) < 0.2) continue;
    const x0 = ax + Math.cos(a0) * r, z0 = az + Math.sin(a0) * r, x1 = ax + Math.cos(a1) * r, z1 = az + Math.sin(a1) * r;
    const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let c = 0; c < 3; c++) addBlock(cx, B - 0.34 + c * 0.55 + 0.27, cz, len + 0.02, 0.52, 0.8, rot, R(0.78, 1.0));
    addCap(cx, B + 1.36, cz, len + 0.12, 0.34, 1.0, rot);
    drape(cx - Math.cos(am) * 0.52, B + 1.32, cz - Math.sin(am) * 0.52, len, rot, R(0.2, 0.55));
    if (rand() < 0.35) ivy(cx - Math.cos(am) * 0.45, B + 1.3, cz - Math.sin(am) * 0.45, R(0.6, 1.4), rot);
    collider({ x: cx, y: B + 0.5, z: cz, hx: len / 2, hy: 1.0, hz: 0.4, rotY: rot });
    if (i % 6 === 3) decal(part, '8x8', cx - Math.cos(am) * 0.42, B + 0.5, cz - Math.sin(am) * 0.42, Math.atan2(-Math.cos(am), -Math.sin(am)), 1.0);
  }
  // the arch
  const gx = LAYOUT.ARCH.x, gz = LAYOUT.ARCH.z;
  for (const s of [-1, 1]) {
    const pz = gz + s * 1.9;
    for (let j = 0; j < 4; j++) addBlock(gx, B + j * 0.8 + 0.4, pz, 1.05, 0.76, 1.05, 0, R(0.8, 1.0));
    collider({ x: gx, y: B + 1.6, z: pz, hx: 0.52, hy: 1.6, hz: 0.52, rotY: 0 });
    bracketLamp(gx - 0.55, B + 2.4, pz, -Math.PI / 2, true);
  }
  const archCurve = new THREE.EllipseCurve(0, 0, 1.9, 1.35, 0, Math.PI);
  for (let j = 0; j < 9; j++) {
    const p = archCurve.getPoint((j + 0.5) / 9), p2 = archCurve.getPoint((j + 1) / 9), p1 = archCurve.getPoint(j / 9);
    stoneBlocks.push({ x: gx, y: B + 3.2 + p.y, z: gz + p.x, sx: 1.0, sy: 0.7, sz: 0.72, rotY: 0, rotX: -Math.atan2(p2.y - p1.y, p2.x - p1.x), tint: R(0.8, 1.0) });
  }
  addCap(gx, B + 4.72, gz, 1.25, 0.42, 2.6);
  for (const f of [-1, 1]) drape(gx + f * 0.55, B + 4.62, gz, 2.4, Math.PI / 2, 0.55);
  for (let j = 0; j < 5; j++) ivy(gx - 0.56, B + 4.4, gz + R(-1.5, 1.5), R(0.6, 2.0), Math.PI / 2, 0.36);
  // rim braziers on the far wall: A north, B east, C south; lit with their quest brazier
  for (const [l, a] of [['A', -0.42], ['B', 0], ['C', 0.42]] as const) {
    const bx = ax + Math.cos(a) * (r + 0.05), bz = az + Math.sin(a) * (r + 0.05);
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.5, 0.85, 2, 0.05), M.stone); ped.position.y = 0.25;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.3, 0.32, 8), M.stone); bowl.position.y = 0.66;
    g.add(ped, bowl); g.position.set(bx, B + 1.45, bz); part.add(g);
    decal(part, l, bx - Math.cos(a) * 0.44, B + 1.7, bz - Math.sin(a) * 0.44, Math.atan2(-Math.cos(a), -Math.sin(a)), 0.4);
    if (STATE.lit.includes(l)) k.fire(bx, B + 2.25, bz, 0.8);
  }
  // TR-12b: the Barrow Warden is a live creature now (creatures.ts), no longer the arena's idle golem
  k.flush();
}
