import * as v from 'valibot';
import { isJsonData } from '@wildshard/format/json';

const id = v.pipe(v.string(), v.maxLength(128), v.regex(/^[a-z][a-z0-9.-]*$/u));
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const name = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.check((value) => value.trim() === value && Array.from(value).every((character) => {
  const point = character.codePointAt(0) ?? 0;
  return point >= 32 && point !== 127;
}) && !reserved.has(value), 'bounded literal glTF name'));
const glb = v.pipe(v.string(), v.maxLength(512), v.check((value) => value.endsWith('.glb') && value.split('/').every((part) => /^[A-Za-z0-9_-][A-Za-z0-9_. -]*$/u.test(part) && part.trim() === part && !part.endsWith('.')), 'project-relative GLB path without traversal, URL or backslash'));
const colliders = v.union([v.literal('mesh'), v.pipe(v.string(), v.maxLength(134), v.check((value) => value.startsWith('nodes:') && v.safeParse(name, value.slice(6)).success, 'nodes:<nonempty literal node-name prefix>'))]);
const interactive = v.strictObject({ node: name, id, colliderId: id });

function plainWorldData(input: unknown): boolean {
  if (!isJsonData(input)) return false;
  if (typeof input !== 'object' || input === null) return true;
  // Record validators omit these keys; refuse them before parsing rather than losing an authored mapping.
  for (const key of ['materials', 'objects']) {
    const record: unknown = Reflect.get(input, key);
    if (typeof record === 'object' && record !== null && Object.keys(record).some((entry) => reserved.has(entry))) return false;
  }
  return true;
}

/** Build-only authored geometry input in metres and glTF Y-up axes; it is never a compiled shardfile section. */
export const WorldSourceSchema: v.GenericSchema<BoundedWorldSourceInput, BoundedWorldSource> = v.pipe(v.unknown(), v.check(plainWorldData, 'world source is plain JSON with safe mapping keys'), v.strictObject({
  glb,
  materials: v.pipe(v.record(name, id), v.check((rows) => Object.keys(rows).length > 0 && Object.keys(rows).length <= 256, 'one to 256 explicit material mappings')),
  colliders,
  objects: v.optional(v.pipe(v.record(name, id), v.check((rows) => Object.keys(rows).length <= 1024, 'at most 1024 stable object names')), {}),
  interactive: v.optional(v.pipe(v.array(interactive), v.maxLength(64)), []),
  /** G532 (4): nodes under this name prefix collide, sample the edges and fill the far proxy, but the authored tiles never
   *  draw them: a baked-tiles row in the client plan draws them with their lightmaps */
  undrawn: v.optional(name),
  /** G608: nodes under this name prefix fill only the far proxy (a light's stand-in at a distance, as a hologram's):
   *  never a tile, a collider or an edge sample */
  far: v.optional(name),
  /** RM8.2: nodes under this name prefix draw only in the full-detail (L0) tiles: dense detail the coarse tiles leave to
   *  their own stand-ins; it collides as any static node does */
  detail: v.optional(name),
  /** RM8.2: nodes under this name prefix draw only in the coarse (L1) tiles, as they are (the detail's stand-ins):
   *  never an L0 tile, a collider, an edge sample or the far proxy */
  coarse: v.optional(name),
  /** NM0: replace uses only the declared far stand-ins. Without a mode, retain
   *  the normal proxy made from static, undrawn and far-only nodes. */
  farMode: v.optional(v.literal('replace')),
  /** NM5 (Night Market pilot): the world's own near view, baked from its coarse (L1) tiles over a flat floor, so a cell
   *  seen from the road draws its tiles in vertex colours instead of its far proxy (colour maps are not sampled: a
   *  textured surface carries its picture's colours in its vertex colours, which its own textured material ignores) */
  near: v.optional(v.literal('coarse')),
}), v.check((source) => source.farMode !== 'replace' || source.far !== undefined, 'farMode replace needs a far prefix'), v.check((source) => {
  const nodes = [...Object.keys(source.objects), ...source.interactive.map((row) => row.node)];
  const ids = [...Object.values(source.objects), ...source.interactive.map((row) => row.id)];
  return new Set(nodes).size === nodes.length && new Set(ids).size === ids.length && new Set(source.interactive.map((row) => row.colliderId)).size === source.interactive.length;
}, 'unique node names, stable object/panel IDs and interactive collider IDs'));

/** Normalized author-world declaration; objects and interactive default to empty collections. */
export type WorldSource = v.InferOutput<typeof WorldSourceSchema>;

/** Validate a build-only world declaration without opening files or executing getters or serializers. */
export function parseWorldSource(input: unknown): WorldSource { return v.parse(WorldSourceSchema, input); }

/** Complete admitted data, independent of validator implementation metadata. */
type BoundedWorldSourceInput = unknown;
interface BoundedWorldSourceFields {
    glb: string;
    materials: Record<string, string>;
    colliders: string;
    objects: Record<string, string>;
    interactive: {
        node: string;
        id: string;
        colliderId: string;
    }[];
    undrawn?: string | undefined;
    far?: string | undefined;
    detail?: string | undefined;
    coarse?: string | undefined;
    farMode?: "replace" | undefined;
    near?: "coarse" | undefined;
}
type BoundedWorldSource = { [Key in keyof BoundedWorldSourceFields]: BoundedWorldSourceFields[Key] };
