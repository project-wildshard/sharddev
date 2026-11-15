import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { LookLightSchema } from '@wildshard/format/look-light';
import * as v from 'valibot';
import { readSourceModel } from '../bake/skinned';
import { creatureGlb, creatureLampRows, creatureSkin } from './creature';
import { SceneRefusalError } from './lower';

// SHARD-SOURCE AP23a: a Group of bone nodes and meshes, with clips, compiles to a skinned GLB rig.
const cloth = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 });
function fixture(): { body: THREE.Group; clips: THREE.AnimationClip[] } {
  const body = new THREE.Group(); body.name = 'fixture'; body.position.set(40, 2, -7); body.rotation.y = 1.1;
  const hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = 1; body.add(hips);
  const arm = new THREE.Object3D(); arm.name = 'arm'; arm.position.set(0.5, 0.3, 0); hips.add(arm);
  const head = new THREE.Object3D(); head.name = 'head'; head.position.y = 0.5; hips.add(head);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), cloth); face.name = 'face'; head.add(face);
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
  expect(rig.bones.map((b) => [b.name, b.parent])).toEqual([['hips', null], ['arm', 'hips'], ['head', 'hips']]);
  expect(rig.bones[1]?.pos.map((n) => Math.round(n * 1000) / 1000)).toEqual([0.5, 1.3, 0]);
  expect(rig.clips).toEqual(['walk', 'attack']);
  expect(parseGlb(rig.glb).triangles).toBe(36);
  const { gltf } = await readSourceModel(rig.glb);
  expect(gltf.animations.map((a) => a.name)).toEqual(['walk', 'attack']);
  const skinned: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
  expect(skinned[0]?.skeleton.bones.map((b) => b.name)).toEqual(['hips', 'arm', 'head']);
  const jointsOf = (name: string): Set<number> => { const mesh = skinned.find((m) => m.name.endsWith(name)); const a = mesh?.geometry.getAttribute('skinIndex'); const out = new Set<number>(); for (let i = 0; i < (a?.count ?? 0); i++) out.add(a?.getX(i) ?? -1); return out; };
  expect(jointsOf('hand')).toEqual(new Set([1]));
  expect(jointsOf('torso')).toEqual(new Set([0]));
  expect(jointsOf('face')).toEqual(new Set([2]));
  // the hand's rest rotation is baked into its mesh: it hangs where the scene drew it, in the creature's own frame
  const hand = skinned.find((m) => m.name.endsWith('hand')); hand?.geometry.computeBoundingBox();
  expect(hand?.geometry.boundingBox?.getCenter(new THREE.Vector3()).y).toBeCloseTo(1.1, 2);
});

test('a rotated bone, an unknown track and a mapped part are refused by name (AP23a)', () => {
  const rotated = fixture(); const hips = rotated.body.getObjectByName('hips'); if (hips !== undefined) hips.rotation.x = 0.4;
  expect(() => creatureGlb(rotated.body)).toThrow(/fixture\/hips: a bone rests rotated or scaled/u);
  const loose = fixture(); loose.body.add(new THREE.Mesh(new THREE.BoxGeometry(), cloth));
  expect(() => creatureGlb(loose.body)).toThrow(/hangs under no bone/u);
  const unknown = fixture();
  expect(() => creatureGlb(unknown.body, { clips: [new THREE.AnimationClip('tail', 1, [new THREE.NumberKeyframeTrack('tail.position[y]', [0], [0])])] })).toThrow(SceneRefusalError);
  const mapped = fixture(); const torso = mapped.body.getObjectByName('torso') as THREE.Mesh;
  torso.material = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) });
  expect(() => creatureGlb(mapped.body)).toThrow(/map has no lowering yet/u);
});

