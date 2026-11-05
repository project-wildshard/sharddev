import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

import { DEFAULT_BROTLI_LEVEL, storedForm } from './compress.ts'

const SIZE = 200_000

test('keeps the plain tarball when Brotli saves nothing', async (): Promise<void> => {
  const noise = randomBytes(SIZE)

  const form = await storedForm(noise, DEFAULT_BROTLI_LEVEL)

  assert.equal(form.contentEncoding, undefined)
  assert.equal(form.body, noise)
})

test('takes Brotli when it saves something', async (): Promise<void> => {
  const zeros = new Uint8Array(SIZE)

  const form = await storedForm(zeros, DEFAULT_BROTLI_LEVEL)

  assert.equal(form.contentEncoding, 'br')
  assert.ok(form.body.length < SIZE / 100)
  assert.equal(brotliDecompressSync(form.body).length, SIZE)
})
