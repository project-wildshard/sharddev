// A species' declarative clip rows, as the SDK defines them (SHARD-AUTHORING SA12). They are data: the engine plays them
// (game/plugin/animation `playClips`); `test/sdk-engine-types.test.ts` keeps each type equal to the engine's.

/** The clocks a clip factor reads: the animal's time (s) or its gait phase (0..1, advanced from the ground speed). */
export type ClipClock = 't' | 'phase';

/** When a clip case or term applies. Every key present must hold. */
export interface ClipWhen {
  /** true: only while alive; false: only once dead. */
  readonly alive?: boolean;
  /** Only while an attack plays (`attack ≥ 0`). */
  readonly attacking?: boolean;
  /** Only while `deathT` is above this (the collapse has begun). */
  readonly deathAbove?: number;
  /** A `mem` number (absent reads 0) compared with `above` (>) and / or `atLeast` (≥). */
  readonly mem?: { readonly key: string; readonly above?: number; readonly atLeast?: number };
}

/** One factor of a clip term. A bare number is a constant. */
export type ClipFactor =
  | number
  /** `sin(clock × rate + offset)`, or its magnitude with `abs`. */
  | { readonly wave: ClipClock; readonly rate: number; readonly offset?: number; readonly abs?: boolean }
  /** The clock itself (a spin: `t` × a rate factor). */
  | { readonly clock: ClipClock }
  /** A number the species' brain keeps in `mem` (absent reads 0). */
  | { readonly mem: string }
  /** Sum in authored order, cap with max then min, then divide (never multiply by a reciprocal). */
  | { readonly bounded: readonly ClipTerm[]; readonly min?: number; readonly max?: number; readonly divide?: number }
  /** The attack's progress 0..1, × `rate` and capped at `max` when given (pair it with a term `when: { attacking: true }`). */
  | { readonly attack: true; readonly rate?: number; readonly max?: number }
  /** A gait weight: `min(1, |speed| / full)`, × (`speed > run` ? `fast` : `slow`) when `run` is given. One value. */
  | { readonly gait: number; readonly run?: number; readonly fast?: number; readonly slow?: number }
  /** The death collapse, `deathT` clamped to 0..1. */
  | { readonly death: true }
  /** 1 while alive, 0 once dead. */
  | { readonly living: true };

/** One term of a clip sum: a constant, or the product of its factors (only when `when` holds; else +0). */
export type ClipTerm = number | { readonly when?: ClipWhen; readonly of: readonly ClipFactor[] };

/** One case of a clip row: the first whose `when` holds sets the channel to the sum of `sum` (an empty sum is 0). */
export interface ClipCase { readonly when?: ClipWhen; readonly sum: readonly ClipTerm[] }

/** The bone channels a clip row drives. `scale` sets all three axes. */
export type ClipChannel = 'rotation.x' | 'rotation.y' | 'rotation.z' | 'position.x' | 'position.y' | 'position.z' | 'scale';

/** One clip row: a bone's channel and its cases in priority order, or an eased `mem` scratch channel. */
export type ClipRow = {
  readonly bone: string;
  readonly channel: ClipChannel;
  /** The `mem` key that keeps the bone's bind value; the sum then starts from it. */
  readonly bind?: string;
  readonly cases: readonly ClipCase[];
} | {
  /** Ordered scratch channel; later rows observe its newly eased value even when a rig bone is absent. */
  readonly mem: string;
  /** old + (target - old) * min(1, dt * ease), with an absent old value read as zero. */
  readonly ease: number;
  readonly cases: readonly ClipCase[];
};

/** A species' declarative clips (SHARD-PLATFORM M3): its rows, played in order every frame. */
export type SpeciesClips = readonly ClipRow[];
