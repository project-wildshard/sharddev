import assert from 'node:assert/strict'
import { test } from 'node:test'

import { skinnedGlb } from '@wildshard/sdk/bake/skinned'
import { CREATURE_SKELETONS } from '@wildshard/shard-format/creatureSkeletons'
import { BoxGeometry, BufferAttribute } from 'three'

import { humanoidSource, referenceSkeletonSource } from './skeletons.ts'

test('humanoid swaps the actual head and attaches geometry to defining sockets without changing caller inputs', () => {
  const head = new BoxGeometry(0.5, 0.3, 0.2),
    attachment = new BoxGeometry(0.06, 0.08, 0.1)
  const paint = (geometry: BoxGeometry, colour: number[]) => {
    const colours = new Float32Array(
      geometry.getAttribute('position').count * 3,
    )
    for (let i = 0; i < colours.length; i += 3) colours.set(colour, i)
    geometry.setAttribute('color', new BufferAttribute(colours, 3))
  }
  paint(head, [1, 0, 0])
  paint(attachment, [0, 1, 0])
  const input = [head, attachment].map(geometry => ({
    position: [...geometry.getAttribute('position').array],
    normal: [...geometry.getAttribute('normal').array],
    colour: [...geometry.getAttribute('color').array],
    index: [...(geometry.index?.array ?? [])],
  }))
  for (const socketName of Object.keys(CREATURE_SKELETONS.biped.sockets)) {
    const source = humanoidSource({
      look: 'fixture.look',
      head,
      attachments: [
        { socket: socketName, geometry: attachment, at: [0.01, 0.02, 0.03] },
      ],
    })
    try {
      const geometry = source.parts[0]?.geometry
      assert.ok(geometry)
      const positions = geometry.getAttribute('position'),
        colours = geometry.getAttribute('color'),
        joints = geometry.getAttribute('skinIndex'),
        weights = geometry.getAttribute('skinWeight')
      const centroid = (channel: 'head' | 'attachment') => {
        const bone =
            channel === 'head'
              ? 'head'
              : CREATURE_SKELETONS.biped.sockets[socketName]?.bone,
          index = source.bones.findIndex(row => row.name === bone),
          total = [0, 0, 0]
        let count = 0
        for (let vertex = 0; vertex < positions.count; vertex++) {
          if (
            (channel === 'head'
              ? colours.getX(vertex)
              : colours.getY(vertex)) !== 1
          )
            continue
          assert.equal(joints.getX(vertex), index)
          assert.equal(weights.getX(vertex), 1)
          assert.equal(
            weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex),
            0,
          )
          total[0] = (total[0] ?? 0) + positions.getX(vertex)
          total[1] = (total[1] ?? 0) + positions.getY(vertex)
          total[2] = (total[2] ?? 0) + positions.getZ(vertex)
          count++
        }
        assert.equal(count, 36, 'box replaces head or is attached exactly once')
        return total.map(value => value / count)
      }
      const headAt = centroid('head')
      assert.ok(Math.abs((headAt[1] ?? 0) - 1.68) < 1e-6)
      const socket = CREATURE_SKELETONS.biped.sockets[socketName]
      assert.ok(socket)
      const bone = source.bones.find(row => row.name === socket.bone)
      assert.ok(bone)
      const attached = centroid('attachment')
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          Math.abs(
            (attached[axis] ?? 0) -
              ((bone.pos[axis] ?? 0) +
                (socket.at[axis] ?? 0) +
                ([0.01, 0.02, 0.03][axis] ?? 0)),
          ) < 1e-6,
        )
      assert.ok(
        Math.abs(source.dims.headRadius - Math.hypot(0.25, 0.15, 0.1)) < 1e-6,
      )
    } finally {
      for (const part of source.parts) {
        part.geometry.dispose()
        part.material.dispose()
      }
    }
  }
  assert.deepEqual(
    [head, attachment].map(geometry => ({
      position: [...geometry.getAttribute('position').array],
      normal: [...geometry.getAttribute('normal').array],
      colour: [...geometry.getAttribute('color').array],
      index: [...(geometry.index?.array ?? [])],
    })),
    input,
  )
  assert.equal(head.boundingBox, null)
  assert.equal(attachment.boundingBox, null)
  head.dispose()
  attachment.dispose()
})

test('three free scales retain one unit GLB and use only the admitted body policy', () => {
  const reference = referenceSkeletonSource('biped')
  try {
    const bytes = skinnedGlb(reference).glb
    for (const scale of [0.5, 1, 2]) {
      const source = humanoidSource({ look: 'fixture.look', scale })
      try {
        assert.equal(source.body.scale, scale)
        assert.equal(source.body.skeleton, 'biped')
        assert.equal(source.body.size, 'medium')
        assert.deepEqual(source.bones, reference.bones)
        assert.deepEqual(skinnedGlb(source).glb, bytes)
      } finally {
        for (const part of source.parts) {
          part.geometry.dispose()
          part.material.dispose()
        }
      }
    }
  } finally {
    for (const part of reference.parts) {
      part.geometry.dispose()
      part.material.dispose()
    }
  }
})

test('humanoid refuses unknown sockets and invalid custom surfaces before allocating a source', () => {
  const geometry = new BoxGeometry(1, 1, 1)
  try {
    assert.throws(
      () =>
        humanoidSource({
          look: 'fixture.look',
          attachments: [{ socket: 'hand.left', geometry }],
        }),
      /Unknown biped socket hand.left/,
    )
    assert.throws(
      () =>
        humanoidSource({
          look: 'fixture.look',
          attachments: [{ socket: 'head', geometry, at: [Number.NaN, 0, 0] }],
        }),
      /Non-finite biped socket offset head/,
    )
    geometry.getAttribute('position').setX(0, Number.NaN)
    assert.throws(
      () => humanoidSource({ look: 'fixture.look', head: geometry }),
      /head has a non-finite position/,
    )
    assert.throws(() => humanoidSource({ look: 'fixture.look', scale: 0 }), /./)
  } finally {
    geometry.dispose()
  }
})
