import { skinnedGlb } from '@wildshard/sdk/bake/skinned'
import {
  encodeCanonicalJson,
  hashImmutableBytes,
} from '@wildshard/sdk/immutable'
import { parseGlbData, prepareGlbCost } from '@wildshard/shard-format/glbCost'
import {
  parseSkinBindings,
  parseSkinRows,
} from '@wildshard/shard-format/skinData'
import { skinLayerDecoded } from '@wildshard/shard-format/skinLayers'

import { quadrupedBinding, quadrupedClips } from '../clips.ts'
import { wildlifeSource } from '../skeletons.ts'

/** Bake the named Kit body and its matching plain skin file. */
export async function bakeWildlife(
  kind: Parameters<typeof wildlifeSource>[0],
): Promise<{
  readonly glb: Uint8Array
  readonly skin: Uint8Array
}> {
  await prepareGlbCost()
  const source = wildlifeSource(kind)
  try {
    const id = `kit.${kind}.skin`
    const clips = quadrupedClips(source.bones)
    const binding = quadrupedBinding(id, source.bones)
    const { glb } = skinnedGlb({ ...source, clips })
    const cost = parseGlbData(glb)
    cost.decoded += skinLayerDecoded(
      binding.poseLayers ?? {},
      source.bones.length,
    )
    const joints = source.bones.map(bone => bone.name)
    const row = {
      id,
      file: hashImmutableBytes(glb),
      family: 'pbr',
      cost,
      rig: {
        skeleton: 'kit.quadruped',
        joints: [joints],
        clips: clips.map(clip => clip.name),
        sockets: joints,
      },
    }
    const rows = parseSkinRows([row])
    const [admitted] = parseSkinBindings([binding], rows)
    return {
      glb,
      skin: new TextEncoder().encode(
        encodeCanonicalJson({ row: rows[0], binding: admitted }),
      ),
    }
  } finally {
    for (const part of source.parts) {
      part.geometry.dispose()
      part.material.dispose()
    }
  }
}
