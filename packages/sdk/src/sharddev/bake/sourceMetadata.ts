import * as v from 'valibot';
import type { NamedBlobKind } from '../blobs';

/** Cached author metadata, prior to actual byte/cost admission by nameBlob. */
export interface CachedBlobSource<K extends NamedBlobKind> {
  name: string;
  kind: K;
  source: string;
  options: { decoded: number; gpu: number; triangles: number; draws: number; critical: boolean; dependencies: string[] };
}

/** Re-admit owned cached metadata for an explicit set of file kinds.
 * The envelope strips unrelated cache fields; rows/options reject unknown fields
 * unless an earlier cache stage explicitly requests native stripping.
 * Costs keep the recording grammar; nameBlob validates their actual byte claims. */
export function cachedBlobSources<const K extends readonly NamedBlobKind[]>(input: unknown, kinds: K, unknownFields: 'reject' | 'strip' = 'reject'): CachedBlobSource<K[number]>[] {
  const costs = { decoded: v.number(), gpu: v.number(), triangles: v.number(), draws: v.number(),
    critical: v.boolean(), dependencies: v.array(v.string()) };
  const fields = { name: v.string(), kind: v.picklist(kinds), source: v.string(),
    options: unknownFields === 'strip' ? v.object(costs) : v.strictObject(costs) };
  return v.parse(v.object({ sources: v.array(unknownFields === 'strip' ? v.object(fields) : v.strictObject(fields)) }), input).sources;
}

const finite = v.pipe(v.number(), v.finite());
const point = v.object({ x: finite, y: finite, z: finite });
const plantedModel = v.object({ x: finite, z: finite, h: finite, lean: finite, leanDir: finite, rot: finite, fronds: finite });

/** Admit complete cached prototype observations and planted-model transforms.
 * Unknown metadata is stripped, with the original finite bounds and field order. */
export function modelPrototypeFacts(input: unknown): {
  protos: { name: string; present: boolean; empty: boolean; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; half: number; top: number }[];
  extraPalms: { x: number; z: number; h: number; lean: number; leanDir: number; rot: number; fronds: number }[];
  bake: { bounceGain: number; sunY: number };
} {
  return v.parse(v.object({ protos: v.array(v.object({ name: v.string(), present: v.boolean(), empty: v.boolean(),
    min: point, max: point, half: finite, top: finite })), extraPalms: v.array(plantedModel),
    bake: v.object({ bounceGain: finite, sunY: finite }) }), input);
}

/** Admit source model names, LOD numbers, authored transforms and bake lighting.
 * LOD values keep their recording grammar; transform and light components stay finite. */
export function modelSourceMetadata(input: unknown): {
  protos: { name: string }[]; lod: Record<string, number>;
  extraPalms: { x: number; z: number; h: number; lean: number; leanDir: number; rot: number; fronds: number }[];
  bake: { bounceGain: number; refSun: [number, number, number] };
} {
  return v.parse(v.object({ protos: v.array(v.object({ name: v.string() })), lod: v.record(v.string(), v.number()),
    extraPalms: v.array(plantedModel), bake: v.object({ bounceGain: finite, refSun: v.tuple([finite, finite, finite]) }) }), input);
}

/** Admit ordered cover prototype names/kinds and the original mandatory prefix count. */
export function modelCoverMetadata(input: unknown): { protos: { name: string; kind: string }[]; mustDraw: number } {
  return v.parse(v.object({ protos: v.array(v.object({ name: v.string(), kind: v.string() })), mustDraw: v.number() }), input);
}
