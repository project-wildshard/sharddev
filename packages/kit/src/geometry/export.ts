import { skinnedGlb } from '@wildshard/sdk/bake/skinned'
import { Rng } from '@wildshard/sdk/random'
import { MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  bakeCommonBody,
  commonBodyVariants,
  type CommonBodyKind,
} from './common.ts'
import { withBodyGeometry } from './loft.ts'

import type { AnimalDims, BoneDef } from './types.ts'

/** Plain metadata beside a body GLB. Animation/admission bindings are separate content. */
export interface BodyExport {
  readonly glb: Uint8Array
  readonly kind: CommonBodyKind
  readonly variant: string
  readonly family: 'pbr' | 'toon'
  readonly bones: BoneDef[]
  readonly dims: AnimalDims
}

/** Build a deterministic body asset from the kit recipe with no engine dependency. */
export function exportCommonBody(
  kind: CommonBodyKind,
  variantId: string,
  family: 'pbr' | 'toon',
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
  const merged = [body.furParts, body.hardParts, body.eyeParts].map(parts =>
    mergeGeometries(parts),
  )
  try {
    const { glb } = skinnedGlb({
      name: `kit.${kind}.${variantId}.${family}`,
      bones: body.bones,
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
    }
  } finally {
    for (const geometry of [...geometries, ...merged]) geometry?.dispose()
    material.dispose()
  }
}
