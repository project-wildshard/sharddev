import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons'
import {
  BoxGeometry,
  BufferAttribute,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  AnimationClip,
  Vector3,
} from 'three'

import { readRigDocument, writeRigDocument } from '../../src/sharddev/bake/rig'
import { skinnedGlb } from '../../src/sharddev/bake/skinned'

import type { CreatureChainMap } from '../../src/sharddev/scene/creatureImport'
import type { Document } from '@gltf-transform/core'

export const MIXAMO: CreatureChainMap = {
  root: 'Armature',
  chains: {
    spine: [
      'mixamorig:Hips',
      'mixamorig:Spine',
      'mixamorig:Spine2',
      'mixamorig:Neck',
      'mixamorig:Head',
    ],
    'arm.L': [
      'mixamorig:LeftArm',
      'mixamorig:LeftForeArm',
      'mixamorig:LeftHand',
    ],
    'arm.R': [
      'mixamorig:RightArm',
      'mixamorig:RightForeArm',
      'mixamorig:RightHand',
    ],
    'leg.L': ['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot'],
    'leg.R': [
      'mixamorig:RightUpLeg',
      'mixamorig:RightLeg',
      'mixamorig:RightFoot',
    ],
  },
}
const RIGIFY: CreatureChainMap = {
  root: 'root',
  chains: {
    spine: [
      'DEF-spine',
      'DEF-spine.001',
      'DEF-spine.003',
      'DEF-spine.004',
      'DEF-spine.006',
    ],
    'arm.L': ['DEF-upper_arm.L', 'DEF-forearm.L', 'DEF-hand.L'],
    'arm.R': ['DEF-upper_arm.R', 'DEF-forearm.R', 'DEF-hand.R'],
    'leg.L': ['DEF-thigh.L', 'DEF-shin.L', 'DEF-foot.L'],
    'leg.R': ['DEF-thigh.R', 'DEF-shin.R', 'DEF-foot.R'],
  },
}

/** A real weighted skin and clip, renamed by graph reference into vendor names.
 * The deforming vertices share body/hand weights; no animation string mock. */
export async function importedBiped(
  preset: 'mixamo' | 'rigify',
  edit?: (document: Document) => void,
): Promise<Uint8Array> {
  const contract = CREATURE_SKELETONS.biped,
    canonical = [{ name: contract.root, parent: null as string | null }]
  for (const chain of Object.values(contract.chains)) {
    let parent = chain.parent
    for (const name of chain.bones) {
      canonical.push({ name, parent })
      parent = name
    }
  }
  const flat = new Map(
    canonical.map((bone, index) => [bone.name, `joint_${index}`]),
  )
  const bones = canonical.map((bone, index) => ({
    name: flat.get(bone.name) ?? '',
    parent: bone.parent === null ? null : (flat.get(bone.parent) ?? null),
    pos: [index * 0.05, index * 0.1, 0] as const,
  }))
  const geometry = new BoxGeometry(0.2, 0.3, 0.2).toNonIndexed(),
    count = geometry.getAttribute('position').count
  const indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4),
    hand = canonical.findIndex(bone => bone.name === 'hand.L')
  for (let index = 0; index < count; index++) {
    indices.set([0, hand, 0, 0], index * 4)
    weights.set([0.5, 0.5, 0, 0], index * 4)
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4))
  const material = new MeshStandardMaterial(),
    end = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3)
  const clip = new AnimationClip('idle', 1, [
    new QuaternionKeyframeTrack(
      `${flat.get('hand.L') ?? ''}.quaternion`,
      [0, 1],
      [0, 0, 0, 1, ...end.toArray()],
    ),
  ])
  const { glb } = skinnedGlb({
    name: 'import-fixture',
    bones,
    parts: [{ geometry, material }],
    clips: [clip],
  })
  geometry.dispose()
  material.dispose()
  const document = await readRigDocument(glb),
    nodes = document.getRoot().listNodes(),
    map = preset === 'mixamo' ? MIXAMO : RIGIFY
  const rename = (target: string, original: string): void => {
    const node = nodes.find(node => node.getName() === flat.get(target))
    if (node === undefined) throw new Error(`Missing fixture ${target}`)
    node.setName(original)
  }
  rename('body', map.root)
  for (const [key, chain] of Object.entries(contract.chains))
    for (const [index, target] of chain.bones.entries())
      rename(target, map.chains[key]?.[index] ?? '')
  const head = nodes.find(node => node.getName() === map.chains['spine']?.[4])
  head?.addChild(
    document.createNode('attachment.fixture').setTranslation([0, 0.1, 0]),
  )
  edit?.(document)
  return writeRigDocument(document)
}
