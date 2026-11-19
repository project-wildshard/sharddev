/**
 * ONE-FORMAT CC24 (SHARD-SOURCE AP23a/AP23b's first cut, grown): `world.creature` turns a three.js `Group` of named bone
 * nodes into a whole creature: the skinned GLB rig (`creatureGlb`), its skin file (`creatureSkin`), and the species and
 * look rows that name them, under CC47's caps. The shard file stores the two files (the skin in the library) and adds the
 * rows beside any `extend` writes. A serpent's `trail` row (CC23) and a look's clip map join them (CC24b).
 */
import type { AnimationClip, Object3D } from 'three';
import type { CreatureBody } from '@wildshard/format/creatureLayers';
import { trailBoneNames } from '@wildshard/format/creatureSkeletons';
import { SkinClipMapSchema, type SkinClipMap } from '@wildshard/format/skins';
import * as v from 'valibot';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import type { ShardRows } from '@wildshard/format/rows';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';
import { CREATURE_BONE_CAP } from '../creatureCaps';
import { creaturePhoneGlb, type CreaturePhoneOptions } from '../bake/creaturePhone';
import { creatureGlb, creatureSkin, type CreatureBinding } from './creature';
import type { SceneCreature, ShardScene } from './description';
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
  /** A serpent's trail: `count` rig bones (`head`, `seg1`…, `tail`, under the `body` bone every skin has) `spacing`
   *  metres apart. Only a serpent has one (CC23). */
  readonly trail?: CreatureBody['trail'];
  /** Hit volumes on its bones (at most 16 with the skeleton's), lock points and how hits read the pose. */
  readonly volumes?: CreatureBody['volumes'];
  readonly lock?: CreatureBody['lock'];
  readonly hits?: CreatureBody['hits'];
  /** Bone clips by name (`idle`, `walk`, `attack`, `hit`, `die`); each track names a bone. */
  readonly clips?: readonly AnimationClip[];
  /** The strike rows its `abilities` name (a kit ability's `strike`), written into `rows.strikes` with it; two creatures
   *  may name the same row (OF-NE20). */
  readonly strikes?: ShardRows['strikes'];
  /** The skin's binding: looping clips, its material entry and GLB material names to look materials. */
  readonly loops: CreatureBinding['loops'];
  readonly material: CreatureBinding['material'];
  readonly materials?: CreatureBinding['materials'];
  readonly family?: 'toon' | 'pbr' | 'painterly';
  /** The bones a strike, lamp or rider may hang from; a skin names at most 32. Default: every bone, when there are 32 or fewer. */
  readonly sockets?: readonly string[];
  /** The attack clip's length in seconds, as the clips recipe samples it (default 1). */
  readonly attackSpan?: number;
  /** Which of the rig's clips plays each state (`idle`, `walk`, `attack`, `hit`, `die`) and each ability (by strike id),
   *  when the clip names differ from the states. */
  readonly clipMap?: SkinClipMap<string>;
}

