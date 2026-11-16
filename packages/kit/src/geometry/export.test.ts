import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  NodeIO,
  type Node as GltfNode,
  type Accessor,
} from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { Rng } from '@wildshard/sdk/random'
import { prepareGlbCost, parseGlbData } from '@wildshard/shard-format/glbCost'
import { MeshoptDecoder } from 'meshoptimizer'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { bakeCommonBody, commonBodyVariants } from './common.ts'
import { exportCommonBody } from './export.ts'
import { withBodyGeometry } from './loft.ts'

const channels = {
  position: 'POSITION',
  normal: 'NORMAL',
  uv: 'TEXCOORD_0',
  color: 'COLOR_0',
  skinIndex: 'JOINTS_0',
  skinWeight: 'WEIGHTS_0',
  furLen: '_FURLEN',
}

test('all plain GLBs reproduce original typed channels, joint parents and committed bytes', async () => {
  await prepareGlbCost()
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  let checked = 0
  for (const kind of ['boar', 'bear'] as const)
    for (const family of ['pbr', 'toon'] as const) {
      for (const variant of commonBodyVariants(kind)) {
        const exported = exportCommonBody(kind, variant.id, family)
        const committed = await readFile(
          new URL(
            `../../content/creatures/${kind}/${family}/${variant.id}.glb`,
            import.meta.url,
          ),
        )
        assert.deepEqual(exported.glb, new Uint8Array(committed))
        const cost = parseGlbData(exported.glb)
        assert.equal(cost.draws, 6) // three parts plus their shadow draws
        assert.ok(cost.triangles > 0)
        const doc = await io.readBinary(exported.glb)
        const skin = doc.getRoot().listSkins()[0]
        assert.ok(skin)
        assert.deepEqual(
          skin.listJoints().map(joint => joint.getName()),
          exported.bones.map(bone => bone.name),
        )
        for (const bone of exported.bones) {
          const joint: GltfNode | undefined = skin
            .listJoints()
            .find(row => row.getName() === bone.name)
          assert.ok(joint)
          const parent = exported.bones.find(row => row.name === bone.parent)
          assert.deepEqual(
            joint.getTranslation(),
            bone.pos.map((value, axis) => value - (parent?.pos[axis] ?? 0)),
          )
          if (bone.parent !== null)
            assert.equal(joint.getParentNode()?.getName(), bone.parent)
        }
        const { body } = withBodyGeometry(family === 'toon', {}, () =>
          bakeCommonBody(kind, variant, new Rng(42).snapshot()),
        )
        assert.deepEqual(exported.bones, body.bones)
        assert.deepEqual(exported.dims, body.dims)
        const groups = [body.furParts, body.hardParts, body.eyeParts]
        try {
          for (const [index, parts] of groups.entries()) {
            const expected = mergeGeometries(parts)
            assert.ok(expected)
            try {
              const primitive = doc
                .getRoot()
                .listMeshes()
                .at(index)
                ?.listPrimitives()
                .at(0)
              assert.ok(primitive)
              assert.deepEqual(
                Array.from(primitive.getIndices()?.getArray() ?? []),
                Array.from(expected.index?.array ?? []),
              )
              for (const [attribute, semantic] of Object.entries(channels)) {
                const actual: ReturnType<Accessor['getArray']> | undefined =
                  primitive.getAttribute(semantic)?.getArray()
                assert.deepEqual(actual, expected.getAttribute(attribute).array)
              }
            } finally {
              expected.dispose()
            }
          }
        } finally {
          for (const group of groups)
            for (const geometry of group) geometry.dispose()
        }
        checked++
      }
    }
  assert.equal(checked, 22)
})

test('an unknown kit variant refuses before exporting a body', () => {
  assert.throws(
    () => exportCommonBody('boar', 'unknown', 'pbr'),
    /Unknown kit boar variant: unknown/u,
  )
})
