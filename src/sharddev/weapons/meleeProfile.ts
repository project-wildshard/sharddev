import { SWORD_WOOD } from '@wildshard/engine/game/weapons/starterMeleeProfile';
import type { EquipmentIcon, EquipmentTouchMap, WeaponId } from '@wildshard/engine/combat/Equipment';
import * as THREE from 'three';
import { parse } from 'valibot';
import { MeleeWeaponProfileSchema, type MeleeWeaponProfileRows } from '@wildshard/format/weaponProfiles';

/** Numeric camera lag, bob and sway parameters, independent of a particular weapon model. */
export interface ViewmodelFeel {
  lag: { gain: number; clampYaw: number; clampPitch: number; k: number; c: number; posYaw: number; posPitch: number };
  bob: { x: number; y: number; rz: number; rx: number };
  sway: { ax: number; fx: number; ay: number; fy: number };
  fovHip: number; portraitFov?: number;
}
/** How the held melee model sits in the view: shrink, offset, tilt and yaw. */
export interface MeleeFraming { shrink: number; dx: number; dy: number; tilt: number; yaw: number }
/** A held item's menu and HUD presentation. `icon`, `touch` and the slot are the host's declared vocabularies (the engine's
 * `EquipmentIconMap`, `EquipmentTouchMap` and `EquipmentSlotMap`, filled by declaration merging). */
export interface EquipmentUi {
  name: string; icon: EquipmentIcon;
  /** Magazine readouts offer touch reload; quivers keep their passive ammo chip. */
  ammo?: { label: string; segments: number; magazine?: boolean; bagLabel?: string; bagLabelFor?: string };
  inputContext?: string;
  touch: keyof EquipmentTouchMap;
  lockOn: boolean; melee: boolean; tracers: boolean;
  /** The existing 24px swap glyph and short label; menu icons use the shared 64px icon library. */
  swapIcon: string; swapName?: string;
  huntersEye?: boolean;
}
/**
 * Authored swept combo and view parameters; ordered contact rows are defined by the format's weaponProfiles module.
 * These are the authored fields of the engine's `combat/meleeProfile` `MeleeProfile`; its `pickup` factory is lent by
 * the runtime host and is not author data. `test/sdk-engine-types.test.ts` keeps the two assignable both ways.
 */
export interface MeleeProfile {
  id: `weapon.${string}` | `tool.${string}`; legacySlot?: WeaponId;
  ui: EquipmentUi; meta: { name: string; icon: EquipmentIcon; blurb: string; category: string };
  /** Sound cues: fire, reload, impact, and the optional dry, hit, heavy and charge cues. */
  cues?: { fire: `cue.${string}`; reload: `cue.${string}`; impact: `cue.${string}`; dry?: `cue.${string}`; hit?: `cue.${string}`; heavy?: `cue.${string}`; charge?: Readonly<Record<string, `cue.${string}`>> };
  rangedFeel?: {
    kick: { body: number; head: number; kill: number; side: number; killSide: number };
    trauma: { kill: number; head: number; killKinds: readonly string[]; headKinds: readonly string[] };
  };
  hitStop?: { body: number; head: number; kill: number };
  tags?: readonly `${string}.${string}`[];
  family: 'melee'; parent?: string;
  damage: number; reach: number; swingScale: number;
  portraitPullX: number; framing: MeleeFraming; feel: ViewmodelFeel;
  moves?: MeleeMoveSet;
  cooldown: number; comboGap: number; chainLag: number; heavyCharge: number; chargeBlend: number;
  lunge: { range: number; heavyRange: number; cone: number; stop: number; speed: number; minTime: number; maxTime: number };
  sweep: { rays: number; extensions: readonly number[]; step: number; maxSamples: number; maxHits: number };
  trail: { samples: number; subdivisions: number };
  dodgeKick: { kick: number; k: number; c: number }; armFollow: number;
}

/** An authored hand pose, independent of a live weapon controller. */
export interface MeleeKey { t: number; pos: THREE.Vector3; q: THREE.Quaternion }
/** An authored blade trail. */
export interface MeleeTrail { from: number; color: THREE.Color; alpha: number; inner: number; life: number }
/** A complete authored contact window and its three hand keys. */
export interface MeleeMove {
  name: 'slash' | 'backhand' | 'finisher' | 'heavy' | 'pass-left' | 'pass-right';
  keys: [MeleeKey, MeleeKey, MeleeKey];
  windup: number; slashEnd: number; total: number;
  damage: number; stagger: number; sweep: number;
  kick: { pitch: number; roll: number; fov?: number };
  hitStop: number; reach?: number; trail: MeleeTrail;
}
/** Ordered poses for the generic melee view. */
export interface MeleeMoveSet { rest: MeleeKey; charge: MeleeKey; sprint: MeleeKey; combo: MeleeMove[]; heavy: MeleeMove }
/** Owned geometry returned by a held melee recipe. */
export interface MeleeRig {
  sword: THREE.BufferGeometry; arms: THREE.BufferGeometry; tipY: number; baseY: number; tipX?: number; material: THREE.Material;
  extras?: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  left?: { geometry: THREE.BufferGeometry; material: THREE.Material; pos: THREE.Vector3; q: THREE.Quaternion };
}

/** Admit an authored melee contact profile before constructing geometry or poses. */
export function parseMeleeWeaponProfile(input: unknown): MeleeWeaponProfileRows { return parse(MeleeWeaponProfileSchema, input); }

/** Build the original +Y blade direction followed by its local roll. */
export function meleeKey(t: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, roll: number): MeleeKey {
  const axis = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(dx, dy, dz).normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, roll));
  return { t, pos: new THREE.Vector3(px, py, pz), q };
}

/** Retain the held-model sRGB-to-linear paint law, including its optional gain. */
export function meleeColour(hex: number, gain = 1): THREE.Color { return new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(gain); }

/** A detached copy of the shared authored melee policy, including complete native poses.
 * Preserve original property order and every metadata field; restore owned rich
 * pose values after cloning plain state. No runtime view or owner is constructed. */
export function sharedMeleeAuthorBase(): MeleeProfile {
  const owned = structuredClone(SWORD_WOOD), native = SWORD_WOOD.moves;
  if (native === undefined) return owned;
  const moves = owned.moves;
  if (moves === undefined) throw new Error('Owned melee pose inventory is missing');
  type Moves = NonNullable<MeleeProfile['moves']>;
  const restoreKey = (target: Moves['rest'], source: Moves['rest']): void => {
    target.pos = source.pos.clone(); target.q = source.q.clone();
  };
  const restoreMove = (target: Moves['heavy'], source: Moves['heavy']): void => {
    for (const index of [0, 1, 2] as const) restoreKey(target.keys[index], source.keys[index]);
    target.trail.color = source.trail.color.clone();
  };
  restoreKey(moves.rest, native.rest); restoreKey(moves.charge, native.charge); restoreKey(moves.sprint, native.sprint);
  native.combo.forEach((move, index) => {
    const copy = moves.combo[index]; if (copy === undefined) throw new Error('Owned melee combo is missing');
    restoreMove(copy, move);
  });
  restoreMove(moves.heavy, native.heavy);
  return owned;
}
