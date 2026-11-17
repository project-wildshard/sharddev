import type { Accessor, Node } from '@gltf-transform/core';
import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons';
import type { CreatureSkeleton } from '@wildshard/format/creatureLayers';
import { parseGlbData, prepareGlbCost } from '@wildshard/format/glbCost';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { readRigDocument, writeRigDocument } from '../bake/rig';
import type { CreatureRig } from './creature';

/** Each array follows the defining chain's order, with the source's names. */
export interface CreatureChainMap {
  readonly root: string;
  readonly chains: Readonly<Record<string, readonly string[]>>;
}
export type CreatureImportPreset = 'mixamo' | 'rigify';
export interface CreatureImportOptions {
  readonly skeleton: CreatureSkeleton;
  readonly map: CreatureChainMap | CreatureImportPreset;
}
export interface ImportedCreatureRig extends CreatureRig {
  readonly skeleton: CreatureSkeleton;
  /** Actual joint names; named socket aliases remain in the defining contract. */
  readonly sockets: readonly string[];
}
const PRESETS: Readonly<Record<CreatureImportPreset, CreatureChainMap>> = {
  mixamo: { root: 'Armature', chains: {
    spine: ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head'],
    'arm.L': ['mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand'],
    'arm.R': ['mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand'],
    'leg.L': ['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot'],
    'leg.R': ['mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot'],
  } },
  rigify: { root: 'root', chains: {
    spine: ['DEF-spine', 'DEF-spine.001', 'DEF-spine.003', 'DEF-spine.004', 'DEF-spine.006'],
    'arm.L': ['DEF-upper_arm.L', 'DEF-forearm.L', 'DEF-hand.L'],
    'arm.R': ['DEF-upper_arm.R', 'DEF-forearm.R', 'DEF-hand.R'],
    'leg.L': ['DEF-thigh.L', 'DEF-shin.L', 'DEF-foot.L'],
    'leg.R': ['DEF-thigh.R', 'DEF-shin.R', 'DEF-foot.R'],
  } },
};

/** Rename a bounded, translation-bind skin without resampling or changing any
 * weights/clip targets. Rotated/scaled binds must be baked by the source tool,
 * as required by the existing platform skin contract. No source bytes mutate. */
