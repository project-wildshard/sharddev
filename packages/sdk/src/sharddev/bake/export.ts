import { Document, NodeIO, type Accessor, type Node } from '@gltf-transform/core';
import { Matrix4, MeshStandardMaterial, type SkinnedMesh } from 'three';
import { parseGlb } from '../assets';

/** Uniform local TRS samples for the mesh root and each joint, in the declared skeleton order. */
export interface SampledSkinClip { name: string; times: Float32Array; root: { translation: Float32Array; rotation: Float32Array; scale: Float32Array }; joints: { translation: Float32Array; rotation: Float32Array; scale: Float32Array }[] }
/** Sample an existing pose closure at bounded cadence, including both endpoints; restore the mesh's initial joint pose afterward. */
export function sampleSkinClip(mesh: SkinnedMesh, name: string, duration: number, pose: (time: number, dt: number) => void, rate = 60): SampledSkinClip {
  if (!/^[a-z][a-z0-9.-]*$/u.test(name) || !Number.isFinite(duration) || duration <= 0 || duration > 60 || !Number.isInteger(rate) || rate < 30 || rate > 120 || Math.ceil(duration * rate) > 4096) throw new Error('Skin clip sampling cap');
  const bones = [mesh, ...mesh.skeleton.bones], rest = bones.map((bone) => ({ p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() })), n = Math.ceil(duration * rate), times = new Float32Array(n + 1), joints = bones.map(() => ({ translation: new Float32Array((n + 1) * 3), rotation: new Float32Array((n + 1) * 4), scale: new Float32Array((n + 1) * 3) }));
  try {
    for (let frame = 0; frame <= n; frame++) {
      const time = frame * duration / n; times[frame] = time; pose(time, frame === 0 ? 0 : duration / n); mesh.updateMatrixWorld(true);
      bones.forEach((bone, i) => { const joint = joints[i]; if (joint === undefined) throw new Error('Missing sampled joint');
        joint.translation.set(bone.position.toArray(), frame * 3); joint.scale.set(bone.scale.toArray(), frame * 3);
        const q = bone.quaternion.toArray(), previous = frame * 4 - 4;
        const sign = frame > 0 && q.reduce((sum, value, c) => sum + value * (joint.rotation[previous + c] ?? 0), 0) < 0 ? -1 : 1;
        joint.rotation.set(q.map((value) => value * sign), frame * 4);
      });
    }
  } finally { bones.forEach((bone, i) => { const value = rest[i]; if (value !== undefined) { bone.position.copy(value.p); bone.quaternion.copy(value.q); bone.scale.copy(value.s); } }); mesh.updateMatrixWorld(true); }
  const root = joints[0]; if (root === undefined) throw new Error('Missing sampled root');
  return { name, times, root, joints: joints.slice(1) };
}
/** Deterministic self-contained GLB of actual geometry, joint order, weights, inverse binds and sampled clips (constant channels keep only their endpoints); textures stay external KTX2 declarations. */
export async function skinnedGlb(mesh: SkinnedMesh, clips: readonly SampledSkinClip[], name = 'baked-skin'): Promise<Uint8Array> {
  const bones = mesh.skeleton.bones;
  if (bones.length === 0 || bones.length > 128 || new Set(bones.map((bone) => bone.name)).size !== bones.length || bones.some((bone) => !/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(bone.name)) || clips.length > 32 || new Set(clips.map((clip) => clip.name)).size !== clips.length) throw new Error('Skin joints or clips cap');
  mesh.updateMatrixWorld(true);
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene(name), root = doc.createNode(name).setTranslation(mesh.position.toArray()).setRotation(mesh.quaternion.toArray()).setScale(mesh.scale.toArray()); scene.addChild(root); doc.getRoot().setDefaultScene(scene);
  const accessor = (values: Float32Array | Uint16Array | Uint32Array, type: Parameters<Accessor['setType']>[0]) => { if (values.length === 0 || values.some((value) => !Number.isFinite(value))) throw new Error('Finite skin accessor required'); return doc.createAccessor().setType(type).setArray(values instanceof Uint16Array ? new Uint16Array(values) : values instanceof Uint32Array ? new Uint32Array(values) : new Float32Array(values)).setBuffer(buffer); };
  const nodes: Node[] = bones.map((bone) => doc.createNode(bone.name).setTranslation(bone.position.toArray()).setRotation(bone.quaternion.toArray()).setScale(bone.scale.toArray()));
  bones.forEach((bone, i) => { const node = nodes[i]; if (node === undefined) throw new Error('Missing joint'); const parent = bones.findIndex((candidate) => candidate.uuid === bone.parent?.uuid); if (parent === -1) { if (bone.parent !== mesh) throw new Error('Joint hierarchy must belong to the mesh'); root.addChild(node); } else { const owner = nodes[parent]; if (owner === undefined) throw new Error('Missing parent joint'); owner.addChild(node); } });
  const skin = doc.createSkin(name); for (const node of nodes) skin.addJoint(node);
  const inverse = new Float32Array(bones.length * 16); bones.forEach((_bone, i) => { const matrix = mesh.skeleton.boneInverses[i]; if (matrix === undefined) throw new Error('Missing inverse bind'); inverse.set(new Matrix4().multiplyMatrices(matrix, mesh.bindMatrix).elements, i * 16); }); skin.setInverseBindMatrices(accessor(inverse, 'MAT4')); root.setSkin(skin);
  const geometry = mesh.geometry, position = geometry.getAttribute('position'); if (!geometry.hasAttribute('position') || position.count > 400000) throw new Error('Skin geometry cap');
  const attrs = new Map<string, Accessor>();
  for (const [key, semantic, width] of [['position', 'POSITION', 3], ['normal', 'NORMAL', 3], ['uv', 'TEXCOORD_0', 2], ['color', 'COLOR_0', 3], ['skinIndex', 'JOINTS_0', 4], ['skinWeight', 'WEIGHTS_0', 4]] as const) {
    if (!geometry.hasAttribute(key)) { if (key === 'skinIndex' || key === 'skinWeight') throw new Error('Missing skin weights'); continue; }
    const attr = geometry.getAttribute(key); if (attr.count !== position.count || attr.itemSize !== width) throw new Error('Skin attribute shape');
    const values = Array.from({ length: attr.count * width }, (_, i) => attr.getComponent(Math.floor(i / width), i % width));
    if (key === 'skinIndex' && values.some((value) => !Number.isInteger(value) || value < 0 || value >= bones.length)) throw new Error('Skin joint index');
    attrs.set(semantic, accessor(key === 'skinIndex' ? Uint16Array.from(values) : Float32Array.from(values), width === 4 ? 'VEC4' : width === 3 ? 'VEC3' : 'VEC2'));
  }
  const index = geometry.getIndex(), indices = index === null ? Array.from({ length: position.count }, (_, i) => i) : Array.from(index.array), groups = geometry.groups.length === 0 ? [{ start: 0, count: indices.length, materialIndex: 0 }] : geometry.groups;
  if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= position.count) || indices.length % 3 !== 0) throw new Error('Skin triangle indices');
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material], output = doc.createMesh(name);
  for (const group of groups) {
    const mat = materials[group.materialIndex ?? 0]; if (!(mat instanceof MeshStandardMaterial) || mat.map !== null || mat.normalMap !== null || mat.alphaMap !== null || mat.roughnessMap !== null || mat.metalnessMap !== null) throw new Error('Skin material requires external KTX2 bindings');
    const material = doc.createMaterial(mat.name).setBaseColorFactor([mat.color.r, mat.color.g, mat.color.b, mat.opacity]).setMetallicFactor(mat.metalness).setRoughnessFactor(mat.roughness).setDoubleSided(mat.side === 2), primitive = doc.createPrimitive().setMaterial(material).setIndices(accessor(Uint32Array.from(indices.slice(group.start, group.start + group.count)), 'SCALAR'));
    for (const [semantic, a] of attrs) primitive.setAttribute(semantic, a); output.addPrimitive(primitive);
  }
  root.setMesh(output).setExtras({ castShadow: mesh.castShadow });
  for (const clip of clips) {
    if (clip.joints.length !== bones.length || clip.times.length < 2 || clip.times.length > 4097) throw new Error('Skin clip shape');
    const animation = doc.createAnimation(clip.name), times = accessor(clip.times, 'SCALAR');
    [clip.root, ...clip.joints].forEach((joint, i) => { const node = i === 0 ? root : nodes[i - 1]; if (node === undefined) throw new Error('Missing animation joint');
      for (const path of ['translation', 'rotation', 'scale'] as const) { const values = joint[path], width = path === 'rotation' ? 4 : 3; if (values.length !== clip.times.length * width) throw new Error('Skin clip channel shape');
        const constant = values.every((value, componentIndex) => value === values[componentIndex % width]);
        const input = constant ? accessor(Float32Array.of(clip.times[0] ?? 0, clip.times.at(-1) ?? 0), 'SCALAR') : times;
        const channelValues = constant ? Float32Array.from([...values.slice(0, width), ...values.slice(0, width)]) : values;
        const sampler = doc.createAnimationSampler().setInput(input).setOutput(accessor(channelValues, width === 4 ? 'VEC4' : 'VEC3')).setInterpolation('LINEAR'); animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(node).setTargetPath(path));
      }
    });
  }
  const bytes = await new NodeIO().writeBinary(doc); parseGlb(bytes); return bytes;
}
