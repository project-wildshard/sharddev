// T1's formats (WORLDCLAW-SHARD T1, R15, D87): a shard's machine twin `src/shards/<slug>/design/spec.json` and the machine
// block of its human twin `design.md`. `spec.json` owns the numbers (coordinates, terrain, budgets); the machine block owns
// the ids and the intent (roles, beats, the quest, the slice). spec-check and twin-check (T1's checks, after the formats:
// D87) read both through these schemas.
//
// Coordinates: metres, x east, z south, the origin at the shard's centre, y up (the shard contract).
import * as v from 'valibot';

const Id = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lower-case kebab'));
const XZ = v.strictTuple([v.number(), v.number()]);
/** a route point with its height: a lift or a stair climbs at (nearly) the same x, z (MC33, reopened by D91) */
const XYZ = v.strictTuple([v.number(), v.number(), v.number()]);

/** Place roles (06 §10.2's required roles are a subset: spawn, hub, landmark, boss). */
export const ROLES = ['spawn', 'hub', 'landmark', 'objective', 'arena', 'boss', 'secret', 'vista', 'camp', 'traversal', 'discovery'] as const;
/** Route leg modes: how the player moves on the leg (the eye paths of R11). */
export const LEG_MODES = ['walk', 'climb', 'ride', 'glide', 'swim', 'grapple', 'zipline', 'rope', 'sled', 'hover', 'stair', 'lift'] as const;
/** the leg modes whose points must carry their height ([x, y, z]); any other leg may */
export const VERTICAL_LEGS: readonly string[] = ['stair', 'lift'];

const Leg = v.pipe(
  v.strictObject({ mode: v.picklist(LEG_MODES), pts: v.pipe(v.array(v.union([XZ, XYZ])), v.minLength(2)) }),
  v.check((l) => !VERTICAL_LEGS.includes(l.mode) || l.pts.every((p) => p.length === 3), 'a stair or lift leg gives every point as [x, y, z]'),
);

export const SpecSchema = v.strictObject({
  version: v.literal(1),
  slug: Id,
  /** the map's side in metres */
  size: v.pipe(v.number(), v.minValue(1)),
  /** E1's cube: how far the world reaches below and above y = 0 */
  extent: v.optional(v.strictObject({ below: v.number(), above: v.number() })),
  /** the terrain's height range (from the extent) */
  heightRange: v.tuple([v.number(), v.number()]),
  catalogMode: v.picklist(['kit', 'generated', 'mixed']),
  regions: v.array(v.strictObject({
    id: Id, color: v.pipe(v.string(), v.hexColor()), walkable: v.boolean(), base: v.optional(v.number()), desc: v.string(),
  })),
  places: v.array(v.strictObject({
    id: Id, role: v.picklist(ROLES), x: v.number(), z: v.number(), y: v.optional(v.number()),
    /** the place's radius in metres */
    r: v.pipe(v.number(), v.minValue(0)),
    region: v.optional(Id),
  })),
  routes: v.array(v.strictObject({
    id: Id,
    legs: v.pipe(v.array(Leg), v.minLength(1)),
  })),
  /** the entry roads to the neighbouring shards, one per edge (D67) */
  gates: v.array(v.strictObject({ edge: v.picklist(['N', 'E', 'S', 'W']), x: v.number(), z: v.number(), to: v.optional(v.string()) })),
  happenings: v.array(v.strictObject({ id: Id, x: v.number(), z: v.number(), signal: v.string(), seenFrom: v.array(Id) })),
  /** traversal slots (a rope, a sled lane, a grapple point) and the views a player approaches them from */
  slots: v.array(v.strictObject({ id: Id, kind: v.string(), x: v.number(), z: v.number(), approachViews: v.array(Id) })),
  /** the summed estimates the budget gate checks (R28); filled by the catalog (P11) */
  budgets: v.optional(v.strictObject({ tris: v.number(), gpuMB: v.number() })),
});
export type Spec = v.InferOutput<typeof SpecSchema>;

/** The machine block of design.md: one fenced ```json worldclaw block (R15, as amended by L1: JSON, not YAML, so the checks
 * need no parser beyond JSON). It carries every id twin-check compares and the intent spec.json does not hold. */
export const MachineSchema = v.pipe(v.strictObject({
  slug: Id,
  /** `full`: a WorldClaw run's shard, the only kind the dispatches resume (MC47). `slice`: a director's single stage on
   * any shard (D91; spec-check --scope slice, 06 §10.2); it has no `run` and is never resumed. */
  scope: v.picklist(['full', 'slice']),
  places: v.array(v.strictObject({ id: Id, role: v.picklist(ROLES), name: v.string(), beat: v.string() })),
  happenings: v.array(v.strictObject({ id: Id, name: v.string(), seenFrom: v.array(Id) })),
  npcs: v.array(v.strictObject({ id: Id, name: v.string(), place: Id })),
  enemyZones: v.array(v.strictObject({ id: Id, species: v.string(), place: Id })),
  elites: v.array(v.strictObject({ id: Id, species: v.string(), place: Id })),
  boss: v.nullable(v.strictObject({ id: Id, name: v.string(), place: Id, summon: v.string() })),
  /** a step at a place names it; a step between places (a crossing, a lane) has `place: null` and says where in words */
  quest: v.array(v.strictObject({ n: v.number(), id: Id, title: v.string(), place: v.nullable(Id), where: v.optional(v.string()), gets: v.string(), mechanics: v.array(Id) })),
  routes: v.array(v.strictObject({ id: Id, legs: v.array(v.picklist(LEG_MODES)) })),
  gates: v.array(v.picklist(['N', 'E', 'S', 'W'])),
  /** the session slice: place ids in play order */
  slice: v.array(Id),
  /** the run's state (§run's `step` is `stage`, one value); a full scope only */
  run: v.optional(v.strictObject({ mode: v.picklist(['guided', 'zero-shot']), stage: v.string(), until: v.optional(v.string()) })),
}), v.check((m) => (m.scope === 'full') === (m.run !== undefined), 'a full scope has a run; a slice has none'));
export type Machine = v.InferOutput<typeof MachineSchema>;

/** The machine block's JSON, read from a design.md. */
export function machineBlock(designMd: string): unknown {
  const m = /```json worldclaw\n([\s\S]*?)\n```/.exec(designMd);
  if (!m?.[1]) throw new Error('design.md has no ```json worldclaw block');
  return JSON.parse(m[1]);
}

export function parseSpec(json: unknown): Spec {
  return v.parse(SpecSchema, json);
}

export function parseMachine(json: unknown): Machine {
  return v.parse(MachineSchema, json);
}