test('a bandit-shaped rig writes the skin rows bandit.skin.json holds, bones and clips (AP23b)', () => {
  // shard-brasscap src/sources/bandit.skin.json (b7bbc22): the rig row the tin bandit's species binds
  const checkedIn = { clips: ['idle', 'walk', 'attack', 'hit', 'die'], joints: [['body', 'head']], skeleton: 'brasscap.bandit', sockets: ['body', 'head'] };
  const bandit = new THREE.Group(); bandit.name = 'bandit';
  const body = new THREE.Group(); body.name = 'body'; body.position.y = 0.62; bandit.add(body);
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.38; body.add(head);
  const tin = new THREE.MeshStandardMaterial({ color: '#8a9198', metalness: 0.45, roughness: 0.45 });
  const eye = new THREE.MeshStandardMaterial({ color: '#ffc030' }); eye.name = 'Eye';
  body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), tin)); head.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), tin), new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eye));
  const still = (clip: string): THREE.AnimationClip => new THREE.AnimationClip(clip, 1, [new THREE.VectorKeyframeTrack('body.position', [0, 1], [0, 0.62, 0, 0, 0.62, 0]), new THREE.VectorKeyframeTrack('head.position', [0, 1], [0, 0.38, 0, 0, 0.38, 0])]);
  const rig = creatureGlb(bandit, { clips: checkedIn.clips.map(still) });
  const skin = creatureSkin(rig, { id: 'brasscap.bandit', binding: { loops: ['idle', 'walk'], material: { family: 'pbr', vertexColours: true, metalness: 0.45, roughness: 0.45 }, materials: { Eye: 'glow' } } });
  expect(skin.row['rig']).toEqual(checkedIn);
  expect(skin.row).toMatchObject({ id: 'brasscap.bandit', family: 'toon', cost: { triangles: parseGlb(rig.glb).triangles } });
  expect(skin.row['file']).toMatch(/^[0-9a-f]{64}$/u);
  expect(skin.binding).toEqual({ loops: ['idle', 'walk'], material: { family: 'pbr', vertexColours: true, metalness: 0.45, roughness: 0.45 }, materials: { Eye: 'glow' }, skin: 'brasscap.bandit' });
  expect(rig.bones[1]?.pos[1]).toBeCloseTo(1.0);
  expect(() => creatureSkin(rig, { id: 'x', binding: { loops: ['run'], material: {} } })).toThrow(/loop run is not one of the rig's clips/u);
});

test('a PointLight under a bone becomes a lamp row that follows the actor\'s bone (AP24c)', () => {
  const { body, clips } = fixture();
  const eyes = new THREE.PointLight('#ff6020', 6, 9, 2); eyes.name = 'eyes'; eyes.position.set(0, 0.05, 0.12);
  body.getObjectByName('head')?.add(eyes);
  const rig = creatureGlb(body, { clips });
  expect(rig.bones.map((b) => b.name)).toEqual(['hips', 'arm', 'head']);
  const [row] = creatureLampRows(rig, 'boss.warden');
  expect(row?.follow).toEqual({ actor: 'boss.warden', bone: 'head' });
  expect(row?.at.map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 0.05, 0.12]);
  expect(row?.colour[0]).toBeCloseTo(new THREE.Color('#ff6020').r);
  expect([row?.intensity, row?.distance, row?.decay]).toEqual([6, 9, 2]);
  // shard-format v0.5.9 reads it as a look lamp
  expect(v.parse(LookLightSchema, { lamps: creatureLampRows(rig, 'boss.warden') }).lamps?.[0]?.follow).toEqual({ actor: 'boss.warden', bone: 'head' });
  const loose = fixture(); loose.body.add(new THREE.PointLight('#fff', 1, 4));
  expect(() => creatureGlb(loose.body)).toThrow(/a creature light hangs under no bone/u);
  const endless = fixture(); endless.body.getObjectByName('head')?.add(new THREE.PointLight('#fff', 1, 0));
  expect(() => creatureLampRows(creatureGlb(endless.body), 'boss.warden')).toThrow(/a following lamp needs a distance/u);
});
