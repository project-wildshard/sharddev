import {
  SkinClipNameSchema,
  SkinBindingSchema,
  type SkinBinding,
} from '@wildshard/shard-format/skinData'
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three'
import * as v from 'valibot'

import content from '../content/clips/quadruped.json' with { type: 'json' }

import type { BoneDef } from './geometry/species.ts'

const finite = v.pipe(v.number(), v.finite())
const name = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z][A-Za-z0-9_.-]*$/u),
  v.maxLength(64),
)
const vector = v.tuple([finite, finite, finite])
const pack = v.parse(
  v.strictObject({
    version: v.literal(1),
    source: v.strictObject({
      repo: v.string(),
      revision: v.string(),
      glb: v.string(),
      skin: v.string(),
    }),
    bones: v.pipe(
      v.array(
        v.strictObject({
          name,
          parent: v.nullable(name),
          position: vector,
          rotation: v.tuple([finite, finite, finite, finite]),
          scale: vector,
        }),
      ),
      v.minLength(1),
      v.maxLength(64),
    ),
    clips: v.pipe(
      v.array(
        v.strictObject({
          name: SkinClipNameSchema,
          tracks: v.pipe(
            v.array(
              v.strictObject({
                bone: name,
                property: v.picklist(['position', 'quaternion', 'scale']),
                times: v.pipe(
                  v.array(finite),
                  v.minLength(2),
                  v.maxLength(4097),
                ),
                values: v.pipe(v.array(finite), v.maxLength(16388)),
              }),
            ),
            v.maxLength(192),
          ),
        }),
      ),
      v.minLength(1),
      v.maxLength(32),
    ),
    binding: SkinBindingSchema,
  }),
  content,
)

/** Existing quadruped clips, translated from their source rest offsets to the supplied named bones. */
export function quadrupedClips(bones: readonly BoneDef[]): AnimationClip[] {
  const targets = new Map(bones.map(bone => [bone.name, bone]))
  if (targets.size !== bones.length)
    throw new Error('Quadruped clip target has duplicate bones')
  const offsets = new Map<string, readonly number[]>()
  for (const source of pack.bones) {
    const target = targets.get(source.name)
    if (target === undefined || target.parent !== source.parent)
      throw new Error(`Quadruped clips need chain ${source.name}`)
    const parent =
      target.parent === null ? undefined : targets.get(target.parent)
    if (target.parent !== null && parent === undefined)
      throw new Error(`Quadruped clips need parent ${target.parent}`)
    if (
      source.rotation.some((value, axis) => value !== [0, 0, 0, 1][axis]) ||
      source.scale.some(value => value !== 1)
    )
      throw new Error('Quadruped clip source has a transformed rest pose')
    offsets.set(
      source.name,
      target.pos.map(
        (value, axis) =>
          value - (parent?.pos[axis] ?? 0) - (source.position[axis] ?? 0),
      ),
    )
  }
  return pack.clips.map(
    clip =>
      new AnimationClip(
        clip.name,
        -1,
        clip.tracks.map(track => {
          const offset = offsets.get(track.bone),
            width = track.property === 'quaternion' ? 4 : 3
          if (
            offset === undefined ||
            track.values.length !== track.times.length * width ||
            track.times[0] !== 0 ||
            track.times.some(
              (time, index) =>
                index > 0 && time <= (track.times[index - 1] ?? 0),
            ) ||
            (track.times.at(-1) ?? Infinity) > 60
          )
            throw new Error(`Invalid quadruped clip ${clip.name}/${track.bone}`)
          const values =
            track.property === 'position'
              ? track.values.map(
                  (value, index) => value + (offset[index % 3] ?? 0),
                )
              : track.values
          const path = `${track.bone}.${track.property}`
          return track.property === 'quaternion'
            ? new QuaternionKeyframeTrack(path, track.times, values)
            : new VectorKeyframeTrack(path, track.times, values)
        }),
      ),
  )
}

/** Fresh plain binding and existing periodic pose tables for a skin on this named quadruped chain. */
export function quadrupedBinding(skin: string): SkinBinding {
  return v.parse(SkinBindingSchema, { ...structuredClone(pack.binding), skin })
}
