import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  NodeIO,
  type Accessor,
  type Animation,
  type AnimationChannel,
  type AnimationSampler,
} from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prepareGlbCost } from '@wildshard/shard-format/glbCost'
import { parseRows } from '@wildshard/shard-format/rows'
import {
  validateSkinAssets,
  parseSkinFile,
} from '@wildshard/shard-format/skinAssets'
import { MeshoptDecoder } from 'meshoptimizer'

import { quadrupedBinding, quadrupedClips } from '../clips.ts'
import { exportCommonBody, exportAnimatedCommonBody } from './export.ts'
import { commonBodyVariants } from './species.ts'

const io = () =>
  new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

test('every animated kit body preserves exact decoded body channels and admits its real clips', async () => {
  await prepareGlbCost()
  let checked = 0
  for (const kind of ['boar', 'bear'] as const)
    for (const family of ['pbr', 'toon'] as const)
      for (const variant of commonBodyVariants(kind)) {
        const exported = exportAnimatedCommonBody(kind, variant.id, family)
        const glb = new Uint8Array(
          await readFile(
            new URL(
              `../../content/animated/${kind}/${family}/${variant.id}.glb`,
              import.meta.url,
            ),
          ),
        )
        assert.deepEqual(glb, exported.glb)
        const bytes = new Uint8Array(
          await readFile(
            new URL(
              `../../content/animated/${kind}/${family}/${variant.id}.json`,
              import.meta.url,
            ),
          ),
        )
        const { row } = parseSkinFile(bytes)
        const old = await io().readBinary(
            exportCommonBody(kind, variant.id, family).glb,
          ),
          animated = await io().readBinary(glb)
        assert.deepEqual(
          animated
            .getRoot()
            .listAnimations()
            .map(clip => clip.getName()),
          exported.clips,
        )
        const before = old
            .getRoot()
            .listMeshes()
            .flatMap(mesh => mesh.listPrimitives()),
          after = animated.getRoot().listMeshes()[0]?.listPrimitives()[0]
        assert.equal(before.length, 3)
        assert.ok(after)
        const first = before[0]
        assert.ok(first)
        assert.deepEqual(after.listSemantics(), first.listSemantics())
        for (const semantic of first.listSemantics()) {
          const actual: Accessor | null = after.getAttribute(semantic)
          const original: Accessor | null = first.getAttribute(semantic)
          assert.ok(actual && original)
          assert.equal(
            actual.getArray()?.constructor,
            original.getArray()?.constructor,
          )
          assert.equal(actual.getNormalized(), original.getNormalized())
          const values = before.flatMap(primitive =>
            Array.from(primitive.getAttribute(semantic)?.getArray() ?? []),
          )
          assert.deepEqual(Array.from(actual.getArray() ?? []), values)
        }
        let offset = 0
        const indices = before.flatMap(primitive => {
          const result = Array.from(
            primitive.getIndices()?.getArray() ?? [],
          ).map(index => index + offset)
          offset += primitive.getAttribute('POSITION')?.getCount() ?? 0
          return result
        })
        assert.deepEqual(
          Array.from(after.getIndices()?.getArray() ?? []),
          indices,
        )
        const rest = (doc: Awaited<ReturnType<NodeIO['readBinary']>>) =>
          doc
            .getRoot()
            .listSkins()[0]
            ?.listJoints()
            .map(bone => ({
              name: bone.getName(),
              parent: bone.getParentNode()?.getName(),
              position: bone.getTranslation(),
              rotation: bone.getRotation(),
              scale: bone.getScale(),
            }))
        assert.deepEqual(rest(animated), rest(old))
        const skin = createHash('sha256').update(bytes).digest('hex')
        const source: Parameters<typeof validateSkinAssets>[0] = {
          rows: parseRows({
            strikes: [],
            weather: [],
            days: [],
            species: [
              {
                id: 'fixture.creature',
                kind: 'fixture',
                label: 'Fixture',
                aggressive: true,
                lockable: true,
                dims: exported.dims,
                variants: [
                  {
                    id: 'plain',
                    label: 'Plain',
                    rarity: 'common',
                    weight: 1,
                    scale: [1, 1],
                    hp: 117,
                    mods: {
                      speed: 1,
                      chargeDist: 1,
                      chargeDamage: 12,
                      damageTaken: 1,
                      relentless: false,
                    },
                  },
                ],
              },
            ],
            compendiums: [],
            loot: [],
            looks: [
              {
                id: 'fixture.look',
                species: 'fixture.creature',
                recipe: 'platform.skin',
                material: null,
                parameters: { skin },
                animation: {
                  recipe: 'platform.clips',
                  parameters: { attackSpan: 1 },
                },
              },
            ],
          }),
          files: [
            {
              hash: skin,
              kind: 'json',
              compressed: bytes.length,
              decoded: bytes.length * 2,
              gpu: 0,
              triangles: 0,
              draws: 0,
              dependencies: [row.file],
              critical: false,
            },
            {
              hash: row.file,
              kind: 'glb',
              compressed: glb.length,
              ...row.cost,
              dependencies: [],
              critical: false,
            },
          ],
        }
        validateSkinAssets(
          source,
          new Map([
            [skin, bytes],
            [row.file, glb],
          ]),
        )
        checked++
      }
  assert.equal(checked, 22)
})

