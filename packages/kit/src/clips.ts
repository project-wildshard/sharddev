import {
  CREATURE_SKELETONS,
  skeletonBones,
} from '@wildshard/shard-format/creatureSkeletons'
import {
  SkinClipNameSchema,
  SkinBindingSchema,
  type SkinBinding,
  type SkinClipName,
} from '@wildshard/shard-format/skinData'
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three'
import * as v from 'valibot'

import bipedContent from '../content/clips/biped.json' with { type: 'json' }
import quadrupedContent from '../content/clips/quadruped.json' with { type: 'json' }

import type { ReferenceSkeletonSource } from './skeletons.ts'

const finite = v.pipe(v.number(), v.finite())
const jointName = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z][A-Za-z0-9_.-]*$/u),
  v.maxLength(64),
)
const vector = v.tuple([finite, finite, finite])
const ClipPackSchema = v.strictObject({
  version: v.literal(1),
  source: v.union([
    v.strictObject({
      repo: v.string(),
      revision: v.string(),
      glb: v.string(),
      skin: v.string(),
    }),
    v.strictObject({
      repo: v.string(),
      revision: v.string(),
      pose: v.string(),
    }),
  ]),
  bones: v.pipe(
    v.array(
      v.strictObject({
        name: jointName,
        parent: v.nullable(jointName),
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
              bone: jointName,
              property: v.picklist(['position', 'quaternion', 'scale']),
              times: v.pipe(v.array(finite), v.minLength(2), v.maxLength(4097)),
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
})
type ClipPack = v.InferOutput<typeof ClipPackSchema>
type ClipBones = ReferenceSkeletonSource['bones']
const quadrupedPack = v.parse(ClipPackSchema, quadrupedContent)
const bipedPack = v.parse(ClipPackSchema, bipedContent)
const quadrupedJoints = new Set(skeletonBones(CREATURE_SKELETONS.quadruped))

export interface ClipPackOptions {
  /** Omit a pack clip to leave that state available to the engine poser. */
  readonly defaults?: readonly SkinClipName[]
  /** A clip supplied by the author takes precedence over the same Kit name. */
  readonly owned?: readonly AnimationClip[]
}

/** Existing quadruped clips, translated from their source rest offsets to the supplied named bones. */
export function quadrupedClips(
  bones: ClipBones,
  options?: ClipPackOptions,
): AnimationClip[] {
  return packClips(quadrupedPack, 'Quadruped', bones, options)
}

/** Sailor poses sampled onto the canonical Kit biped's named joints. */
export function bipedClips(
  bones: ClipBones,
  options?: ClipPackOptions,
): AnimationClip[] {
  return packClips(bipedPack, 'Biped', bones, options)
}

function packClips(
  pack: ClipPack,
  label: 'Biped' | 'Quadruped',
  bones: ClipBones,
  {
    defaults = pack.clips.map(clip => clip.name),
    owned = [],
  }: ClipPackOptions = {},
): AnimationClip[] {
  const targets = new Map(bones.map(bone => [bone.name, bone]))
  if (targets.size !== bones.length)
    throw new Error(`${label} clip target has duplicate bones`)
  const authored = new Map(owned.map(clip => [clip.name, clip]))
  if (authored.size !== owned.length)
    throw new Error(`${label} has duplicate owned clips`)
  if (defaults.some(name => !pack.clips.some(clip => clip.name === name)))
    throw new Error(`${label} has an unknown Kit clip default`)
  const offsets = new Map<string, readonly number[]>()
  const absent = new Set<string>()
  for (const source of pack.bones) {
    const target = targets.get(source.name)
    if (
      target === undefined &&
      label === 'Quadruped' &&
      !quadrupedJoints.has(source.name)
    ) {
      absent.add(source.name)
      continue
    }
    if (target === undefined || target.parent !== source.parent)
      throw new Error(`${label} clips need chain ${source.name}`)
    const parent =
      target.parent === null ? undefined : targets.get(target.parent)
    if (target.parent !== null && parent === undefined)
      throw new Error(`${label} clips need parent ${target.parent}`)
    if (
      source.rotation.some((value, axis) => value !== [0, 0, 0, 1][axis]) ||
      source.scale.some(value => value !== 1)
    )
      throw new Error(`${label} clip source has a transformed rest pose`)
    offsets.set(
      source.name,
      target.pos.map(
        (value, axis) =>
          value - (parent?.pos[axis] ?? 0) - (source.position[axis] ?? 0),
      ),
    )
  }
  const defaultsByName = pack.clips.filter(
    clip => defaults.includes(clip.name) && !authored.has(clip.name),
  )
  const compiled = defaultsByName.map(
    clip =>
      new AnimationClip(
        clip.name,
        -1,
        clip.tracks
          .filter(track => !absent.has(track.bone))
          .map(track => {
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
              throw new Error(
                `Invalid ${label.toLowerCase()} clip ${clip.name}/${track.bone}`,
              )
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
  return [...compiled, ...owned]
}

/** Fresh plain binding and existing periodic pose tables for a skin on this named quadruped chain. */
export function quadrupedBinding(
  skin: string,
  bones?: ClipBones,
  options?: ClipPackOptions,
): SkinBinding {
  return packBinding(quadrupedPack, skin, bones, options)
}

/** Binding for the same defaults and owned clips passed to bipedClips. */
export function bipedBinding(
  skin: string,
  options?: ClipPackOptions,
): SkinBinding {
  return packBinding(bipedPack, skin, undefined, options)
}

function packBinding(
  pack: ClipPack,
  skin: string,
  bones: ClipBones | undefined,
  {
    defaults = pack.clips.map(clip => clip.name),
    owned = [],
  }: ClipPackOptions = {},
): SkinBinding {
  const binding = structuredClone(pack.binding)
  const ownedNames = new Set(owned.map(clip => clip.name))
  const loopNames = new Set<string>([...defaults, ...ownedNames])
  const joints =
    bones === undefined ? undefined : new Set(bones.map(bone => bone.name))
  const poseLayers = Object.fromEntries(
    Object.entries(binding.poseLayers ?? {}).flatMap(([name, layers]) => {
      if (layers === undefined || !loopNames.has(name) || ownedNames.has(name))
        return []
      const retained = layers
        .map(layer => ({
          ...layer,
          tracks: layer.tracks.filter(
            track => joints === undefined || joints.has(track.bone),
          ),
        }))
        .filter(layer => layer.tracks.length > 0)
      return retained.length === 0 ? [] : [[name, retained]]
    }),
  )
  return v.parse(SkinBindingSchema, {
    ...binding,
    skin,
    loops: binding.loops.filter(name => loopNames.has(name)),
    ...(binding.poseLayers === undefined ? {} : { poseLayers }),
  })
}
