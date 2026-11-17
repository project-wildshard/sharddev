import { expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Exercise actual shipped pose layers through apply and restore.
import { readFileSync } from 'node:fs';
import { Bone, Euler } from 'three';
import { parseSkinFile } from '@wildshard/format/skinAssets';
import { withPortableMath } from './fake/portableMath';
import { bindSkinPoseLayers, compileSkinPoseLayers } from '../src/client/game/shardfile/skinLayerPlayback';
import { bindSkinPoseLayers as originalBinding, compileSkinPoseLayers as originalCompile } from './fixtures/skin-layer-before';

for (const portable of [false, true]) test(`the shipped Template layers apply and restore every ${portable ? 'portable' : 'native'} pose component`, () => {
 const check = (): void => {
  const { row, binding } = parseSkinFile(readFileSync('src/shards/_template/assets/bfa4dfc9c18979f904557ee8deab0058b8a399be10266f5fb1578b403f482fd4'));
  const names = row.rig.joints[0]; if (names === undefined) throw new Error('Missing original joints');
  const scratch = new Euler();
  for (const layers of Object.values(binding.poseLayers ?? {})) {
    if (layers === undefined) continue;
    const bones = names.map(name => { const bone = new Bone(); bone.name = name; return bone; });
    const pose = bindSkinPoseLayers(compileSkinPoseLayers(layers, names), bones);
    const apply = pose.apply, restore = pose.restore;
    const originalBones = names.map(name => { const bone = new Bone(); bone.name = name; return bone; });
    const original = originalBinding(originalCompile(layers, names), originalBones);
    const values = new Float64Array(bones.length * 10), originalValues = new Float64Array(values.length);
    for (let frame = 0; frame < 257; frame++) {
      const time = frame * 0.137;
      for (let index = 0; index < bones.length; index++) {
        const bone = bones[index]; if (bone === undefined) throw new Error('Missing original joint');
        bone.position.set(index * 0.1, frame * 0.001, -index * 0.2);
        bone.scale.set(1.1, 0.9, 1.2);
        bone.quaternion.setFromEuler(scratch.set(time * 0.01, index * 0.02, -time * 0.03));
        const prior = originalBones[index]; if (prior === undefined) throw new Error('Missing original joint');
        prior.position.copy(bone.position); prior.quaternion.copy(bone.quaternion); prior.scale.copy(bone.scale);
      }
      const before = bones.flatMap(bone => bone.position.toArray().concat(bone.quaternion.toArray(), bone.scale.toArray()));
      original.apply(time); apply(time);
      for (let index = 0; index < bones.length; index++) {
        const bone = bones[index]; if (bone === undefined) throw new Error('Missing posed joint');
        bone.position.toArray(values, index * 10);
        bone.quaternion.toArray(values, index * 10 + 3);
        bone.scale.toArray(values, index * 10 + 7);
        const prior = originalBones[index]; if (prior === undefined) throw new Error('Missing original posed joint');
        prior.position.toArray(originalValues, index * 10); prior.quaternion.toArray(originalValues, index * 10 + 3); prior.scale.toArray(originalValues, index * 10 + 7);
      }
      expect(new Uint8Array(values.buffer)).toEqual(new Uint8Array(originalValues.buffer));
      restore(); original.restore();
      expect(originalBones.flatMap(bone => bone.position.toArray().concat(bone.quaternion.toArray(), bone.scale.toArray()))).toEqual(before);
      expect(bones.flatMap(bone => bone.position.toArray().concat(bone.quaternion.toArray(), bone.scale.toArray()))).toEqual(before);
    }
    expect(() => { pose.apply(-1); }).toThrow('Invalid skin layer clock');
    expect(() => { pose.apply(Number.NaN); }).toThrow('Invalid skin layer clock');
  }
 };
 if (portable) withPortableMath(check); else check();
});