export async function importCreatureGlb(bytes: Uint8Array, options: CreatureImportOptions): Promise<ImportedCreatureRig> {
  if (bytes.length < 20 || bytes.length > 64_000_000) throw new Error('creature import requires bounded GLB bytes');
  await prepareGlbCost(); parseGlbData(bytes);
  const document = await readRigDocument(bytes), root = document.getRoot(), contract = CREATURE_SKELETONS[options.skeleton];
  if (root.listNodes().length > 4096 || contract === undefined) throw new Error('chain root: invalid skeleton or node count');
  if (typeof options.map === 'string' && options.skeleton !== 'biped') throw new Error(`chain root: ${options.map} requires biped`);
  const map = typeof options.map === 'string' ? PRESETS[options.map] : options.map;
  const skin = root.listSkins()[0], skinned = root.listNodes().filter(node => node.getSkin() !== null);
  if (root.listSkins().length !== 1 || skin === undefined || skinned.length !== 1) throw new Error('creature import requires one skin node');
  const joints = skin.listJoints(), inverse = skin.getInverseBindMatrices(), values = inverse?.getArray();
  if (!(values instanceof Float32Array) || inverse === null || inverse === undefined || values.length !== joints.length * 16 || values.some(value => !Number.isFinite(value))) throw new Error('creature import requires finite explicit float inverse binds');
  const names = new Map<Node, string>();
  const resolve = (source: string, chain: string): Node => {
    const aliases = options.map === 'mixamo' ? [source, source.replace('mixamorig:', 'mixamorig')] : [source];
    const found = root.listNodes().filter(node => aliases.includes(node.getName())), node = found[0];
    if (found.length !== 1 || node === undefined) throw new Error(`chain ${chain}: ${found.length === 0 ? 'missing' : 'ambiguous'} ${source}`);
    if (names.has(node)) throw new Error(`chain ${chain}: duplicate source joint ${source}`);
    return node;
  };
  const body = resolve(map.root, 'root'); names.set(body, contract.root);
  for (const key of Object.keys(map.chains)) if (!Object.hasOwn(contract.chains, key)) throw new Error(`chain ${key}: unknown chain`);
  for (const [key, chain] of Object.entries(contract.chains)) {
    const input = map.chains[key];
    if (input?.length !== chain.bones.length) throw new Error(`chain ${key}: expected ${chain.bones.length} joints`);
    for (const [index, target] of chain.bones.entries()) {
      const source = input[index]; if (source === undefined) throw new Error(`chain ${key}: missing ${target}`);
      const node = resolve(source, key);
      if (!joints.includes(node)) throw new Error(`chain ${key}: ${source} is not a skin joint`);
      names.set(node, target);
    }
  }
  // A chain may contain extra source joints (shoulders, twist bones), but its
  // selected joints must follow their actual ancestor order.
  for (const [key, chain] of Object.entries(contract.chains)) {
    let parent = [...names].find(([, name]) => name === chain.parent)?.[0];
    for (const target of chain.bones) {
      const node = [...names].find(([, name]) => name === target)?.[0];
      let ancestor = node?.getParentNode();
      while (ancestor !== null && ancestor !== undefined && ancestor !== parent) ancestor = ancestor.getParentNode();
      if (node === undefined || parent === undefined || ancestor !== parent) throw new Error(`chain ${key}: ${target} is outside its parent chain`);
      parent = node;
    }
  }
  const ordered: Node[] = [], members = new Set([body, ...joints]);
  const append = (node: Node): void => {
    if (ordered.includes(node)) return;
    const parent = node.getParentNode(); if (parent !== null && members.has(parent)) append(parent);
    ordered.push(node);
  };
  append(body); for (const joint of joints) append(joint);
  if (ordered.length > 32) throw new Error('creature import exceeds 32 joints');
  const finalNames = ordered.map(node => names.get(node) ?? node.getName());
  if (finalNames.some(name => name === '') || new Set(finalNames).size !== finalNames.length) throw new Error('chain root: ambiguous resulting joint name');
  for (const node of root.listNodes()) if (!members.has(node) && finalNames.includes(node.getName())) throw new Error(`chain root: ambiguous resulting node ${node.getName()}`);
  const matrices = new Float32Array(ordered.length * 16), p = new Vector3(), q = new Quaternion(), scale = new Vector3();
  for (const [index, node] of ordered.entries()) {
    const old = joints.indexOf(node), matrix = old === -1 ? new Matrix4().fromArray(node.getWorldMatrix()).invert() : new Matrix4().fromArray(values, old * 16);
    if (!Number.isFinite(matrix.determinant()) || Math.abs(matrix.determinant()) < 1e-12) throw new Error(`chain root: singular bind ${node.getName()}`);
    matrix.toArray(matrices, index * 16); matrix.invert().decompose(p, q, scale);
    if (Math.abs(Math.abs(q.w) - 1) > 1e-5 || Math.abs(scale.x - 1) + Math.abs(scale.y - 1) + Math.abs(scale.z - 1) > 1e-5) throw new Error(`chain root: bake rotated/scaled bind ${node.getName()}`);
  }
  const changed = new Set<Accessor>();
  for (const node of skinned) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const accessor = primitive.getAttribute('JOINTS_0'), array = accessor?.getArray();
    if (accessor === null || accessor === undefined || !(array instanceof Uint8Array || array instanceof Uint16Array)) throw new Error('creature import requires integer joint indices');
    if (changed.has(accessor)) continue; changed.add(accessor);
    const remapped = array.slice();
    for (let index = 0; index < remapped.length; index++) {
      const joint = joints[array[index] ?? -1], mapped = joint === undefined ? -1 : ordered.indexOf(joint);
      if (mapped === -1) throw new Error('creature import joint index is outside its skin'); remapped[index] = mapped;
    }
    accessor.setArray(remapped);
  }
  for (const joint of joints) skin.removeJoint(joint);
  for (const node of ordered) skin.addJoint(node);
  skin.setSkeleton(body);
  inverse.setArray(matrices);
  for (const [node, name] of names) node.setName(name);
  const glb = await writeRigDocument(document); parseGlbData(glb);
  const bones = ordered.map((node, index) => {
    let parent = node.getParentNode(); while (parent !== null && !members.has(parent)) parent = parent.getParentNode();
    const position = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(matrices, index * 16).invert());
    return { name: node.getName(), parent: parent?.getName() ?? null, pos: [position.x, position.y, position.z] as const };
  });
  return { glb, bones, lamps: [], skeleton: options.skeleton, clips: root.listAnimations().map(clip => clip.getName()),
    sockets: [...new Set(Object.values(contract.sockets).map(socket => socket.bone))] };
}
