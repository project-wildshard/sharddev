import { expect, test } from 'vitest';
import { Matrix4 } from 'three';
import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons';
import { parseSkinRows, parseSkinBindings } from '@wildshard/format/skinData';
import { importCreatureGlb } from './creatureImport';
import { creatureSkin } from './creature';
import { readRigDocument } from '../bake/rig';
import { importedBiped, MIXAMO } from '../../../test/fixtures/creature-import';

test.each(['mixamo', 'rigify'] as const)('%s GLB maps real joints, weights, clip targets and attachments without mutating bytes', async preset => {
  const source = await importedBiped(preset), original = source.slice(), before = (await readRigDocument(source)).getRoot();
  const imported = await importCreatureGlb(source, { skeleton: 'biped', map: preset }), after = (await readRigDocument(imported.glb)).getRoot();
  const expected = ['body', ...Object.values(CREATURE_SKELETONS.biped.chains).flatMap(chain => chain.bones)];
  expect(imported.bones.map(bone => bone.name)).toEqual(expected);
  expect(after.listSkins()[0]?.listJoints().map(node => node.getName())).toEqual(expected);
  const a = before.listMeshes()[0]?.listPrimitives()[0], b = after.listMeshes()[0]?.listPrimitives()[0];
  for (const channel of ['POSITION', 'NORMAL', 'WEIGHTS_0', 'JOINTS_0']) expect(b?.getAttribute(channel)?.getArray()).toEqual(a?.getAttribute(channel)?.getArray());
  const oldClip = before.listAnimations()[0], clip = after.listAnimations()[0];
  expect(clip?.getName()).toBe('idle'); expect(clip?.listChannels()[0]?.getTargetNode()?.getName()).toBe('hand.L');
  expect(clip?.listSamplers()[0]?.getOutput()?.getArray()).toEqual(oldClip?.listSamplers()[0]?.getOutput()?.getArray());
  expect(after.listNodes().find(node => node.getName() === 'attachment.fixture')?.getParentNode()?.getName()).toBe('head');
  expect(source).toEqual(original);
  const skin = creatureSkin(imported, { id: 'fixture.import', binding: { loops: ['idle'], material: { family: 'pbr', vertexColours: false } } });
  const rows = parseSkinRows([skin.row]); parseSkinBindings([skin.binding], rows);
  expect(rows[0]?.rig.joints).toEqual([expected]);
});

test('a non-joint armature becomes the identity body joint and remaps actual weighted indices', async () => {
  const source = await importedBiped('mixamo', document => {
    const root = document.getRoot(), skin = root.listSkins()[0], body = skin?.listJoints()[0], inverse = skin?.getInverseBindMatrices(), values = inverse?.getArray();
    if (skin === undefined || body === undefined || inverse === null || inverse === undefined || !(values instanceof Float32Array)) throw new Error('Missing real source skin');
    skin.removeJoint(body); inverse.setArray(values.slice(16));
    for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
      const joint = primitive.getAttribute('JOINTS_0'), input = joint?.getArray();
      if (!(input instanceof Uint16Array) || joint === null) throw new Error('Missing real source weights');
      joint.setArray(Uint16Array.from(input, index => Math.max(0, index - 1)));
    }
  });
  const imported = await importCreatureGlb(source, { skeleton: 'biped', map: 'mixamo' }), root = (await readRigDocument(imported.glb)).getRoot();
  expect(imported.bones[0]).toMatchObject({ name: 'body', parent: null, pos: [0, 0, 0] });
  expect(root.listSkins()[0]?.listJoints()).toHaveLength(18);
  expect(root.listMeshes()[0]?.listPrimitives()[0]?.getAttribute('JOINTS_0')?.getArray()?.[0]).toBe(1);
});

test('an explicit chain map takes the same real GLB path', async () => {
  const imported = await importCreatureGlb(await importedBiped('mixamo'), { skeleton: 'biped', map: MIXAMO });
  expect(imported.sockets).toEqual(['head', 'chest', 'hand.L', 'hand.R']);
});

test('unpunctuated Mixamo names retain the same preset and ambiguous aliases refuse', async () => {
  const plain = await importedBiped('mixamo', document => {
    for (const node of document.getRoot().listNodes()) node.setName(node.getName().replace('mixamorig:', 'mixamorig'));
  });
  expect((await importCreatureGlb(plain, { skeleton: 'biped', map: 'mixamo' })).bones.some(bone => bone.name === 'hand.L')).toBe(true);
  const ambiguous = await importedBiped('mixamo', document => {
    const body = document.getRoot().listNodes().find(node => node.getName() === 'Armature');
    body?.addChild(document.createNode('mixamorigLeftHand'));
  });
  await expect(importCreatureGlb(ambiguous, { skeleton: 'biped', map: 'mixamo' })).rejects.toThrow('chain arm.L: ambiguous mixamorig:LeftHand');
});

test('a missing leg names its chain before emitting a rig', async () => {
  const bytes = await importedBiped('mixamo', document => document.getRoot().listNodes().find(node => node.getName() === 'mixamorig:LeftFoot')?.setName('missing-foot'));
  await expect(importCreatureGlb(bytes, { skeleton: 'biped', map: 'mixamo' })).rejects.toThrow('chain leg.L: missing mixamorig:LeftFoot');
});

test('a duplicate source and a foreign chain refuse by chain', async () => {
  const bytes = await importedBiped('mixamo');
  await expect(importCreatureGlb(bytes, { skeleton: 'biped', map: { ...MIXAMO, chains: { ...MIXAMO.chains, 'arm.L': MIXAMO.chains['arm.R'] ?? [] } } })).rejects.toThrow('chain arm.R: duplicate source joint');
  await expect(importCreatureGlb(bytes, { skeleton: 'biped', map: { ...MIXAMO, chains: { ...MIXAMO.chains, wing: [] } } })).rejects.toThrow('chain wing: unknown chain');
  await expect(importCreatureGlb(bytes, { skeleton: 'biped', map: { ...MIXAMO, chains: { ...MIXAMO.chains, toString: [] } } })).rejects.toThrow('chain toString: unknown chain');
});

test('a detached hand refuses its chain and rotated binds retain the platform refusal', async () => {
  const detached = await importedBiped('mixamo', document => {
    const nodes = document.getRoot().listNodes(), head = nodes.find(node => node.getName() === 'mixamorig:Head'), hand = nodes.find(node => node.getName() === 'mixamorig:LeftHand');
    if (head === undefined || hand === undefined) throw new Error('Missing source chain'); head.addChild(hand);
  });
  await expect(importCreatureGlb(detached, { skeleton: 'biped', map: 'mixamo' })).rejects.toThrow('chain arm.L: hand.L is outside its parent chain');
  const rotated = await importedBiped('mixamo', document => {
    const inverse = document.getRoot().listSkins()[0]?.getInverseBindMatrices(), input = inverse?.getArray();
    if (inverse === null || inverse === undefined || !(input instanceof Float32Array)) throw new Error('Missing source bind');
    const array = input.slice(); array.set(new Matrix4().makeRotationY(.5).elements, 16); inverse.setArray(array);
  });
  await expect(importCreatureGlb(rotated, { skeleton: 'biped', map: 'mixamo' })).rejects.toThrow('chain root: bake rotated/scaled bind');
});