/** Compile one `world.creature` now (the body is read at the call, like a part). */
export function compileWorldCreature(id: string, body: Object3D, options: CreatureWorldOptions): SceneCreature {
  if (body.parent !== null) throw new SceneRefusalError(id, 'a creature body hangs in the scene', 'Build the creature in its own Group, outside world.scene: the shard places it with world.spawnAt');
  const rig = creatureGlb(body, { clips: options.clips ?? [] });
  if (rig.bones.length > CREATURE_BONE_CAP) throw new SceneRefusalError(id, `a creature has ${rig.bones.length} bones, over the cap of ${CREATURE_BONE_CAP}`, 'Merge bones, or split it into two creatures');
  const names = rig.bones.map(bone => bone.name), sockets = options.sockets ?? names;
  if ((options.skeleton === 'serpent') !== (options.trail !== undefined)) throw new SceneRefusalError(id, options.trail === undefined ? 'a serpent has no trail' : 'a trail on a creature that is no serpent', "Pass `skeleton: 'serpent'` with `trail: { count, spacing }`, or neither");
  if (options.trail !== undefined) for (const bone of trailBoneNames(options.trail.count)) if (!names.includes(bone)) throw new SceneRefusalError(id, `trail bone ${bone} is not a bone of the rig`, `A ${options.trail.count}-bone trail names ${trailBoneNames(options.trail.count).join(', ')}`);
  const clipNames = (options.clips ?? []).map(clip => clip.name);
  for (const clip of [...Object.values(options.clipMap?.states ?? {}), ...Object.values(options.clipMap?.abilities ?? {})]) if (!clipNames.includes(clip)) throw new SceneRefusalError(id, `the clip map names ${clip}, which is no clip of the rig`, `Name one of ${clipNames.join(', ') || 'the clips you pass'}`);
  const clipMap = options.clipMap === undefined ? undefined : v.safeParse(SkinClipMapSchema, options.clipMap);
  if (clipMap?.success === false) throw new SceneRefusalError(id, `the clip map does not check: ${clipMap.issues.map(issue => issue.message).join('; ')}`, 'Map the states idle, idle.graze, walk, attack, hit and die, and abilities by strike id');
  if (sockets.length > MAX_SOCKETS) throw new SceneRefusalError(id, `a creature names ${sockets.length} sockets, over the ${MAX_SOCKETS} a skin holds`, 'Pass `sockets`: the bones a strike, lamp or rider hangs from');
  for (const socket of sockets) if (!names.includes(socket)) throw new SceneRefusalError(id, `socket ${socket} is not a bone of the rig`, `Name one of ${names.join(', ')}`);
  const binding: CreatureBinding = { loops: options.loops, material: options.material, ...(options.materials === undefined ? {} : { materials: options.materials }) };
  const skin = creatureSkin(rig, { id, ...(options.family === undefined ? {} : { family: options.family }), binding });
  const row = { ...skin.row, rig: { ...(skin.row['rig'] as Record<string, unknown>), sockets: [...sockets] } };
  const bytes = new TextEncoder().encode(encodeCanonicalJson({ row, binding: skin.binding }));
  const lookId = `${id}.look`;
  const species: SpeciesRow = { ...options.species, id, body: { size: options.size, scale: options.scale ?? 1, look: lookId,
    ...(options.skeleton === undefined ? {} : { skeleton: options.skeleton }), ...(options.trail === undefined ? {} : { trail: options.trail }), ...(options.volumes === undefined ? {} : { volumes: options.volumes }),
    ...(options.lock === undefined ? {} : { lock: options.lock }), ...(options.hits === undefined ? {} : { hits: options.hits }) } };
  const look: ShardRows['looks'][number] = { id: lookId, species: id, recipe: 'platform.skin', material: null, parameters: { skin: hashImmutableBytes(bytes) },
    animation: { recipe: 'platform.clips', parameters: { attackSpan: options.attackSpan ?? 1 }, ...(clipMap === undefined ? {} : { clipMap: clipMap.output }) } };
  return { id, glb: rig.glb, skin: bytes, species, look, bones: rig.bones.length, triangles: parseGlb(rig.glb).triangles,
    ...(options.strikes === undefined ? {} : { strikes: [...options.strikes] }) };
}

/**
 * ONE-FORMAT CC51b: a creature's phone mesh, as its look's `phone` skin. `creaturePhoneGlb` simplifies the rig GLB; the
 * phone skin file is the desktop one with the lighter GLB's hash and cost (the same rig, clips, sockets and material, as
 * format `skin-variants` checks). A creature with a variant table (a look that cannot also name a phone skin), one that
 * already has a phone mesh, or one the simplifier cannot lighten keeps its single mesh.
 */
export async function withCreaturePhone(creature: SceneCreature, options: CreaturePhoneOptions = {}): Promise<SceneCreature> {
  if (creature.files !== undefined || creature.phone !== undefined) return creature;
  const mesh = await creaturePhoneGlb(creature.glb, options);
  if (mesh.triangles.phone >= mesh.triangles.desktop) return creature;
  const { row, binding } = JSON.parse(new TextDecoder().decode(creature.skin)) as { row: Record<string, unknown>; binding: Record<string, unknown> };
  const cost = parseGlb(mesh.glb);
  const skin = new TextEncoder().encode(encodeCanonicalJson({ row: { ...row, cost: { decoded: cost.decoded, draws: cost.draws, gpu: cost.gpu, triangles: cost.triangles },
    file: hashImmutableBytes(mesh.glb) }, binding }));
  const look = { ...creature.look, parameters: { ...creature.look.parameters, phone: hashImmutableBytes(skin) } };
  return { ...creature, look, phone: { glb: mesh.glb, skin, triangles: cost.triangles } };
}

/** CC51b: every `world.creature` with its phone mesh (the build's step before the shard file; `false` skips it). */
export async function withCreaturePhones(scene: ShardScene, options: CreaturePhoneOptions | false = {}): Promise<ShardScene> {
  if (options === false || scene.creatures === undefined || scene.creatures.length === 0) return scene;
  const creatures: SceneCreature[] = [];
  for (const creature of scene.creatures) creatures.push(await withCreaturePhone(creature, options));
  return { ...scene, creatures };
}