test('decoded clip channels retain the original rotations and rest-relative translations', async () => {
  const original = execFileSync('git', [
    'show',
    '81d8fc527fcc6332c755aa8cb078d189e5dc1dd3:src/shards/_template/assets/b4fbde0422e125b498c3dc8b9a5cc2516c8598f09e9d0e5f6b639b32f98179e6',
  ])
  const source = await io().readBinary(original)
  for (const kind of ['boar', 'bear'] as const) {
    const variant = commonBodyVariants(kind)[0]
    assert.ok(variant)
    const target = await io().readBinary(
      exportAnimatedCommonBody(kind, variant.id, 'toon').glb,
    )
    const nodes = new Map(
      target
        .getRoot()
        .listSkins()[0]
        ?.listJoints()
        .map(node => [node.getName(), node]),
    )
    for (const animation of source.getRoot().listAnimations()) {
      const actual: Animation | undefined = target
        .getRoot()
        .listAnimations()
        .find(clip => clip.getName() === animation.getName())
      assert.ok(actual)
      for (const channel of animation.listChannels()) {
        const originalNode = channel.getTargetNode()
        assert.ok(originalNode)
        const targetNode = nodes.get(originalNode.getName())
        if (!targetNode) continue // scene motion stays actor-owned
        const matching: AnimationChannel | undefined = actual
          .listChannels()
          .find(
            row =>
              row.getTargetNode()?.getName() === originalNode.getName() &&
              row.getTargetPath() === channel.getTargetPath(),
          )
        assert.ok(matching)
        const a: AnimationSampler | null = channel.getSampler()
        const b: AnimationSampler | null = matching.getSampler()
        assert.ok(a && b)
        assert.equal(a.getInterpolation(), b.getInterpolation())
        assert.deepEqual(a.getInput()?.getArray(), b.getInput()?.getArray())
        const expected: ArrayLike<number> | null =
          a.getOutput()?.getArray() ?? null
        const observed: ArrayLike<number> | null =
          b.getOutput()?.getArray() ?? null
        assert.ok(expected && observed)
        assert.equal(expected.length, observed.length)
        for (let index = 0; index < expected.length; index++) {
          const axis = index % 3,
            shift =
              channel.getTargetPath() === 'translation'
                ? (targetNode.getTranslation()[axis] ?? 0) -
                  (originalNode.getTranslation()[axis] ?? 0)
                : 0
          assert.ok(
            Math.abs(
              (observed[index] ?? Infinity) - (expected[index] ?? 0) - shift,
            ) < 1e-6,
            `${kind}/${animation.getName()}/${originalNode.getName()}/${index}`,
          )
        }
      }
    }
  }
})

test('missing chains refuse and returned clip/binding state is isolated', () => {
  const body = exportCommonBody('boar', 'boar', 'toon')
  assert.throws(() => quadrupedClips(body.bones.slice(1)), /chain/u)
  const clips = quadrupedClips(body.bones),
    first = clips[0]?.tracks[0]
  assert.ok(first)
  first.values[0] = 1000
  assert.notEqual(quadrupedClips(body.bones)[0]?.tracks[0]?.values[0], 1000)
  const binding = quadrupedBinding('fixture.skin'),
    layer = binding.poseLayers?.idle?.[0]
  assert.ok(layer)
  layer.times[0] = 1000
  assert.equal(
    quadrupedBinding('fixture.skin').poseLayers?.idle?.[0]?.times[0],
    0,
  )
})
