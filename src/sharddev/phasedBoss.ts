// A phased boss fight's rows, as the SDK defines them (SHARD-AUTHORING SA12): the fixed-arena row (SF27) and the roaming
// row, both data. The engine runs them (game/plugin/bossPhase); `test/sdk-engine-types.test.ts` keeps each row type equal to
// the engine's, so a drift in either fails the test.
import { phasedBossFight as platformFight, type PhasedBossBody as PlatformBody, type PhasedBossFight as PlatformFight, type PhasedBossPorts as PlatformPorts,
  type RoamingBossBody as MobileBody, type RoamingBossPorts as MobilePorts, type RoamingBossFight as MobileFight } from '@wildshard/engine/game/plugin/bossPhase';

/** A declared view call as data: the view's name and its numeric arguments (`['arena.shaft', 0, 0.38]`). */
export type BossViewCall = readonly [string, ...number[]];
/** The shard's view bindings: one function per declared view name, numeric arguments only (positions are world space). */
export type BossViewBinding = Readonly<Record<string, (...args: number[]) => void>>;

/** What a mode change does, applied in this order: the mode clock, the attack cancel, memory, yaw, motion, hp lock, views, adds, cooldowns, a feed line. */
export interface BossEffect {
  /** The new mode's clock (default 0). */
  readonly modeT?: number;
  /** Cancel the attack in progress (the act field drops to 0 with it when `mem` says so). */
  readonly cancel?: boolean;
  /** Memory fields written on the body (the body's animation reads them). */
  readonly mem?: Readonly<Record<string, number>>;
  /** Snap the body's yaw. */
  readonly yaw?: number;
  /** The body's motion: yaw, speed, turn rate. */
  readonly motion?: readonly [number, number, number];
  /** Lock hp where it stands (shielded modes and beats restore it every tick). */
  readonly lockHp?: boolean;
  /** View calls. */
  readonly views?: readonly BossViewCall[];
  /** Spawn a wave of adds. */
  readonly wave?: boolean;
  /** Cooldowns set. */
  readonly cooldowns?: Readonly<Record<string, number>>;
  /** A feed line. */
  readonly line?: string;
}

/** A mode's motion in the 10 Hz think: hold still, fight (attacks then chase), face the player or a yaw, or walk to a spot. */
export type BossMotion =
  | { readonly kind: 'hold' }
  | { readonly kind: 'fight' }
  | { readonly kind: 'face'; readonly yaw?: number; readonly turn: number }
  | { readonly kind: 'goto'; readonly spot: 'shield'; readonly speed: number; readonly turn: number; readonly arrive: number; readonly roarTurn: number; readonly next: string };

/** A mode's timed beat: after `seconds` in the mode (and only in `phase` when given), go to `to` with `effect`. */
export interface BossTimeout { readonly seconds: number; readonly to: string; readonly phase?: number; readonly effect?: BossEffect }

/** One mode of the fight's state machine. */
export interface BossModeRow {
  /** Damage taken: 0 = immune, 1 = normal, above 1 = a soft opening (a stun). */
  readonly damage: number;
  /** The bar shimmers and hp is locked every tick. */
  readonly shielded: boolean;
  /** The body looks at the player (1) or not (0). */
  readonly look: number;
  /** The mode drives the body's glow (the intro's modes leave it to the intro). */
  readonly glows: boolean;
  readonly motion: BossMotion;
  readonly timeouts?: readonly BossTimeout[];
  /** Entering the mode through `enter` (a goto's arrival, a resume) applies this. */
  readonly enter?: BossEffect;
}

/** A cut in a combo: its damage, reach multiplier, arc half-width (rad), the shove on a hit, and whether its arc is painted. */
export interface BossCutRow { readonly damage: number; readonly reachMul: number; readonly arc: number; readonly shove: number; readonly painted: boolean }

/** The fight's attack patterns (strike rows), tried in order each think: the burst, then the combo, else the chase. Pairs are [normal, enraged]. */
export interface BossAttackRows {
  /** The charged burst: its act id, range (min, max m), wind-up seconds, the fraction it fires at, how many rings, the cooldown after (base + rng × spread). */
  readonly burst: {
    readonly act: number; readonly min: number; readonly max: number; readonly seconds: readonly [number, number]; readonly fireAt: number;
    readonly rings: readonly [number, number]; readonly after: readonly [readonly [number, number], readonly [number, number]]; readonly comboFloor: number;
    readonly lines: readonly [string, string];
  };
  /** The combo: its act id, reach (m), how far past reach it engages, the cuts (count per stance), wind-up seconds per cut, contact fraction, chain range past reach, rest after. */
  readonly combo: {
    readonly act: number; readonly reach: number; readonly engage: number; readonly count: readonly [number, number]; readonly seconds: readonly [number, number];
    readonly hitAt: number; readonly chain: number; readonly rest: readonly [number, number]; readonly cuts: readonly BossCutRow[]; readonly above: number;
  };
  /** Committed attacks turn slowly through the wind-up (`turn[0]` before `windup`), barely through the cut. */
  readonly commit: { readonly windup: number; readonly turn: readonly [number, number] };
  /** The chase between attacks: stop distance, speed per stance, turn rate. */
  readonly chase: { readonly stop: number; readonly speed: readonly [number, number]; readonly turn: number };
}

