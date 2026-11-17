import { Matrix4, Quaternion, Vector3 } from 'three';
import * as v from 'valibot';
import { CreatureVolumesSchema, type CreatureVolume } from '@wildshard/format/creatureVolumes';
import { CREATURE_SKELETONS, MIN_VOLUME_RADIUS } from '@wildshard/format/creatureSkeletons';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { resolveSkinLookFiles } from '@wildshard/format/skinAssets';
import { SKIN_LOOK_RECIPE } from '@wildshard/format/skins';
import { parseRows } from '@wildshard/format/rows';
import type { Shardfile } from '@wildshard/format/shardSchema';

const finite = v.pipe(v.number(), v.finite()), count = v.pipe(finite, v.integer(), v.minValue(0));
const triple = v.tuple([finite, finite, finite]);
const Node = v.object({ name: v.optional(v.string()), children: v.optional(v.array(count), []), extras: v.optional(v.unknown()),
  translation: v.optional(triple), rotation: v.optional(v.tuple([finite, finite, finite, finite])), scale: v.optional(triple),
  matrix: v.optional(v.pipe(v.array(finite), v.length(16))) });
const Document = v.object({ nodes: v.array(Node), skins: v.array(v.object({ joints: v.array(count) })) });
const Extras = v.strictObject({ shape: v.exactOptional(v.picklist(['sphere', 'capsule'])), radius: v.exactOptional(finite),
  halfLength: v.exactOptional(finite), axis: v.exactOptional(v.picklist(['y', 'z'])), multiplier: v.exactOptional(finite) });
const EPS = 1e-6;

/** Blender empties named hit.<part>, parented under a skin joint. Custom extras
 * set shape/radius/halfLength/axis/multiplier; translation is the bone-local offset.
 * Markers are metadata: the original GLB, geometry, skin and clips stay byte-identical. */
export function creatureHitVolumes(bytes: Uint8Array): CreatureVolume[] {
  parseGlb(bytes);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = header.getUint32(12, true);
  const doc = v.parse(Document, JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))));
  const markers = doc.nodes.flatMap((node, index) => node.name?.startsWith('hit.') === true ? [index] : []);
  if (markers.length === 0) return [];
  const skin = doc.skins[0];
  if (markers.length > 16 || doc.skins.length !== 1 || skin === undefined) throw new Error('Creature hit markers need one skin and at most 16 parts');
  const joints = new Set(skin.joints), parents = new Map<number, number>();
  for (const [parent, node] of doc.nodes.entries()) for (const child of node.children) {
    if (parents.has(child)) throw new Error('Ambiguous hit marker parent');
    parents.set(child, parent);
  }
  const local = (index: number): Matrix4 => {
    const node = doc.nodes[index];
    if (node === undefined) throw new Error('Invalid hit marker hierarchy');
    if (node.matrix !== undefined && (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined)) throw new Error('Ambiguous hit marker transform');
    return node.matrix === undefined ? new Matrix4().compose(new Vector3(...node.translation ?? [0, 0, 0]),
      new Quaternion(...node.rotation ?? [0, 0, 0, 1]), new Vector3(...node.scale ?? [1, 1, 1])) : new Matrix4().fromArray(node.matrix);
  };
  const volumes = markers.map(index => {
    const marker = doc.nodes[index];
    if (marker === undefined || marker.name === undefined || joints.has(index) || marker.children.length > 0) throw new Error('A hit marker must be an empty node outside the skin joints');
    const chain = [index];
    let boneIndex = parents.get(index), steps = 0;
    while (boneIndex !== undefined && !joints.has(boneIndex)) {
      if (++steps > 128) throw new Error('Invalid hit marker hierarchy');
      chain.push(boneIndex); boneIndex = parents.get(boneIndex);
    }
    const bone = boneIndex === undefined ? undefined : doc.nodes[boneIndex];
    if (boneIndex === undefined || bone?.name === undefined) throw new Error(`${marker.name}: no named skin bone parent`);
    const relative = new Matrix4(), at = new Vector3(), q = new Quaternion(), scale = new Vector3();
    // Compose only the path below the bone. Subtracting whole world positions
    // loses low bits and makes identical markers differ between large variants.
    for (const child of chain) relative.premultiply(local(child));
    relative.decompose(at, q, scale);
    if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0 || Math.abs(scale.x - scale.y) > EPS || Math.abs(scale.x - scale.z) > EPS) throw new Error(`${marker.name}: hit marker scale must be positive and uniform`);
    const composed = new Matrix4().compose(at, q, scale);
    if (composed.elements.some((value, field) => Math.abs(value - (relative.elements[field] ?? 0)) > EPS)) throw new Error(`${marker.name}: hit marker transform must be uniform TRS`);
    const extras = v.parse(Extras, marker.extras ?? {}), part = marker.name.slice(4), shape = extras.shape ?? 'sphere';
    const defaultVolume = CREATURE_SKELETONS.biped.volumes.find(row => row.part === part);
    const axis = new Vector3(...(extras.axis === 'z' ? [0, 0, 1] as const : [0, 1, 0] as const)).applyQuaternion(q);
    if (shape === 'capsule' && (Math.abs(axis.x) > EPS || Math.min(Math.abs(axis.y), Math.abs(axis.z)) > EPS)) throw new Error(`${marker.name}: capsule axis must align with the bone Y or Z axis`);
    return { part, bone: bone.name, shape, radius: (extras.radius ?? MIN_VOLUME_RADIUS) * scale.x,
      halfLength: (extras.halfLength ?? 0) * scale.x, axis: Math.abs(axis.z) > Math.abs(axis.y) ? 'z' as const : 'y' as const,
      multiplier: extras.multiplier ?? defaultVolume?.multiplier ?? 1, at: [at.x, at.y, at.z] };
  });
  return v.parse(CreatureVolumesSchema, volumes);
}

