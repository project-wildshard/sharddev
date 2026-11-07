// oxlint-disable-next-line import/no-nodejs-modules -- The CLI reads author files through a bounded open descriptor.
import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { SHARDFILE_ADMISSION_LIMITS as limits } from '@wildshard/format/admissionLimits';

/** Read a file within its declared wire bound, detecting growth without an unbounded readFile allocation.
 * The requested cap is validated before opening the file.
 * The initial size check runs before allocating the payload buffer.
 * The descriptor is closed even when a bound or growth check rejects it.
 * A short read returns only the bytes actually read from the open descriptor. */
export function readBoundedFile(path: string, maximum: number): Uint8Array {
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > limits.wireBytes) throw new Error('Invalid file admission bound');
  const descriptor = openSync(path, 'r');
  try {
    const size = fstatSync(descriptor).size;
    if (!Number.isSafeInteger(size) || size > maximum) throw new Error(`File exceeds admission byte cap: ${path} (${size} > ${maximum})`);
    const bytes = new Uint8Array(size); let at = 0;
    while (at < size) { const count = readSync(descriptor, bytes, at, size - at, null); if (count === 0) break; at += count; }
    if (readSync(descriptor, new Uint8Array(1), 0, 1, null) !== 0) throw new Error('File grew beyond admission byte cap');
    return bytes.subarray(0, at);
  } finally { closeSync(descriptor); }
}
/** Parse only source bytes within the shared network/cache limit, rejecting malformed UTF-8.
 * JSON parsing starts after the bounded read and fatal UTF-8 decoding. */
export function readShardfileSource(path: string): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(path, limits.sourceBytes)));
}