/** A phase change's roar: its act id and length, and a memory field it sheds (fades 1 → 0 past `from` at `rate`/s, 0 at the end). */
export interface BossRoarRow { readonly act: number; readonly seconds: number; readonly shed?: { readonly field: string; readonly from: number; readonly rate: number } }

/** One phase: its hp share at the checkpoint, its memory at reset, how a fight resumed at it begins, and what entering it does. */
export interface BossPhaseRow {
  readonly at: number;
  /** Memory written at a reset to this checkpoint. */
  readonly mem?: Readonly<Record<string, number>>;
  /** A fight resumed at this checkpoint: placed at the shield spot and entering `mode`, its memory, the sweep started. */
  readonly resume?: { readonly shieldSpot?: boolean; readonly mode?: string; readonly mem?: Readonly<Record<string, number>>; readonly sweep?: boolean };
  /** Entering this phase mid-fight. */
  readonly enter?: {
    readonly roar?: BossRoarRow; readonly line?: string; readonly mode: string; readonly modeT: number; readonly views?: readonly BossViewCall[];
    readonly pourDelay?: number; readonly pourStop?: boolean; readonly sweep?: boolean; readonly crownReset?: boolean; readonly lineFirst?: boolean;
    readonly cooldowns?: Readonly<Record<string, number>>;
  };
}

/** The expanding ring hazard (a burst's): start radius, gap between rings (s), speed (m/s), last radius, contact band, jump clearance, damage, push. */
export interface BossRingRow {
  readonly count: number; readonly start: number; readonly gap: number; readonly speed: number; readonly max: number; readonly band: number;
  readonly jump: number; readonly damage: number; readonly push: number; readonly pushTime: number; readonly strike: string;
}
/** The timed pour hazard: its spots (arena-local), the phase it runs in, the pick interval, tell and pour lengths, fades, what it piles, how it hurts. */
export interface BossPourRow {
  readonly spots: readonly { readonly x: number; readonly z: number }[]; readonly phase: number; readonly every: readonly [number, number];
  readonly tell: number; readonly pour: number; readonly fadeIn: number; readonly fadeOut: readonly [number, number];
  readonly pile: { readonly r: number; readonly rate: number; readonly cap: number };
  readonly hitRadius: number; readonly hitRate: number; readonly damage: number; readonly strike: string; readonly reset: number;
}
/** The sweeping beam hazard: its arc (radius, z squash, z offset, angular speed, limit, start), ease, what it hurts and how often, and its burn on the boss. */
export interface BossSweepRow {
  readonly radius: number; readonly squash: number; readonly offset: number; readonly speed: number; readonly limit: number; readonly start: number;
  readonly ease: number; readonly hitRadius: number; readonly damage: number; readonly every: number; readonly strike: string;
  readonly boss: { readonly damage: number; readonly every: number; readonly extra: number; readonly line: string };
}
/** Adds: their spots (arena-local, pushed out by `push` along x), the pairs that alternate, the shielded mode they guard, the reinforce wait, the retire delay and the beat when the last falls. */
export interface BossAddsRow {
  readonly spots: readonly { readonly x: number; readonly z: number; readonly yaw: number }[]; readonly push: number;
  readonly pairs: readonly [readonly number[], readonly number[]]; readonly mode: string; readonly reinforce: number; readonly retireAfter: number;
  readonly cleared: { readonly to: string; readonly effect: BossEffect };
}