/** One species row must mean the same thing for every variant. Explicit row
 * overrides win over imported parts; marker differences without an override refuse. */
export function expandCreatureHitVolumes(source: Shardfile, assets: ReadonlyMap<string, Uint8Array>): Shardfile {
  let changed = false;
  const cache = new Map<string, CreatureVolume[]>();
  const species = source.rows.species.map(row => {
    const body = row.body, look = body === undefined ? undefined : source.rows.looks.find(candidate => candidate.id === body.look);
    if (body === undefined || look?.recipe !== SKIN_LOOK_RECIPE) return row;
    const resolved = resolveSkinLookFiles(source, look, assets), skins = [...(resolved.variants?.values() ?? [resolved.skin])];
    let candidate: CreatureVolume[] | undefined, contract: string | undefined, marked = false;
    for (const skin of skins) {
      let imported = cache.get(skin.row.file);
      if (imported === undefined) {
        const bytes = assets.get(skin.row.file); if (bytes === undefined) throw new Error(`species ${row.id}: missing hit marker GLB`);
        imported = creatureHitVolumes(bytes); cache.set(skin.row.file, imported);
      }
      marked ||= imported.length > 0;
      const parts = new Map(imported.map(volume => [volume.part, volume]));
      for (const volume of body.volumes ?? []) parts.set(volume.part, volume);
      const merged = [...parts.values()].sort((a, b) => a.part < b.part ? -1 : a.part > b.part ? 1 : 0);
      const text = JSON.stringify(merged);
      if (contract !== undefined && text !== contract) throw new Error(`species ${row.id}: variant hit markers differ; override their parts explicitly`);
      contract = text; candidate = merged;
    }
    if (!marked || candidate === undefined) return row;
    changed = true; return { ...row, body: { ...body, volumes: candidate } };
  });
  return changed ? { ...source, rows: parseRows({ ...source.rows, species }) } : source;
}
