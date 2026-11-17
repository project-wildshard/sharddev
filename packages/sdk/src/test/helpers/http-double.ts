// oxlint-disable typescript/prefer-readonly-parameter-types -- a server and a response are what it drives
import { once } from 'node:events'
import type { Server, ServerResponse } from 'node:http'

// The socket plumbing the upload double stands on: listen on a free
// loopback port, close every connection, answer JSON.

const JSON_TYPE = { 'content-type': 'application/json' }

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('upload double: not listening on a TCP port')
  }
  return `http://127.0.0.1:${String(address.port)}`
}

async function close(server: Server): Promise<void> {
  const closed = once(server, 'close')
  server.closeAllConnections()
  server.close()
  await closed
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, JSON_TYPE).end(JSON.stringify(body))
}

export { close, listen, sendJson }
