// Mossgate Hollow's base: the yard's layout (`LAYOUT`), the ground's height and colour over the whole cell, and the pond's
// shape. Every scene file reads these; this file imports none of them (split from world.ts, MZ25).
import * as THREE from 'three';
import * as T from './textures';
import { regionRelief, regionTint, reliefShare } from './ground';
import { BARROW_RING, PLACES } from './layout';

/** MZ17: the barrow ring's centre, out on the Downs (layout.ts `downs.barrow`). */
const BARROW = PLACES.find((p) => p.id === 'downs.barrow') ?? { x: 0, z: 0 };

export const LAYOUT = {
  SPAWN: { x: 0.3, z: 1.8, yaw: 0.04 },
  HUT: { x: -4.0, z: -14.0, w: 5.2, d: 4.6, h: 2.5 }, // door face at z + d/2
  LAMPLIGHTER: { x: 1.3, z: -6.4 },
  SIGN: { x: -6.8, z: -8.8 },
  BRAZIERS: [[5.9, -12.8, 'A'], [-27.6, 0.2, 'B'], [9.6, -5.4, 'C']] as const,
  ROW: [[8.3, -12.8, 'B'], [10.7, -12.8, 'C']] as const,
  GATE: { x: -10, z: 0, half: 1.75 },
  POND: { x: -19.4, z: 0, hx: 6.6, hz: 5.4, r: 2.2 },
  /** MZ17: the barrow ring, moved out of the yard to the Downs; its arch on the west, toward the yard */
  ARENA: { x: BARROW.x, z: BARROW.z, r: BARROW_RING.r },
  ARCH: { x: BARROW.x - BARROW_RING.r, z: BARROW.z },
  /** the yard wall's east gap (where the arena's arch stood until MZ17) */
  EAST_GAP: { x: 16, z: -2 },
  YARD: { x0: -10, x1: 12.5, z0: -18.6, z1: 8 },
  /** SS9e: the touchable crate inside the yard gate (square to the axes: its body is fitted round its bounds) */
  CRATE: { x: -6.4, z: 1.9, yaw: 0 },
};

/** The quest state the static scene draws: every brazier cold, the bridge sunk. TR-12: what the player changes is a panel
 *  (play.ts): the flames, the moss gate's bars and the raised stones. */
export const STATE = { lit: '', bridgeUp: false };

export const noise = T.makeNoise(99);
export const sstep = THREE.MathUtils.smoothstep;
export type Materials = Record<string, THREE.MeshStandardMaterial>;
export type Textures = Record<string, THREE.Texture>;

/** Signed distance to the pond's rounded rectangle (negative inside). */
export function pondSDF(x: number, z: number): number {
  const { x: px, z: pz, hx, hz, r } = LAYOUT.POND;
  const qx = Math.abs(x - px) - hx + r, qz = Math.abs(z - pz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

export function groundHeight(x: number, z: number): number {
  let y = 0;
  const dp = pondSDF(x, z);
  if (dp < 0.6) y -= 1.1 * (1 - sstep(dp, -1.6, 0.6));
  const da = Math.hypot(x - LAYOUT.ARENA.x, z - LAYOUT.ARENA.z);
  if (da < LAYOUT.ARENA.r) y -= 0.35;
  // MZ10: past the yard the ground is the cell map's, each region its own relief (ground.ts); the yard floor, the cell's
  // edges and the entry roads' last 60 m stay at 0 (the cook walks 50 m lanes and the mesh interpolates between samples)
  const share = reliefShare(x, z);
  if (share > 0) y += share * regionRelief(x, z);
  return y;
}

/** The moss floor's colour, as the cleanroom's ground vertex colours times its moss texture's mean. */
export function groundColour(x: number, z: number): [number, number, number] {
  const v = noise.fbm(x * 0.07, z * 0.07, 4), w = noise.fbm(x * 0.018 + 9, z * 0.018 + 4, 3);
  const c = new THREE.Color().setRGB(0.96 + (v - 0.5) * 0.3, 0.98 + (v - 0.5) * 0.22, 0.86 + (w - 0.5) * 0.3);
  const dp = pondSDF(x, z);
  if (dp < 0.9) c.lerp(new THREE.Color(0.42, 0.38, 0.3), 1 - sstep(dp, -0.4, 0.9));
  const moss = new THREE.Color().setRGB(102 / 255, 120 / 255, 48 / 255, THREE.SRGBColorSpace);
  // MZ10, MZ24: each region's ground reads apart (the bog darker, the quarry stonier), across the region's whole floor;
  // only the height keeps to the roads' and edges' share (the tint never touches the cook's walk)
  const tint = regionTint(x, z), t = (k: number): number => tint[k] ?? 1;
  return [Math.min(1, c.r * moss.r * t(0)), Math.min(1, c.g * moss.g * t(1)), Math.min(1, c.b * moss.b * t(2))];
}
