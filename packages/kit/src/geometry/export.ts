import { skinnedGlb } from '@wildshard/sdk/bake/skinned'
import { Rng } from '@wildshard/sdk/random'
import { MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { quadrupedClips } from '../clips.ts'
import {
  bakeCommonBody,
  commonBodyVariants,
  type CommonBodyKind,
  withBodyGeometry,
  type AnimalDims,
  type BoneDef,
} from './species.ts'

import type { SkinClipName } from '@wildshard/shard-format/skinData'

/** Plain metadata beside a body GLB. Animation/admission bindings are separate content. */
export interface BodyExport {
  readonly glb: Uint8Array
  readonly kind: CommonBodyKind
  readonly variant: string
  readonly family: 'pbr' | 'toon'
  readonly bones: BoneDef[]
  readonly dims: AnimalDims
  readonly clips?: readonly SkinClipName[]
}

/** Build a deterministic body asset from the kit recipe with no engine dependency. */
function exportBody(
  kind: CommonBodyKind,
  variantId: string,
  family: 'pbr' | 'toon',
  animated: boolean,
): BodyExport {
  const variant = commonBodyVariants(kind).find(row => row.id === variantId)
  if (variant === undefined)
    throw new Error(`Unknown kit ${kind} variant: ${variantId}`)
  const { body } = withBodyGeometry(family === 'toon', {}, () =>
    bakeCommonBody(kind, variant, new Rng(42).snapshot()),
  )
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  })
  const geometries = [...body.furParts, ...body.hardParts, ...body.eyeParts]
  const merged = animated
    ? [mergeGeometries(geometries)]
    : [body.furParts, body.hardParts, body.eyeParts].map(parts =>
        mergeGeometries(parts),
      )
  try {
    const clips = animated ? quadrupedClips(body.bones) : undefined
    const { glb } = skinnedGlb({
      name: `kit.${kind}.${variantId}.${family}`,
      bones: body.bones,
      ...(clips === undefined ? {} : { clips }),
      parts: merged.map((geometry, index) => {
        if (geometry === null) throw new Error('Kit body geometry cannot merge')
        return {
          geometry,
          material,
          name: ['fur', 'hard', 'eye'][index] ?? 'part',
        }
      }),
    })
    return {
      glb,
      kind,
      variant: variantId,
      family,
      bones: body.bones,
      dims: body.dims,
      ...(clips === undefined
        ? {}
        : { clips: clips.map(clip => clip.name as SkinClipName) }),
    }
  } finally {
    for (const geometry of [...geometries, ...merged]) geometry?.dispose()
    material.dispose()
  }
}

/** Original plain body export, preserving every committed OF3a byte. */
export function exportCommonBody(
  kind: CommonBodyKind,
  variantId: string,
  family: 'pbr' | 'toon',
): BodyExport {
  return exportBody(kind, variantId, family, false)
}

/** The same exact body channels with the kit's admitted, named quadruped clips. */
export function exportAnimatedCommonBody(
  kind: CommonBodyKind,
  variantId: string,
  family: 'pbr' | 'toon',
): BodyExport {
  return exportBody(kind, variantId, family, true)
}
