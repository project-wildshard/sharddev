import { WebIO, type Accessor, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

/** Authoring rest data from a retained skinned GLB; no animation, renderer, scene service or game is installed. */
export interface RigRest {
  readonly geometry: THREE.BufferGeometry;
  readonly bones: readonly { readonly name: string; readonly pos: readonly [number, number, number] }[];
  readonly colourImage: Uint8Array;
}
/** Normalize quantized GLTF channels into the Float32 geometry the Three loader supplies to authoring tools. */
function attribute(accessor: Accessor | null, label: string): THREE.BufferAttribute {
  if (accessor === null) throw new Error(`Rig lacks ${label}`);
  const size = accessor.getElementSize(), array = new Float32Array(accessor.getCount() * size), element: number[] = [];
  for (let index = 0; index < accessor.getCount(); index++) {
    accessor.getElement(index, element);
    for (let channel = 0; channel < size; channel++) array[index * size + channel] = element[channel] ?? 0;
  }
  return new THREE.BufferAttribute(array, size);
}
/** Read one triangle skin's rest geometry, ordered world-space joints and embedded colour atlas in plain Node.
 * Meshopt and embedded WebP are admitted through their GLTF extensions. Multi-skin/multi-primitive input refuses;
 * callers that need a composed rig must author that composition explicitly. UVs and mesh-local positions stay unchanged. */
export async function readRigRest(glb: Uint8Array): Promise<RigRest> {
  const document = await readDocument(glb);
  const nodes = document.getRoot().listNodes().filter(node => node.getSkin() !== null && node.getMesh() !== null);
  if (nodes.length !== 1) throw new Error('Rig requires one skinned node');
  const node = nodes[0], skin = node?.getSkin(), primitives = node?.getMesh()?.listPrimitives();
  if (skin === undefined || skin === null || primitives?.length !== 1) throw new Error('Rig requires one skinned primitive');
  const primitive = primitives[0];
  if (primitive?.getMode() !== 4) throw new Error('Rig requires triangles');
  const geometry = new THREE.BufferGeometry();
  for (const [name, channel] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['uv', 'TEXCOORD_0']] as const) geometry.setAttribute(name, attribute(primitive.getAttribute(channel), channel));
  const array = primitive.getIndices()?.getArray();
  if (array?.length === undefined) throw new Error('Rig requires triangle indices');
  geometry.setIndex(Array.from(array));
  const colourImage = primitive.getMaterial()?.getBaseColorTexture()?.getImage();
  if (colourImage === undefined || colourImage === null) throw new Error('Rig requires embedded colour atlas');
  const bones = skin.listJoints().map(joint => ({ name: joint.getName(), pos: joint.getWorldTranslation() }));
  return { geometry, bones, colourImage: new Uint8Array(colourImage) };
}

/** Local authored transform, including the named parent; no inverse-bind or geometry approximation. */
export interface RigTransform {
  readonly name: string;
  readonly parent: string | null;
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly scale: readonly number[];
}
/** Original standard Three clips and local node transforms, without meshes, textures or playback services. */
export interface RigMotion {
  readonly clips: readonly THREE.AnimationClip[];
  readonly nodes: readonly RigTransform[];
}
async function readDocument(glb: Uint8Array): Promise<Document> {
  if (glb.length < 20 || glb.length > 64_000_000) throw new Error('Rig requires bounded GLB bytes');
  const header = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== glb.byteLength) throw new Error('Rig requires complete GLB 2 bytes');
  await MeshoptDecoder.ready;
  return new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(glb);
}
/** Decode GLB transform animation into standard Three tracks, preserving Float32 keys and STEP/LINEAR interpolation.
 * Stable named targets are required. Morph channels, cubic splines and normalized/integer animation accessors refuse;
 * they require their own exact compiler. Geometry and embedded images are never decoded into rendering resources. */
export async function readRigMotion(glb: Uint8Array): Promise<RigMotion> {
  const root = (await readDocument(glb)).getRoot();
  if (root.listNodes().length > 4096 || root.listAnimations().length > 32) throw new Error('Rig motion exceeds node/clip cap');
  const nodes = root.listNodes().map(node => ({ name: node.getName(), parent: node.getParentNode()?.getName() ?? null,
    position: [...node.getTranslation()], quaternion: [...node.getRotation()], scale: [...node.getScale()] }));
  const clips = root.listAnimations().map(animation => {
    if (animation.listChannels().length > 256) throw new Error('Rig animation exceeds track cap');
    const bindings = new Set<string>();
    const tracks = animation.listChannels().map(channel => {
      const target = channel.getTargetNode(), path = channel.getTargetPath(), sampler = channel.getSampler();
      const name = target?.getName(), input = sampler?.getInput(), output = sampler?.getOutput(), interpolation = sampler?.getInterpolation();
      if (!name || !/^[a-z0-9_-]{1,128}$/iu.test(name) || nodes.filter(node => node.name === name).length !== 1 || path !== 'translation' && path !== 'rotation' && path !== 'scale') throw new Error('Rig animation requires a distinct named transform target');
      const property = path === 'translation' ? 'position' : path === 'rotation' ? 'quaternion' : 'scale';
      const binding = `${name}.${property}`;
      if (bindings.has(binding)) throw new Error('Duplicate rig animation binding'); bindings.add(binding);
      const times = input?.getArray(), values = output?.getArray(), size = path === 'rotation' ? 4 : 3;
      if (!(times instanceof Float32Array) || !(values instanceof Float32Array) || input?.getType() !== 'SCALAR' || input.getNormalized() || output?.getNormalized() || output?.getElementSize() !== size ||
        times.length === 0 || times.length > 4097 || values.length !== times.length * size ||
        times.some((time, index) => !Number.isFinite(time) || time < 0 || time > 60 || index > 0 && time <= (times[index - 1] ?? Infinity)) || values.some(value => !Number.isFinite(value))) throw new Error('Invalid bounded rig animation keys');
      if (interpolation !== 'LINEAR' && interpolation !== 'STEP') throw new Error('Rig animation requires standard linear or step interpolation');
      const mode = interpolation === 'STEP' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
      return path === 'rotation' ? new THREE.QuaternionKeyframeTrack(binding, Float32Array.from(times), Float32Array.from(values), mode) :
        new THREE.VectorKeyframeTrack(binding, Float32Array.from(times), Float32Array.from(values), mode);
    });
    tracks.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    return new THREE.AnimationClip(animation.getName(), -1, tracks);
  });
  return { clips, nodes };
}
