import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Bone, BufferAttribute, BufferGeometry, Matrix4, Skeleton, SkinnedMesh, Vector3, type MeshStandardMaterial } from 'three';
import { AnimalSim } from '../../../../src/shared/engine/entities/AnimalSim';
import { Animal } from '../../../../src/client/engine/entities/AnimalView';
import type { AnimalModel } from '../../../../src/client/engine/entities/AnimalFactory';
import { variantMods } from '../../../../src/shared/engine/entities/species/registry';
import { speciesWithLook } from '../../../../src/client/engine/entities/species/look';
import { setLowPoly, isLowPoly } from '../../../../src/client/engine/entities/species/loft';
import { mergeAnimalGeometry } from '../../../../src/client/engine/models/animalGeometry';
import { facetGeometry, lowPolyMaterials, oneMaterial } from '../../../../src/client/engine/entities/lowpoly';
import { Rng } from '../../../../src/shared/engine/core/rng';
import { BOAR } from '../../../../src/client/game/systems/species/boar';
import { BOAR_LOOK } from '../../../../src/client/game/systems/species/view/boar';
import { GREY_BLOB_SOURCE, GREY_BLOB_SOURCE_LOOK } from './greyBlobSource';
import { rigLegs } from '../../../../src/shards/pine-hollow/generators/npcSkin';
import { legBones, legPose } from '../../../../src/client/game/systems/npc/npcRig';
import { MeshStandardMaterial as StandardMaterial } from 'three';
import type { ClipName } from '../../../../src/client/engine/anim/rig';

