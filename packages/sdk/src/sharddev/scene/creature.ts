/**
 * SHARD-SOURCE AP23a (CUSTOM-CREATURES CC24a): a creature written as three.js, compiled to a skinned GLB rig.
 *
 * ```ts
 * import * as THREE from 'three';
 * import { creatureGlb } from '@wildshard/sdk/scene/creature';
 * const body = new THREE.Group(); body.name = 'bandit';
 * const hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = 0.9; body.add(hips);
 * hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), cloth));
 * const walk = new THREE.AnimationClip('walk', 1, [new THREE.QuaternionKeyframeTrack('hips.quaternion', [0, 0.5, 1], [...])]);
 * const { glb } = creatureGlb(body, { clips: [walk] });
 * ```
 *
 * The group is the creature's frame (its own transform is not read). Its bones are the named nodes under it that are not
 * meshes, each at its rest position in that frame (a bone with no bone above it is a root). A mesh is bound rigidly to its
 * nearest bone ancestor:
 * it moves only with that bone. Clips keep their names and their `<bone>.position|quaternion|scale` tracks. A bone rests
 * unrotated and unscaled (the rig's bind pose is translations only, as every rig the engine loads), so put a rest rotation
 * on the mesh under it instead. Compile time only, like the scene.
 */
import { BufferAttribute, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type AnimationClip, type BufferGeometry, type Mesh, type Object3D, type PointLight } from 'three';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { hashImmutableBytes } from '../immutable';
import { skinnedGlb, type SkinnedBone, type SkinnedPart } from '../bake/skinned';
import { SceneRefusalError } from './lower';

export interface CreatureOptions {
  /** Bone animations, by name (`walk`, `attack`); each track names a bone of the rig. */
  readonly clips?: readonly AnimationClip[];
}

/** AP24c: a `PointLight` under a bone, as an offset in that bone's frame (bones rest unrotated, so the creature's axes). */
export interface CreatureLamp {
  readonly bone: string;
  readonly at: readonly [number, number, number];
  /** linear RGB, as three holds a light's colour */
  readonly colour: readonly [number, number, number];
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
}

export interface CreatureRig {
  readonly glb: Uint8Array;
  /** AP24c: the rig's lights, each riding its nearest bone (`creatureLampRows` writes them as following look lamps) */
  readonly lamps: readonly CreatureLamp[];
  /** The joints in skin order, each with its parent and rest position in the creature's frame. */
  readonly bones: readonly SkinnedBone[];
  readonly clips: readonly string[];
}

const EPS = 1e-6;
const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true;
const isPointLight = (o: Object3D): o is PointLight => (o as PointLight).isPointLight === true;
const isLight = (o: Object3D): boolean => (o as PointLight).isLight === true;

/** Compile `root` (a `Group` of bone nodes and meshes) to a skinned GLB rig. */
export function creatureGlb(root: Object3D, options: CreatureOptions = {}): CreatureRig {
  const name = root.name === '' ? 'creature' : root.name;
  root.updateMatrixWorld(true);
  const toFrame = new Matrix4().copy(root.matrixWorld).invert();
  const bones: SkinnedBone[] = [], index = new Map<Object3D, number>();
  const at = (o: Object3D): [number, number, number] => {
    const p = new Vector3().setFromMatrixPosition(new Matrix4().multiplyMatrices(toFrame, o.matrixWorld));
    return [p.x, p.y, p.z];
  };
  const visit = (node: Object3D, parentBone: string | null): void => {
    const bone = node !== root && !isMesh(node) && !isLight(node) && node.name !== '';
    let next = parentBone;
    if (bone) {
      const boneName = node.name;
      if (bones.some((b) => b.name === boneName)) throw new SceneRefusalError(`${name}/${boneName}`, 'two bones share this name', 'Give every bone node its own name');
      if ((Math.abs(1 - Math.abs(node.quaternion.dot(new Quaternion()))) > EPS || node.scale.distanceTo(new Vector3(1, 1, 1)) > EPS)) {
        throw new SceneRefusalError(`${name}/${boneName}`, 'a bone rests rotated or scaled', 'Leave the bone unrotated and unscaled at rest; rotate or scale the mesh under it');
      }
      index.set(node, bones.length); bones.push({ name: boneName, parent: parentBone, pos: at(node) });
      next = boneName;
    }
    for (const child of node.children) visit(child, next);
  };
  visit(root, null);

  const parts: SkinnedPart[] = [];
  root.traverse((o) => {
    if (!isMesh(o)) return;
    let owner: Object3D | null = o.parent;
    while (owner !== null && !index.has(owner)) owner = owner.parent;
    const bone = owner === null ? undefined : index.get(owner);
    if (bone === undefined) throw new SceneRefusalError(`${name}/${o.name || 'Mesh'}`, 'a creature part hangs under no bone', 'Put the mesh under a named bone node');
    const material = o.material;
    if (Array.isArray(material) || !(material instanceof MeshStandardMaterial)) throw new SceneRefusalError(`${name}/${o.name || 'Mesh'}`, 'a creature part draws with one MeshStandardMaterial', 'Give the mesh one MeshStandardMaterial');
    if (material.map !== null) throw new SceneRefusalError(`${name}/${o.name || 'Mesh'}`, 'a creature part\'s map has no lowering yet', 'Colour it with the material colour or vertex colours');
    const geometry = (o.geometry.index === null ? o.geometry.clone() : o.geometry.toNonIndexed()) as BufferGeometry;
    for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(key)) geometry.deleteAttribute(key);
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(toFrame, o.matrixWorld));
    const count = geometry.getAttribute('position').count, joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) { joints[v * 4] = bone; weights[v * 4] = 1; }
    geometry.setAttribute('skinIndex', new BufferAttribute(joints, 4)); geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
    parts.push({ geometry, material, name: `${name}.${o.name === '' ? parts.length : o.name}` });
  });
  if (bones.length === 0) throw new SceneRefusalError(name, 'a creature has no bones', 'Name the nodes its meshes hang from (`body`, `head`): a named node that is not a mesh is a bone');
  if (parts.length === 0) throw new SceneRefusalError(name, 'a creature draws nothing', 'Add a mesh under one of its bones');

  const lamps: CreatureLamp[] = [];
  root.traverse((o) => {
    if (!isLight(o)) return;
    if (!isPointLight(o)) throw new SceneRefusalError(`${name}/${o.name || o.type}`, 'a creature carries only point lights', 'Use a PointLight; the look\'s sun and fill stay in the scene');
    let owner: Object3D | null = o.parent;
    while (owner !== null && !index.has(owner)) owner = owner.parent;
    const bone = owner === null ? undefined : bones[index.get(owner) ?? -1];
    if (bone === undefined) throw new SceneRefusalError(`${name}/${o.name || 'PointLight'}`, 'a creature light hangs under no bone', 'Put the light under a named bone node');
    const p = at(o);
    lamps.push({ bone: bone.name, at: [p[0] - bone.pos[0], p[1] - bone.pos[1], p[2] - bone.pos[2]], colour: [o.color.r, o.color.g, o.color.b], intensity: o.intensity, distance: o.distance, decay: o.decay });
  });

  const clips = options.clips ?? [];
  for (const clip of clips) for (const track of clip.tracks) {
    const bone = track.name.slice(0, track.name.lastIndexOf('.'));
    if (!bones.some((b) => b.name === bone)) throw new SceneRefusalError(`${name}/${clip.name}`, `track ${track.name} names no bone of the rig`, `Name a bone node \`${bone}\`, or retarget the track`);
  }
  return { glb: skinnedGlb({ name, bones, parts, clips }).glb, bones, lamps, clips: clips.map((clip) => clip.name) };
}