/** A phased boss fight's row: everything but the views and the arena, as data. */
export interface PhasedBossRow {
  /** The arena's frame (world): every arena-local spot is relative to it. */
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  /** The body stays within ±`bounds` m of the origin. */
  readonly bounds: number;
  /** Its rest (arena-local): where it wakes, the floor there (plinth + lift above the origin), the rest box (half sizes less `inset`). */
  readonly rest: { readonly x: number; readonly z: number; readonly plinth: number; readonly lift: number; readonly halfW: number; readonly halfL: number; readonly inset: number; readonly focusY: number };
  /** Where it kneels to shield (arena-local). */
  readonly shieldSpot: { readonly x: number; readonly z: number };
  /** The phase from which it is enraged (the second of every pair). */
  readonly enragedFrom: number;
  readonly phases: readonly BossPhaseRow[];
  readonly modes: Readonly<Record<string, BossModeRow>>;
  /** The modes the fight starts, rises, fights and dies in. */
  readonly modeNames: { readonly rest: string; readonly rising: string; readonly fight: string; readonly dead: string };
  readonly attacks: BossAttackRows;
  /** The memory fields the fight drives: the attack's act, the cut's index, its hit latch, the floor height, the smoothed floor, the rise and the pose. */
  readonly fields: { readonly act: string; readonly strike: string; readonly hitDone: string; readonly floorY: string; readonly floorS: string; readonly rise: string; readonly pose: string };
  /** The reset: memory, cooldowns (base + rng × spread for `burst`), the drifts piled from `drifts.fromPhase`, the view calls. */
  readonly reset: {
    readonly mem: Readonly<Record<string, number>>; readonly combo: number; readonly burst: readonly [number, number]; readonly pourDelay: number;
    readonly drifts: { readonly fromPhase: number; readonly height: number; readonly cap: number; readonly at: readonly (readonly [number, number, number])[] };
    readonly views: readonly BossViewCall[]; readonly glow: number;
  };
  /** The intro (long, short): the lid's window, the rise's window, the shaft's pulse length; the shaft and the glow's waking. */
  readonly intro: {
    readonly long: { readonly lid: readonly [number, number]; readonly rise: readonly [number, number]; readonly pulse: number };
    readonly short: { readonly lid: readonly [number, number]; readonly rise: readonly [number, number]; readonly pulse: number };
    readonly shaft: { readonly index: number; readonly base: number; readonly amp: number };
    readonly glow: { readonly base: number; readonly peak: number; readonly lead: number; readonly fade: number };
  };
  /** The fight begins: memory, cooldowns (burst base + rng × spread), view calls, the resting glow. */
  readonly begin: { readonly mem: Readonly<Record<string, number>>; readonly combo: number; readonly burst: readonly [number, number]; readonly views: readonly BossViewCall[] };
  /** The glow: resting, the glint's and charge's weights and fades, the enraged burn. */
  readonly glow: { readonly base: number; readonly glint: number; readonly charge: number; readonly glintFade: number; readonly chargeFade: number; readonly burn: readonly [number, number, number] };
  /** Damage: the head sphere (radius × scale + pad), the armour melee breaks (range, hits, ranged share until broken, line). */
  readonly hits: { readonly head: readonly [number, number]; readonly armour: { readonly melee: number; readonly breaks: number; readonly ranged: number; readonly line: string } };
  /** A weak point worn by headshots from `fromPhase`: its hp, the memory field it lives on, the beat when it breaks. */
  readonly crown: { readonly hp: number; readonly fromPhase: number; readonly field: string; readonly to: string; readonly effect: BossEffect };
  readonly rings: BossRingRow;
  readonly pour: BossPourRow;
  readonly sweep: BossSweepRow;
  readonly adds: BossAddsRow;
  /** The victory: its view calls, when the body crumbles (s) and how fast the arena drains. */
  readonly victory: { readonly views: readonly BossViewCall[]; readonly crumble: number; readonly drain: number };
  /** Every view name the fight may call (the binding must bind exactly these). */
  readonly views: readonly string[];
}

