// J186: the installed author boundary, independent numerical reference and historical worker bytes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { gunzipSync } from 'fflate'

import { installWildshard } from '../../src/test/helpers/install.ts'

// Positive, finite half-floats: round the numerical value at its exponent's spacing.
// This does not copy the producer's Float32 bit shifts or call Three.toHalfFloat.
function half(value) {
  const x = Math.fround(value)
  if (x === 0) return 0
  if (x < 2 ** -14) return Math.floor(x / 2 ** -24 + 0.5)
  const exponent = Math.floor(Math.log2(x))
  return (
    (exponent + 15) * 1024 + Math.floor((x / 2 ** exponent - 1) * 1024 + 0.5)
  )
}
function unhalf(bits) {
  const exponent = Math.floor(bits / 1024),
    mantissa = bits % 1024
  return exponent === 0
    ? mantissa * 2 ** -24
    : (1 + mantissa / 1024) * 2 ** (exponent - 15)
}
function linear(byte) {
  const s = byte / 255
  return Math.fround(s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
}

void test(
  'an installed sky author preserves every worker half texel, horizon and selected gzip view',
  { timeout: 9500 },
  async () => {
    const started = performance.now()
    const parent = 'tmp/codex-keyed-sky'
    mkdirSync(parent, { recursive: true })
    const root = mkdtempSync(join(parent, 'installed-'))
    try {
      installWildshard(root)
      const author = createRequire(
        join(
          process.cwd(),
          root,
          'app/node_modules/@wildshard/sharddev/package.json',
        ),
      )
      const { packGainKey, encodeGainKey } = await import(
        pathToFileURL(author.resolve('@wildshard/sharddev/bake/keyedSky')).href
      )
      const native = await import(
        pathToFileURL(
          author.resolve('@wildshard/sharddev/scripts/bake/keyed-sky.mjs'),
        ).href
      )
      const one = new Uint16Array([15360, 15360, 15360]),
        bytes = encodeGainKey(one)
      assert.equal(
        Buffer.from(bytes).toString('hex'),
        '1f8b080000000000021363b06100420057940dd706000000',
      )
      assert.deepEqual(gunzipSync(bytes), new Uint8Array(one.buffer))
      const white = packGainKey(
        new Uint8Array([255, 255, 255, 255]),
        new Uint8Array([0, 0, 0, 255]),
        1,
        1,
      )
      assert.deepEqual(white.horizon, [1, 1, 1])
      assert.deepEqual([...white.data], [15360, 15360, 15360])
      assert.throws(() =>
        packGainKey(new Uint8Array(4), new Uint8Array(3), 1, 1),
      )
      const width = 256,
        height = 256,
        color = new Uint8Array(width * height * 4),
        gain = new Uint8Array(color.length)
      const expected = new Uint16Array(width * height * 3),
        horizon = [0, 0, 0]
      for (let pixel = 0; pixel < width * height; pixel++) {
        const c = pixel % 256,
          g = Math.floor(pixel / 256),
          channels = [c, (c * 3) % 256, 255 - c]
        color.set([...channels, 255], pixel * 4)
        gain.set([g, g, g, 255], pixel * 4)
        for (let channel = 0; channel < 3; channel++) {
          const bits = half(
            Math.min(65504, linear(channels[channel]) * 2 ** ((g / 255) * 16)),
          )
          expected[pixel * 3 + channel] = bits
          if (g === Math.floor(height * 0.47) && c % 4 === 0)
            horizon[channel] += unhalf(bits) / Math.ceil(width / 4)
        }
      }
      const actual = packGainKey(color, gain, width, height),
        oldNative = native.packGainKey(color, gain, width, height)
      assert.deepEqual(actual.data, expected)
      assert.deepEqual(actual.horizon, horizon)
      assert.deepEqual(actual.data, oldNative.data)
      assert.deepEqual(actual.horizon, oldNative.horizon)
      assert.deepEqual(
        encodeGainKey(actual.data),
        native.encodeGainKey(oldNative.data),
      )
      // Additional frozen checksum, not the only oracle: original 5f63be75d68023c537492db2e715641850056526
      // src/engine/world/BakedSky.ts WORKER_SRC (the old fixture named a nonexistent client/world path).
      assert.equal(
        createHash('sha256')
          .update(new Uint8Array(actual.data.buffer))
          .digest('hex'),
        'ea2ca872eed3390d1121c8d1758cf14cfe74dfd128d5e27185a0526d94359cb0',
      )
      const storage = new Uint16Array([123, 15360, 16384, 17408, 456]),
        view = storage.subarray(1, 4)
      const packed = encodeGainKey(view)
      assert.deepEqual(packed, native.encodeGainKey(view))
      assert.deepEqual(
        gunzipSync(packed),
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      )
      assert.equal(storage[0], 123)
      assert.equal(storage[4], 456)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    assert.ok(
      performance.now() - started < 9500,
      'Complete installed codec proof exceeds 9.5 seconds',
    )
  },
)
