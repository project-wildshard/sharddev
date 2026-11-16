import type * as THREE from 'three'

type EquipmentIcon = 'sword'
interface EquipmentTouchMap {
  melee: unknown
}
type WeaponId = 'sword' | 'sword-iron'

/** Numeric camera lag, bob and sway parameters, independent of a particular weapon model. */
export interface ViewmodelFeel {
  lag: {
    gain: number
    clampYaw: number
    clampPitch: number
    k: number
    c: number
    posYaw: number
    posPitch: number
  }
  bob: { x: number; y: number; rz: number; rx: number }
  sway: { ax: number; fx: number; ay: number; fy: number }
  fovHip: number
  portraitFov?: number
}
/** How the held melee model sits in the view: shrink, offset, tilt and yaw. */
export interface MeleeFraming {
  shrink: number
  dx: number
  dy: number
  tilt: number
  yaw: number
}
/** A held item's menu and HUD presentation. `icon`, `touch` and the slot are the host's declared vocabularies (the engine's
 * `EquipmentIconMap`, `EquipmentTouchMap` and `EquipmentSlotMap`, filled by declaration merging). */
export interface EquipmentUi {
  name: string
  icon: EquipmentIcon
  /** Magazine readouts offer touch reload; quivers keep their passive ammo chip. */
  ammo?: {
    label: string
    segments: number
    magazine?: boolean
    bagLabel?: string
    bagLabelFor?: string
  }
  inputContext?: string
  touch: keyof EquipmentTouchMap
  lockOn: boolean
  melee: boolean
  tracers: boolean
  /** The existing 24px swap glyph and short label; menu icons use the shared 64px icon library. */
  swapIcon: string
  swapName?: string
  huntersEye?: boolean
}
/**
 * Authored swept combo and view parameters; ordered contact rows are defined by the format's weaponProfiles module.
 * These are the authored fields of the engine's `combat/meleeProfile` `MeleeProfile`; its `pickup` factory is lent by
 * the runtime host and is not author data. `test/sdk-engine-types.test.ts` keeps the two assignable both ways.
 */
export interface MeleeProfile {
  id: `weapon.${string}` | `tool.${string}`
  legacySlot?: WeaponId
  ui: EquipmentUi
  meta: { name: string; icon: EquipmentIcon; blurb: string; category: string }
  /** Sound cues: fire, reload, impact, and the optional dry, hit, heavy and charge cues. */
  cues?: {
    fire: `cue.${string}`
    reload: `cue.${string}`
    impact: `cue.${string}`
    dry?: `cue.${string}`
    hit?: `cue.${string}`
    heavy?: `cue.${string}`
    charge?: Readonly<Record<string, `cue.${string}`>>
  }
  rangedFeel?: {
    kick: {
      body: number
      head: number
      kill: number
      side: number
      killSide: number
    }
    trauma: {
      kill: number
      head: number
      killKinds: readonly string[]
      headKinds: readonly string[]
    }
  }
  hitStop?: { body: number; head: number; kill: number }
  tags?: readonly `${string}.${string}`[]
  family: 'melee'
  parent?: string
  damage: number
  reach: number
  swingScale: number
  portraitPullX: number
  framing: MeleeFraming
  feel: ViewmodelFeel
  moves?: MeleeMoveSet
  cooldown: number
  comboGap: number
  chainLag: number
  heavyCharge: number
  chargeBlend: number
  lunge: {
    range: number
    heavyRange: number
    cone: number
    stop: number
    speed: number
    minTime: number
    maxTime: number
  }
  sweep: {
    rays: number
    extensions: readonly number[]
    step: number
    maxSamples: number
    maxHits: number
  }
  trail: { samples: number; subdivisions: number }
  dodgeKick: { kick: number; k: number; c: number }
  armFollow: number
}

/** An authored hand pose, independent of a live weapon controller. */
export interface MeleeKey {
  t: number
  pos: THREE.Vector3
  q: THREE.Quaternion
}
/** An authored blade trail. */
export interface MeleeTrail {
  from: number
  color: THREE.Color
  alpha: number
  inner: number
  life: number
}
/** A complete authored contact window and its three hand keys. */
export interface MeleeMove {
  name: 'slash' | 'backhand' | 'finisher' | 'heavy' | 'pass-left' | 'pass-right'
  keys: [MeleeKey, MeleeKey, MeleeKey]
  windup: number
  slashEnd: number
  total: number
  damage: number
  stagger: number
  sweep: number
  kick: { pitch: number; roll: number; fov?: number }
  hitStop: number
  reach?: number
  trail: MeleeTrail
}
/** Ordered poses for the generic melee view. */
export interface MeleeMoveSet {
  rest: MeleeKey
  charge: MeleeKey
  sprint: MeleeKey
  combo: MeleeMove[]
  heavy: MeleeMove
}