/** One phase's movement, openings, summons and arena changes. */
export interface RoamingBossPhase {
  readonly at: number; readonly beginMode: string; readonly chaseSpeed: number; readonly recoverySeconds: number;
  readonly burstCooldown: number; readonly summons: boolean; readonly rings: number; readonly darkness: boolean;
  readonly enter?: { readonly mode: string; readonly drop?: boolean; readonly summonDelay?: number; readonly resetChain?: boolean; readonly roar?: boolean };
}
/** A stance's policy and damage rule; mode names are authored, not interpreted as content identities. */
export interface RoamingBossMode {
  readonly kind: 'idle'|'intro'|'pursue'|'strike'|'burst'|'wait-rings'|'recover'|'summon'|'lanes'|'dead';
  readonly damage: number;
}
/** Roaming encounters use authored strike clocks, lane chains, falling hazards and roaming adds on the same phasedBoss entry. */
export interface RoamingBossRow<K extends string, A extends string, Q extends string> {
  /** Admitted guest fields; the arena owner applies requests without selecting actions. */
  readonly decision: { readonly mode: string; readonly request: string; readonly rings: string; readonly adds: string; readonly lane: string;
    readonly phase: string; readonly fight: string; readonly modeT: string; readonly strikeCd: string; readonly burstCd: string; readonly summonCd: string; readonly chain: string; readonly modes: readonly string[] };
  readonly kind: 'roaming'; readonly origin: { readonly x: number; readonly z: number };
  readonly phases: readonly RoamingBossPhase[]; readonly modes: Readonly<Record<string, RoamingBossMode>>;
  readonly names: { readonly idle: string; readonly intro: string; readonly dead: string; readonly pursue: string; readonly strike: string; readonly burst: string; readonly wait: string; readonly recover: string; readonly summon: string };
  readonly arena: { readonly entry: number; readonly wall: number; readonly fog: number; readonly leash: number; readonly wallPad: number; readonly clampPad: number; readonly shoveBase: number; readonly shoveGain: number; readonly shoveDistance: number; readonly shoveSpan: number; readonly epsilon: number };
  readonly seal: { readonly inSeconds: number; readonly outSeconds: number; readonly darkIn: number; readonly darkOut: number };
  readonly opening: { readonly mode: string; readonly lanesMode: string; readonly inRate: number; readonly outRate: number; readonly inactiveRate: number };
  readonly damage: { readonly invulnerable: number; readonly weakOpen: number; readonly weakClosed: number; readonly opening: number };
  readonly initial: { readonly strikeCd: number; readonly burstCd: number; readonly summonCd: number };
  readonly recoveryTurn: number;
  readonly reset: { readonly glow: number; readonly strikeCd: number; readonly burstCd: number; readonly summonCd: number; readonly herd: number };
  readonly intro: { readonly short: number; readonly long: number; readonly glowStart: number; readonly glowEnd: number; readonly lookEnd: number; readonly roarAt: number; readonly crossingStep: number; readonly absentHeight: number };
  readonly begin: { readonly glow: number; readonly summonDelay: number }; readonly victoryGlow: number;
  readonly points: { readonly rewardZ: number; readonly rewardY: number; readonly respawnZ: number; readonly respawnYaw: number };
  readonly strike: { readonly id: string; readonly clip: { readonly duration: number; readonly hitPhase: number }; readonly action: A; readonly reach: number; readonly chaseNear: number; readonly chaseTurn: number; readonly turn: number; readonly radius: number; readonly cooldown: number; readonly tell: readonly [number,number,number,number,number]; readonly trauma: number; readonly contactTrauma: number };
  readonly burst: { readonly clip: { readonly duration: number; readonly hitPhase: number }; readonly action: A; readonly after: number; readonly turn: number; readonly radius: number; readonly tell: readonly [number,number,number,number,number]; readonly trauma: number };
  readonly rings: { readonly gap: number; readonly speed: number; readonly trauma: number; readonly strike: string };
  readonly summon: { readonly clip: { readonly duration: number; readonly hitPhase: number }; readonly action: A; readonly count: number; readonly limit: number; readonly cooldown: number; readonly turn: number };
  readonly lanes: { readonly stop: number; readonly speed: number; readonly turn: number; readonly burstRange: number; readonly after: number; readonly tell: number; readonly action: A; readonly batch: number; readonly rest: number; readonly chainRest: number; readonly soundTicks: number; readonly trauma: number };
  readonly adds: { readonly kinds: readonly K[]; readonly radius: number; readonly far: number; readonly near: number; readonly fast: number; readonly slow: number; readonly turn: number; readonly chargeRange: number; readonly rate: number; readonly tell: number; readonly trauma: number; readonly leashPad: number };
  readonly hazards: { readonly count: number; readonly angleStart: number; readonly angleStep: number; readonly angleOffset: number; readonly radius: number; readonly radiusStep: number; readonly fallSeconds: number; readonly every: number; readonly damage: number; readonly strike: string; readonly fromPhase: number };
  readonly sounds: { readonly intro: Q; readonly roar: Q; readonly burst: Q; readonly add: Q; readonly charge: Q };
}

/**
 * A phased boss fight from its row (SF27): a declared state machine of modes with timed beats, strike rows, invulnerability
 * windows, adds and arena hazards, view-free; the shard binds the named views and lends its arena. The ports, bodies and
 * fight it returns are the engine's runtime types (game/plugin/bossPhase), not author data.
 */
export function phasedBossFight<B extends MobileBody,L,R,K extends string,A extends string,Q extends string>(row: RoamingBossRow<K,A,Q>,ports: MobilePorts<B,L,R,K,A,Q>): MobileFight<B,L,R>;
/** Run the fixed-arena phase, combo and hazard policy. */
export function phasedBossFight<B extends PlatformBody>(row: PhasedBossRow, ports: PlatformPorts<B>): PlatformFight<B>;
export function phasedBossFight<B extends PlatformBody,C extends MobileBody,L,R,K extends string,A extends string,Q extends string>(row: PhasedBossRow|RoamingBossRow<K,A,Q>,ports: PlatformPorts<B>|MobilePorts<C,L,R,K,A,Q>): PlatformFight<B>|MobileFight<C,L,R> {
  if('kind' in row && 'random' in ports)return platformFight(row,ports);
  if('kind' in row || 'random' in ports)throw new Error('Phased boss row/host policy mismatch');
  return platformFight(row,ports);
}
