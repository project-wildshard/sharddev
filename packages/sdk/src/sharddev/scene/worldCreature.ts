/**
 * ONE-FORMAT CC24 (SHARD-SOURCE AP23a/AP23b's first cut, grown): `world.creature` turns a three.js `Group` of named bone
 * nodes into a whole creature: the skinned GLB rig (`creatureGlb`), its skin file (`creatureSkin`), and the species and
 * look rows that name them, under CC47's caps. The shard file stores the two files (the skin in the library) and adds the
 * rows beside any `extend` writes. Trail bones and a clip map join when the format has them (CC23, CC24b).
 */
import type { AnimationClip, Object3D } from 'three';
import type { CreatureBody } from '@wildshard/format/creatureLayers';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import type { ShardRows } from '@wildshard/format/rows';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';
import { CREATURE_BONE_CAP } from '../creatureCaps';
import { creatureGlb, creatureSkin, type CreatureBinding } from './creature';
import type { SceneCreature } from './description';
import { SceneRefusalError } from './refusal';

type SpeciesRow = ShardRows['species'][number];
/** A skin names at most 32 sockets (format `skinData.ts`). */
const MAX_SOCKETS = 32;

/** What `world.creature` writes besides the body: the species' sim rows, its body layer and its skin binding. */
export interface CreatureWorldOptions {
  /** The species row without its id and body: kind, label, dims, variants, temperament, senses, abilities… */
  readonly species: Omit<SpeciesRow, 'id' | 'body'>;
  /** The size class (its caps and its scale: tiny 0.25 to giant 4) and a free scale on top (default 1). */
  readonly size: CreatureBody['size'];
  readonly scale?: number;
  /** A kit skeleton's contract (its default volumes and sockets), when the rig follows one. */
  readonly skeleton?: CreatureBody['skeleton'];
  /** Hit volumes on its bones (at most 16 with the skeleton's), lock points and how hits read the pose. */
  readonly volumes?: CreatureBody['volumes'];
  readonly lock?: CreatureBody['lock'];
  readonly hits?: CreatureBody['hits'];
  /** Bone clips by name (`idle`, `walk`, `attack`, `hit`, `die`); each track names a bone. */
  readonly clips?: readonly AnimationClip[];
  /** The skin's binding: looping clips, its material entry and GLB material names to look materials. */
  readonly loops: CreatureBinding['loops'];
  readonly material: CreatureBinding['material'];
  readonly materials?: CreatureBinding['materials'];
  readonly family?: 'toon' | 'pbr' | 'painterly';
  /** The bones a strike, lamp or rider may hang from; a skin names at most 32. Default: every bone, when there are 32 or fewer. */
  readonly sockets?: readonly string[];
  /** The attack clip's length in seconds, as the clips recipe samples it (default 1). */
  readonly attackSpan?: number;
}

/** Compile one `world.creature` now (the body is read at the call, like a part). */
export function compileWorldCreature(id: string, body: Object3D, options: CreatureWorldOptions): SceneCreature {
  if (body.parent !== null) throw new SceneRefusalError(id, 'a creature body hangs in the scene', 'Build the creature in its own Group, outside world.scene: the shard places it with world.spawnAt');
  const rig = creatureGlb(body, { clips: options.clips ?? [] });
  if (rig.bones.length > CREATURE_BONE_CAP) throw new SceneRefusalError(id, `a creature has ${rig.bones.length} bones, over the cap of ${CREATURE_BONE_CAP}`, 'Merge bones, or split it into two creatures');
  const names = rig.bones.map(bone => bone.name), sockets = options.sockets ?? names;
  if (sockets.length > MAX_SOCKETS) throw new SceneRefusalError(id, `a creature names ${sockets.length} sockets, over the ${MAX_SOCKETS} a skin holds`, 'Pass `sockets`: the bones a strike, lamp or rider hangs from');
  for (const socket of sockets) if (!names.includes(socket)) throw new SceneRefusalError(id, `socket ${socket} is not a bone of the rig`, `Name one of ${names.join(', ')}`);
  const binding: CreatureBinding = { loops: options.loops, material: options.material, ...(options.materials === undefined ? {} : { materials: options.materials }) };
  const skin = creatureSkin(rig, { id, ...(options.family === undefined ? {} : { family: options.family }), binding });
  const row = { ...skin.row, rig: { ...(skin.row['rig'] as Record<string, unknown>), sockets: [...sockets] } };
  const bytes = new TextEncoder().encode(encodeCanonicalJson({ row, binding: skin.binding }));
  const lookId = `${id}.look`;
  const species: SpeciesRow = { ...options.species, id, body: { size: options.size, scale: options.scale ?? 1, look: lookId,
    ...(options.skeleton === undefined ? {} : { skeleton: options.skeleton }), ...(options.volumes === undefined ? {} : { volumes: options.volumes }),
    ...(options.lock === undefined ? {} : { lock: options.lock }), ...(options.hits === undefined ? {} : { hits: options.hits }) } };
  const look: ShardRows['looks'][number] = { id: lookId, species: id, recipe: 'platform.skin', material: null, parameters: { skin: hashImmutableBytes(bytes) },
    animation: { recipe: 'platform.clips', parameters: { attackSpan: options.attackSpan ?? 1 } } };
  return { id, glb: rig.glb, skin: bytes, species, look, bones: rig.bones.length, triangles: parseGlb(rig.glb).triangles };
}
