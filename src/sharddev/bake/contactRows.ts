import * as v from 'valibot';
import { readColliderRows, poseOf, placeCollider } from '@wildshard/engine/models/colliders';
import type { AuthorPlacement, ColliderDesc, ContactSurface } from './placement';

const finite = v.pipe(v.number(), v.finite());
const Vec = v.strictObject({ x: finite, y: finite, z: finite });

const sourceSchemas: (surfaces: readonly ContactSurface[]) => { Surface: v.PicklistSchema<readonly ContactSurface[], undefined>; Collider: v.VariantSchema<"kind", [v.StrictObjectSchema<{ readonly hx: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly hy: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly hz: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly yaw: v.ExactOptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly rot: v.ExactOptionalSchema<v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly w: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>, undefined>; readonly surface: v.ExactOptionalSchema<v.PicklistSchema<readonly ContactSurface[], undefined>, undefined>; readonly kind: v.LiteralSchema<"box", undefined>; }, undefined>, v.StrictObjectSchema<{ readonly halfHeight: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly radius: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly yaw: v.ExactOptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly rot: v.ExactOptionalSchema<v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly w: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>, undefined>; readonly surface: v.ExactOptionalSchema<v.PicklistSchema<readonly ContactSurface[], undefined>, undefined>; readonly kind: v.LiteralSchema<"capsule", undefined>; }, undefined>, v.StrictObjectSchema<{ readonly radius: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly yaw: v.ExactOptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly rot: v.ExactOptionalSchema<v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly w: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>, undefined>; readonly surface: v.ExactOptionalSchema<v.PicklistSchema<readonly ContactSurface[], undefined>, undefined>; readonly kind: v.LiteralSchema<"ball", undefined>; }, undefined>, v.StrictObjectSchema<{ readonly points: v.ArraySchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly yaw: v.ExactOptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly rot: v.ExactOptionalSchema<v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly w: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>, undefined>; readonly surface: v.ExactOptionalSchema<v.PicklistSchema<readonly ContactSurface[], undefined>, undefined>; readonly kind: v.LiteralSchema<"hull", undefined>; }, undefined>, v.StrictObjectSchema<{ readonly vertices: v.ArraySchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly indices: v.ArraySchema<v.SchemaWithPipe<readonly [v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, v.IntegerAction<number, undefined>, v.MinValueAction<number, 0, undefined>]>, undefined>; readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly yaw: v.ExactOptionalSchema<v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, undefined>; readonly rot: v.ExactOptionalSchema<v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly w: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>, undefined>; readonly surface: v.ExactOptionalSchema<v.PicklistSchema<readonly ContactSurface[], undefined>, undefined>; readonly kind: v.LiteralSchema<"trimesh", undefined>; }, undefined>, v.StrictObjectSchema<{ readonly kind: v.LiteralSchema<"treads", undefined>; readonly from: v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>; readonly to: v.StrictObjectSchema<{ readonly x: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly y: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly z: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; }, undefined>; readonly width: v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>; readonly count: v.SchemaWithPipe<readonly [v.SchemaWithPipe<readonly [v.NumberSchema<undefined>, v.FiniteAction<number, undefined>]>, v.IntegerAction<number, undefined>, v.MinValueAction<number, 1, undefined>]>; readonly surface: v.ExactOptionalSchema<v.PicklistSchema<readonly ContactSurface[], undefined>, undefined>; }, undefined>], undefined>; } = (surfaces: readonly ContactSurface[]) => {
  const Surface = v.picklist(surfaces);
  const Placed = { x: finite, y: finite, z: finite, yaw: v.exactOptional(finite), rot: v.exactOptional(v.strictObject({ x: finite, y: finite, z: finite, w: finite })), surface: v.exactOptional(Surface) };
  const Collider = v.variant('kind', [
    v.strictObject({ kind: v.literal('box'), ...Placed, hx: finite, hy: finite, hz: finite }),
    v.strictObject({ kind: v.literal('capsule'), ...Placed, halfHeight: finite, radius: finite }),
    v.strictObject({ kind: v.literal('ball'), ...Placed, radius: finite }),
    v.strictObject({ kind: v.literal('hull'), ...Placed, points: v.array(finite) }),
    v.strictObject({ kind: v.literal('trimesh'), ...Placed, vertices: v.array(finite), indices: v.array(v.pipe(finite, v.integer(), v.minValue(0))) }),
    v.strictObject({ kind: v.literal('treads'), from: Vec, to: Vec, width: finite, count: v.pipe(finite, v.integer(), v.minValue(1)), surface: v.exactOptional(Surface) }),
  ]);
  return { Surface, Collider };
};

