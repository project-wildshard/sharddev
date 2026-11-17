import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readStatusBody } from './status-body.ts'

test('status reports retain a full 8 MiB payload and split Unicode', async (): Promise<void> => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ report: `${'x'.repeat(8 * 1024 * 1024)}é` }),
  )
  const reply = new Response(
    new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(bytes.subarray(0, -3))
        controller.enqueue(bytes.subarray(-3))
        controller.close()
      },
    }),
  )
  assert.equal(await readStatusBody(reply), new TextDecoder().decode(bytes))
})

test('an oversized streaming status body is cancelled before its tail is read', async (): Promise<void> => {
  const state = { cancelled: false, pulls: 0 }
  const chunk = new Uint8Array(1024 * 1024)
  const reply = new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller): void {
          state.pulls += 1
          controller.enqueue(chunk)
        },
        cancel(): void {
          state.cancelled = true
        },
      },
      { highWaterMark: 0 },
    ),
  )
  await assert.rejects(
    readStatusBody(reply),
    /status response exceeds the 16 MiB limit/u,
  )
  assert.equal(state.cancelled, true)
  assert.equal(state.pulls, 17)
})

test('an empty status body stays an invalid empty API reply', async (): Promise<void> => {
  assert.equal(await readStatusBody(new Response()), '')
})