/** Trusted originals used by export fixtures; the runtime loads only the resulting bytes and rig metadata. */
export interface SkinSource { mesh: SkinnedMesh; skeleton: string; clips: readonly ClipName[]; sockets: string[]; pose: (clip: ClipName, time: number, dt: number, phase?: number) => void; dispose: () => void }
/** Construct the template's actual faceted grey blob or boar, including the same factory merge, facet, palette and bone offsets. */
export function creatureSkinSource(kind: 'grey-blob' | 'boar'): SkinSource {
  const species = kind === 'boar' ? speciesWithLook(BOAR, BOAR_LOOK) : speciesWithLook(GREY_BLOB_SOURCE, GREY_BLOB_SOURCE_LOOK), variant = species.variants[0]; if (variant === undefined) throw new Error('Missing creature variant');
  let seed = 2166136261; const key = `${species.kind}:${variant.id}`; for (let i = 0; i < key.length; i++) { seed ^= key.charCodeAt(i); seed = Math.imul(seed, 16777619); }
  const prior = isLowPoly(); setLowPoly(true); const built = species.build(variant, new Rng(seed >>> 0)); setLowPoly(prior);
  const geometry = facetGeometry(mergeAnimalGeometry(built.furParts, built.hardParts, built.eyeParts), built.facetJitter); oneMaterial(geometry, null);
  const materials = lowPolyMaterials(), model: AnimalModel = { kind: species.kind, variant: variant.id, style: 'toon', render: { lowPoly: true, waitForModels: false, furRim: false, tintRange: 0, oneMaterial: true }, species, variantDef: variant, geometry, bones: built.bones, dims: built.dims, fur: materials.fur, hard: materials.hard, eye: materials.eye, shells: [] };
  const bones: Record<string, Bone> = {}, ordered: Bone[] = [], mesh = new SkinnedMesh(geometry, materials.fur);
  for (const def of built.bones) { const bone = new Bone(); bone.name = def.name; const parent = def.parent === null ? null : built.bones.find((candidate) => candidate.name === def.parent); if (parent === undefined) throw new Error('Missing creature joint parent');
    bone.position.set(def.pos[0] - (parent?.pos[0] ?? 0), def.pos[1] - (parent?.pos[1] ?? 0), def.pos[2] - (parent?.pos[2] ?? 0)); const owner = parent === null ? mesh : bones[parent.name]; if (owner === undefined) throw new Error('Unordered creature joint'); owner.add(bone); bones[def.name] = bone; ordered.push(bone);
  }
  mesh.updateMatrixWorld(true); mesh.bind(new Skeleton(ordered)); mesh.castShadow = true; const animal = new Animal({ mesh, bones, materials: [materials.fur] }, model, 435), simulation = new AnimalSim({ kind: species.kind, label: variant.label, variant: variant.id, rarity: variant.rarity, hp: animal.maxHp, aggressive: species.aggressive ?? false, dims: built.dims, mods: variantMods(species, variant) }, 435, 1, animal.entityId, { heightAt: () => 0, random: () => 0.5, now: () => 0 }); animal.bindSimulation(simulation);
  const clips: readonly ClipName[] = ['idle', 'walk', 'attack', 'hit', 'die', ...(kind === 'boar' ? ['idle.graze' as const] : [])];
  return { mesh, skeleton: species.rigContract.skeleton, clips, sockets: [...species.rigContract.sockets], pose: (clip, t, dt, phase) => {
    animal.debugGait = { gait: clip === 'walk' ? 'walk' : clip === 'idle.graze' ? 'graze' : 'idle', phase: phase ?? t % 1 }; if (t === 0) { if (clip === 'attack') animal.startAttack(1); if (clip === 'hit') animal.stagger(new Vector3(0, 0, 1), 1); if (clip === 'die') animal.applyFinalDamage(10000, new Vector3(0, 1, 0), new Vector3(1, 0, 0)); }
    simulation.step(dt); animal.update(dt, t, true);
  }, dispose: () => { geometry.dispose(); mesh.skeleton.dispose(); for (const material of [materials.fur, materials.hard, materials.eye]) material.dispose(); } };
}
/** The exact ranger phone hull and Pine's current NPC leg/arm closure; generated texture bindings are kept separate from the skinned GLB. */
export async function rangerSkinSource(): Promise<SkinSource> {
  await MeshoptDecoder.ready; const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(process.cwd() + '/public/assets/pine-hollow/npcs/ranger.phone.glb'), node = doc.getRoot().listNodes().find((candidate) => candidate.getMesh() !== null), primitive = node?.getMesh()?.listPrimitives()[0];
  if (node === undefined || primitive === undefined) throw new Error('Missing ranger hull');
  const geometry = new BufferGeometry();
  for (const [semantic, key] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv']] as const) { const attr = primitive.getAttribute(semantic); if (attr === null) continue; const width = attr.getElementSize(), values = new Float32Array(attr.getCount() * width), element: number[] = []; for (let i = 0; i < attr.getCount(); i++) { attr.getElement(i, element); values.set(element, i * width); } geometry.setAttribute(key, new BufferAttribute(values, width)); }
  const indices = primitive.getIndices()?.getArray(); if (indices !== null && indices !== undefined) geometry.setIndex(Array.from(indices)); geometry.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix())); geometry.computeBoundingBox(); const box = geometry.boundingBox; if (box === null || box.max.y - box.min.y < 1 || box.max.y - box.min.y > 3) throw new Error('Ranger hull must retain its metre scale');
  const built = rigLegs({id:'pine.ranger',lantern:true}, geometry), bones = legBones(built), material: MeshStandardMaterial = new StandardMaterial({ roughness: 0.85, metalness: 0 }), mesh = new SkinnedMesh(built.geometry, material), root = bones[0]; if (root === undefined) throw new Error('Missing ranger root'); mesh.add(root); mesh.updateMatrixWorld(true); mesh.bind(new Skeleton(bones)); mesh.castShadow = true;
  const pose = legPose(bones, built), clips: readonly ClipName[] = ['idle', 'walk', 'idle.talk', 'idle.point'];
  return { mesh, skeleton: 'npc.pine.ranger.v1', clips, sockets: ['head', 'handR'], pose: (clip, t, _dt, phase) => pose({ t, talk: clip === 'idle.talk' ? 1 : 0, point: clip === 'idle.point' ? 1 : 0, pointYaw: 0.4, look: 0.2, walk: clip === 'walk' ? 1 : 0, phase: phase ?? t % 1 }), dispose: () => { geometry.dispose(); built.geometry.dispose(); material.dispose(); mesh.skeleton.dispose(); } };
}
