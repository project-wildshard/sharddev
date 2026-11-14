// oxlint-disable-next-line import/no-nodejs-modules -- The handshake's accept key is a SHA-1 of the client's key.
import { createHash } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The watch server upgrades its own HTTP requests.
import type { IncomingMessage } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- An upgraded request hands over its raw socket.
import type { Duplex } from 'node:stream';

/**
 * SHARD-SOURCE AP5: the watch server's WebSocket, server to page only (RFC 6455, text frames out; the page sends nothing
 * but a close or a pong). The page script is the only client, on 127.0.0.1, so this is the handshake, one frame writer and
 * a reader that answers a close and a ping: no extensions, no fragmentation, no dependency.
 */
export interface WatchSocket { send: (text: string) => void; close: () => void; readonly closed: () => boolean }

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length, head = length < 126 ? Buffer.alloc(2) : length < 65_536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (length < 126) head[1] = length;
  else if (length < 65_536) { head[1] = 126; head.writeUInt16BE(length, 2); }
  else { head[1] = 127; head.writeBigUInt64BE(BigInt(length), 2); }
  return Buffer.concat([head, payload]);
}

/** Answer an upgrade request; null (and a 400) when it isn't a WebSocket handshake. */
export function acceptSocket(request: IncomingMessage, socket: Duplex, onClose: () => void): WatchSocket | null {
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string' || request.headers.upgrade?.toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return null; }
  const accept = createHash('sha1').update(`${key}${GUID}`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let closed = false, pending = Buffer.alloc(0);
  const end = (): void => { if (closed) return; closed = true; socket.end(); onClose(); };
  socket.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 2) {
      const opcode = (pending[0] ?? 0) & 0x0f, masked = ((pending[1] ?? 0) & 0x80) !== 0;
      let length = (pending[1] ?? 0) & 0x7f, offset = 2;
      if (length === 126) { if (pending.length < 4) return; length = pending.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (pending.length < 10) return; length = Number(pending.readBigUInt64BE(2)); offset = 10; }
      const mask = masked ? pending.subarray(offset, offset + 4) : null; if (masked) offset += 4;
      if (pending.length < offset + length) return;
      const payload = Buffer.from(pending.subarray(offset, offset + length));
      if (mask !== null) for (let i = 0; i < payload.length; i++) payload[i] = (payload[i] ?? 0) ^ (mask[i % 4] ?? 0);
      pending = pending.subarray(offset + length);
      if (opcode === 0x8) { if (!closed) socket.write(frame(0x8, Buffer.alloc(0))); end(); return; }
      if (opcode === 0x9 && !closed) socket.write(frame(0xa, payload));
    }
  });
  socket.on('close', end);
  socket.on('error', end);
  return {
    send: (text) => { if (!closed) socket.write(frame(0x1, Buffer.from(text, 'utf8'))); },
    close: () => { if (!closed) socket.write(frame(0x8, Buffer.alloc(0))); end(); },
    closed: () => closed,
  };
}