/** Exact recorded contact grammar for an explicit authored surface vocabulary. */
export type SourceColliderSchemas = ReturnType<typeof sourceSchemas>;
/** Build strict recorded shapes without creating a collider, registry or physics world. */
export function sourceColliderSchemas(surfaces: readonly ContactSurface[]): SourceColliderSchemas { return sourceSchemas(surfaces); }
/** One admitted source shape; numeric buffers remain ordinary owned arrays. */
export type SourceCollider = v.InferOutput<SourceColliderSchemas['Collider']>;

/** A captured author registry piece, before any runtime registration or resource borrowing. */
export interface RecordedPhysicsPiece {
  id: string; name: string; category: string; file: string; colliders: SourceCollider[]; active: boolean;
  surface?: ContactSurface; colliderOwner?: string;
  follows?: { matrix: number[]; rotation: boolean } | undefined;
}
/** Admit recorded world-frame pieces with the exact identity-frame rule for followed pieces. */
export function recordedPhysicsPieces(input: unknown, surfaces: readonly ContactSurface[]): RecordedPhysicsPiece[] {
  const { Surface, Collider } = sourceColliderSchemas(surfaces);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return v.parse(v.array(v.strictObject({ id: v.string(), name: v.string(), category: v.string(), file: v.string(),
    colliders: v.array(Collider), active: v.boolean(), surface: v.exactOptional(Surface), colliderOwner: v.exactOptional(v.string()),
    follows: v.optional(v.strictObject({ matrix: v.pipe(v.array(finite),
      v.check(matrix => matrix.length === 16 && matrix.every((value, index) => value === identity[index]), 'a baked followed piece rests at the world frame')),
    rotation: v.boolean() })) })), input);
}
/** Admit finite recorded points with strict coordinate ownership. */
export function recordedPhysicsPoints(input: unknown): { x: number; y: number; z: number }[] { return v.parse(v.array(Vec), input); }
/** Admit source contacts, optionally requiring the exact original recorded count. */
export function recordedColliderRows(input: unknown, surfaces: readonly ContactSurface[], length?: number): SourceCollider[] {
  const schema = v.array(sourceColliderSchemas(surfaces).Collider);
  if (length === undefined) return v.parse(schema, input);
  if (!Number.isSafeInteger(length) || length < 0) throw new Error('Invalid recorded contact count');
  return v.parse(v.pipe(schema, v.length(length)), input);
}

/** Explicit authored shape/surface vocabulary, enforced before any geometry lane is borrowed. */
export interface AuthorContactPolicy {
  readonly kinds: readonly ColliderDesc['kind'][];
  readonly surfaces: readonly ContactSurface[];
  readonly requireSurface?: boolean;
}

/** Admit fresh bounded contact rows with the native strict grammar and owned numeric lane copies. */
export function admitContactRows(rows: readonly unknown[], policy: AuthorContactPolicy): ColliderDesc[] {
  return readColliderRows(rows, policy);
}

/** Compile an ordered contact batch at one authored pose using the native matrix/quaternion/scale law. */
export function placeContactRows(rows: readonly ColliderDesc[], placement: AuthorPlacement<object>): ColliderDesc[] {
  const pose = poseOf(placement);
  return rows.map(row => placeCollider(row, pose));
}

/** Compile authored stair contacts with the native block order and exact arithmetic.
 * This returns data only; registration, Rapier shapes and collision queries remain engine-owned. */
export function treadBoxRows(d: Extract<ColliderDesc, { kind: 'treads' }>): Extract<ColliderDesc, { kind: 'box' }>[] {
  const dx = d.to.x - d.from.x, dz = d.to.z - d.from.z, run = Math.hypot(dx, dz) / d.count, rise = (d.to.y - d.from.y) / d.count;
  const yaw = Math.atan2(dx, dz);
  const out: Extract<ColliderDesc, { kind: 'box' }>[] = [];
  for (let i = 0; i < d.count; i++) {
    const f = (i + 0.5) / d.count, top = d.from.y + rise * (i + 1), hy = Math.max(0.01, (top - d.from.y) / 2);
    out.push({ kind: 'box', x: d.from.x + dx * f, y: d.from.y + hy, z: d.from.z + dz * f, hx: d.width / 2, hy, hz: run / 2, yaw, ...(d.surface === undefined ? {} : { surface: d.surface }) });
  }
  return out;
}
