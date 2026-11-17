import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { readRigDocument } from '@wildshard/sdk/bake/rig'
import { skinnedGlb } from '@wildshard/sdk/bake/skinned'
import { CREATURE_SKELETONS } from '@wildshard/shard-format/creatureSkeletons'
import { prepareGlbCost, parseGlbData } from '@wildshard/shard-format/glbCost'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { referenceSkeletonSource } from './skeletons.ts'

for (const kind of ['biped', 'quadruped'] as const)
  test(`published ${kind} reference is the real canonical weighted GLB`, async () => {
    await prepareGlbCost()
    const source = referenceSkeletonSource(kind)
    try {
      const bytes = new Uint8Array(
          await readFile(
            new URL(`../content/skeletons/${kind}.glb`, import.meta.url),
          ),
        ),
        generated = skinnedGlb(source).glb
      assert.deepEqual(
        bytes,
        generated,
        'published asset must regenerate exactly',
      )
      const root = (await readRigDocument(bytes)).getRoot(),
        skin = root.listSkins()[0],
        names = skin?.listJoints().map(node => node.getName())
      assert.deepEqual(
        names,
        source.bones.map(bone => bone.name),
      )
      assert.equal(
        import.meta.resolve(`@wildshard/kit/content/skeletons/${kind}.glb`),
        new URL(`../content/skeletons/${kind}.glb`, import.meta.url).href,
      )
      const inverse = skin?.getInverseBindMatrices()?.getArray()
      assert.ok(inverse instanceof Float32Array)
      for (const [index, bone] of source.bones.entries()) {
        const p = new Vector3(),
          q = new Quaternion(),
          scale = new Vector3()
        new Matrix4()
          .fromArray(inverse, index * 16)
          .invert()
          .decompose(p, q, scale)
        assert.ok(p.distanceTo(new Vector3(...bone.pos)) < 1e-6)
        assert.ok(Math.abs(Math.abs(q.w) - 1) < 1e-6)
        assert.deepEqual(scale.toArray(), [1, 1, 1])
      }
      assert.equal(root.listSkins().length, 1)
      assert.equal(root.listMeshes().length, 1)
      const contract = CREATURE_SKELETONS[kind]
      for (const chain of Object.values(contract.chains)) {
        let parent = chain.parent
        for (const name of chain.bones) {
          assert.equal(
            source.bones.find(bone => bone.name === name)?.parent,
            parent,
          )
          parent = name
        }
      }
      for (const socket of Object.values(contract.sockets))
        assert.ok(names?.includes(socket.bone))
      for (const volume of contract.volumes)
        assert.ok(names?.includes(volume.bone))
      assert.ok(parseGlbData(bytes).triangles > 0)
      const primitive = root.listMeshes()[0]?.listPrimitives()[0]
      assert.ok(primitive?.getAttribute('JOINTS_0'))
      assert.ok(primitive?.getAttribute('WEIGHTS_0'))
    } finally {
      for (const part of source.parts) {
        part.geometry.dispose()
        part.material.dispose()
      }
    }
  })

test('reference sources have independent caller-owned geometry and bone records', () => {
  const first = referenceSkeletonSource('biped'),
    second = referenceSkeletonSource('biped')
  try {
    assert.notEqual(first.bones[0], second.bones[0])
    assert.notEqual(first.parts[0]?.geometry, second.parts[0]?.geometry)
    first.parts[0]?.geometry.translate(100, 0, 0)
    assert.notDeepEqual(
      first.parts[0]?.geometry.getAttribute('position').array,
      second.parts[0]?.geometry.getAttribute('position').array,
    )
  } finally {
    for (const source of [first, second])
      for (const part of source.parts) {
        part.geometry.dispose()
        part.material.dispose()
      }
  }
})
