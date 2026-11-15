import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { readSourceModel } from '../bake/skinned';
import { creatureGlb } from './creature';
import { SceneRefusalError } from './lower';

// SHARD-SOURCE AP23a: a Group of bone nodes and meshes, with clips, compiles to a skinned GLB rig.
const cloth = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 });
function fixture(): { body: THREE.Group; clips: THREE.AnimationClip[] } {
  const body = new THREE.Group(); body.name = 'fixture'; body.position.set(40, 2, -7); body.rotation.y = 1.1;
  const hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = 1; body.add(hips);
  const arm = new THREE.Object3D(); arm.name = 'arm'; arm.position.set(0.5, 0.3, 0); hips.add(arm);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.3), cloth); torso.name = 'torso'; hips.add(torso);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), cloth); hand.name = 'hand'; hand.position.y = -0.2; hand.rotation.z = 0.3; arm.add(hand);
  const q = (angle: number): number[] => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle).toArray();
  const clips = [
    new THREE.AnimationClip('walk', 1, [new THREE.QuaternionKeyframeTrack('hips.quaternion', [0, 0.5, 1], [...q(0), ...q(0.2), ...q(0)])]),
    new THREE.AnimationClip('attack', 0.6, [new THREE.QuaternionKeyframeTrack('arm.quaternion', [0, 0.3, 0.6], [...q(0), ...q(-1.2), ...q(0)])]),
  ];
  return { body, clips };
}

test('three bones, two clips; each mesh rides only its nearest bone (AP23a)', async () => {
  const { body, clips } = fixture();
  const rig = creatureGlb(body, { clips });
  expect(rig.bones.map((b) => [b.name, b.parent])).toEqual([['fixture', null], ['hips', 'fixture'], ['arm', 'hips']]);
  expect(rig.bones[2]?.pos.map((n) => Math.round(n * 1000) / 1000)).toEqual([0.5, 1.3, 0]);
  expect(rig.clips).toEqual(['walk', 'attack']);
  expect(parseGlb(rig.glb).triangles).toBe(24);
  const { gltf } = await readSourceModel(rig.glb);
  expect(gltf.animations.map((a) => a.name)).toEqual(['walk', 'attack']);
  const skinned: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
  // three's loader renames the root joint (`fixture_1`): the scene node already holds the name
  expect(skinned[0]?.skeleton.bones.map((b) => b.name).slice(1)).toEqual(['hips', 'arm']);
  const jointsOf = (name: string): Set<number> => { const mesh = skinned.find((m) => m.name.endsWith(name)); const a = mesh?.geometry.getAttribute('skinIndex'); const out = new Set<number>(); for (let i = 0; i < (a?.count ?? 0); i++) out.add(a?.getX(i) ?? -1); return out; };
  expect(jointsOf('hand')).toEqual(new Set([2]));
  expect(jointsOf('torso')).toEqual(new Set([1]));
  // the hand's rest rotation is baked into its mesh: it hangs where the scene drew it, in the creature's own frame
  const hand = skinned.find((m) => m.name.endsWith('hand')); hand?.geometry.computeBoundingBox();
  expect(hand?.geometry.boundingBox?.getCenter(new THREE.Vector3()).y).toBeCloseTo(1.1, 2);
});

test('a rotated bone, an unknown track and a mapped part are refused by name (AP23a)', () => {
  const rotated = fixture(); const hips = rotated.body.getObjectByName('hips'); if (hips !== undefined) hips.rotation.x = 0.4;
  expect(() => creatureGlb(rotated.body)).toThrow(/fixture\/hips: a bone rests rotated or scaled/u);
  const unknown = fixture();
  expect(() => creatureGlb(unknown.body, { clips: [new THREE.AnimationClip('tail', 1, [new THREE.NumberKeyframeTrack('tail.position[y]', [0], [0])])] })).toThrow(SceneRefusalError);
  const mapped = fixture(); const torso = mapped.body.getObjectByName('torso') as THREE.Mesh;
  torso.material = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) });
  expect(() => creatureGlb(mapped.body)).toThrow(/map has no lowering yet/u);
});
