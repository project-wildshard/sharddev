import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bipedBinding,
  bipedClips,
  quadrupedBinding,
  quadrupedClips,
  type ClipPackOptions,
} from '@wildshard/kit/clips'
import { skinnedGlb } from '@wildshard/sdk/bake/skinned'
import { parseGlbData, prepareGlbCost } from '@wildshard/shard-format/glbCost'
import {
  parseSkinBindings,
  parseSkinRows,
} from '@wildshard/shard-format/skinData'
import { AnimationClip, QuaternionKeyframeTrack } from 'three'

import { referenceSkeletonSource } from './skeletons.ts'

test('the canonical biped exports all four Kit clips and lets an owned walk take its name', async () => {
  const source = referenceSkeletonSource('biped')
  try {
    const defaults = bipedClips(source.bones)
    assert.deepEqual(
      defaults.map(clip => clip.name),
      ['idle', 'walk', 'hit', 'die'],
    )
    const death = defaults
      .find(clip => clip.name === 'die')
      ?.tracks.find(track => track.name === 'hips.quaternion')
    assert.ok(death)
    assert.notDeepEqual(death.values.slice(0, 4), death.values.slice(-4))
    const owned = new AnimationClip('walk', 1, [
      new QuaternionKeyframeTrack(
        'thigh.L.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0.5, 0, 0, Math.sqrt(0.75)],
      ),
    ])
    const options: ClipPackOptions = {
      defaults: ['walk', 'die'],
      owned: [owned],
    }
    const clips = bipedClips(source.bones, options)
    assert.deepEqual(
      clips.map(clip => clip.name),
      ['die', 'walk'],
    )
    assert.equal(clips[1], owned)
    const { glb } = skinnedGlb({ ...source, clips })
    await prepareGlbCost()
    const cost = parseGlbData(glb)
    const rows = parseSkinRows([
      {
        id: 'test.biped',
        file: 'a'.repeat(64),
        family: 'pbr',
        cost,
        rig: {
          skeleton: 'kit.biped',
          joints: [source.bones.map(bone => bone.name)],
          clips: clips.map(clip => clip.name),
          sockets: [],
        },
      },
    ])
    assert.deepEqual(
      parseSkinBindings([bipedBinding('test.biped', options)], rows)[0]?.loops,
      ['walk'],
    )
    assert.deepEqual(
      bipedBinding('test.biped', { defaults: ['die'] }).loops,
      [],
    )
    assert.throws(
      () => bipedClips(source.bones, { owned: [owned, owned] }),
      /duplicate owned clips/u,
    )
  } finally {
    for (const part of source.parts) {
      part.geometry.dispose()
      part.material.dispose()
    }
  }
})

test('the quadruped pack and binding fit the reference rig without decorative joints', () => {
  const source = referenceSkeletonSource('quadruped')
  try {
    const names = new Set(source.bones.map(bone => bone.name))
    const clips = quadrupedClips(source.bones),
      binding = quadrupedBinding('test.quad', source.bones)
    assert.deepEqual(
      clips.map(clip => clip.name),
      ['idle', 'walk', 'attack', 'hit', 'die', 'idle.graze'],
    )
    for (const clip of clips) {
      assert.ok(
        clip.tracks.every(track =>
          names.has(track.name.slice(0, track.name.lastIndexOf('.'))),
        ),
      )
    }
    for (const layers of Object.values(binding.poseLayers ?? {})) {
      assert.ok(
        layers?.every(layer =>
          layer.tracks.every(track => names.has(track.bone)),
        ) ?? true,
      )
    }
    assert.throws(
      () => quadrupedClips(source.bones.filter(bone => bone.name !== 'tail')),
      /chain tail/u,
    )
  } finally {
    for (const part of source.parts) {
      part.geometry.dispose()
      part.material.dispose()
    }
  }
})
