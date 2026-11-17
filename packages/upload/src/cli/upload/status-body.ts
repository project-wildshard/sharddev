// The API accepts reports up to 8 MiB. Leave room for the status envelope
// while bounding an unexpected proxy/server response before parsing JSON.
const MAX_STATUS_BYTES = 16_777_216

async function collect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const state: { decoder: TextDecoder; parts: string[]; bytes: number } = {
    decoder: new TextDecoder(),
    parts: [],
    bytes: 0,
  }
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Stream chunks arrive in order; parallel reads would not bound buffering.
    const next = await reader.read()
    if (next.done) {
      return state.parts.join('') + state.decoder.decode()
    }
    state.bytes += next.value.byteLength
    if (state.bytes > MAX_STATUS_BYTES) {
      // eslint-disable-next-line no-await-in-loop -- Cancel the same sequential stream before refusing its oversized body.
      await reader.cancel()
      throw new Error('upload status response exceeds the 16 MiB limit')
    }
    state.parts.push(state.decoder.decode(next.value, { stream: true }))
  }
}

async function readStatusBody(reply: Response): Promise<string> {
  if (reply.body === null) {
    return ''
  }
  const reader = reply.body.getReader()
  try {
    return await collect(reader)
  } finally {
    reader.releaseLock()
  }
}

export { readStatusBody }