/** The `platform.skin` look's binding beside a rig row (shard-brasscap `src/sources/bandit.skin.json` has the shape). */
export interface CreatureBinding {
  /** Clips that loop (`idle`, `walk`); the rest play once. */
  readonly loops: readonly string[];
  /** The skin's material entry (a look material family row). */
  readonly material: Readonly<Record<string, unknown>>;
  /** A GLB material name to a look material id (`{ Eye: 'glow' }`). */
  readonly materials?: Readonly<Record<string, string>>;
}

/**
 * AP23b: the skin file for a compiled rig, as a species' skin names it: the rig row (its GLB's cost and hash, clips, joints as
 * parent and child pairs, every bone a socket) and its binding. No species, kind or brain row is written: a species binds
 * the skin by `id` as it binds a hand-written one.
 */
export function creatureSkin(rig: CreatureRig, options: { id: string; family?: 'toon' | 'pbr' | 'painterly'; binding: CreatureBinding }): { row: Record<string, unknown>; binding: Record<string, unknown> } {
  const cost = parseGlb(rig.glb);
  for (const loop of options.binding.loops) if (!rig.clips.includes(loop)) throw new SceneRefusalError(options.id, `loop ${loop} is not one of the rig's clips`, `Loop one of ${rig.clips.join(', ')}`);
  return {
    row: {
      cost: { decoded: cost.decoded, draws: cost.draws, gpu: cost.gpu, triangles: cost.triangles }, family: options.family ?? 'toon', file: hashImmutableBytes(rig.glb), id: options.id,
      rig: { clips: [...rig.clips], joints: rig.bones.filter((b) => b.parent !== null).map((b) => [b.parent, b.name]), skeleton: options.id, sockets: rig.bones.map((b) => b.name) },
    },
    binding: { loops: [...options.binding.loops], material: { ...options.binding.material }, ...(options.binding.materials === undefined ? {} : { materials: { ...options.binding.materials } }), skin: options.id },
  };
}

/** A `look.light.lamps` row that follows an actor's bone (shard-format v0.5.9 `lamps[].follow`, SHARD-SOURCE AP24a). */
export interface FollowingLampRow {
  readonly at: [number, number, number];
  readonly colour: [number, number, number];
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
  readonly follow: { readonly actor: string; readonly bone: string };
}

/**
 * AP24c: the rig's lights as look lamps that ride `actor` (a creature spawn or boss id): the eyes and core of a boss light
 * the ground as it walks. A three.js `distance` of 0 (no cut-off) has no look row, so it is refused.
 */
export function creatureLampRows(rig: CreatureRig, actor: string): FollowingLampRow[] {
  return rig.lamps.map((lamp) => {
    if (lamp.distance < 0.1 || lamp.distance > 50) throw new SceneRefusalError(`${actor}/${lamp.bone}`, 'a following lamp needs a distance of 0.1 to 50 m', 'Give the PointLight a distance in metres (its light ends there)');
    if (lamp.intensity > 100) throw new SceneRefusalError(`${actor}/${lamp.bone}`, 'a following lamp is at most 100 cd', 'Lower the PointLight\'s intensity');
    return { at: [...lamp.at], colour: [...lamp.colour], intensity: lamp.intensity, distance: lamp.distance, decay: lamp.decay, follow: { actor, bone: lamp.bone } };
  });
}
