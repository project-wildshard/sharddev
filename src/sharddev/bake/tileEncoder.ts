// oxlint-disable-next-line import/no-nodejs-modules -- Build-only delivery selection uses the same gzip-9 as named blob intake.
import { gzipSync } from 'node:zlib';
import { compressGlb } from './glbCompression';

/** Lossless named-tile candidate: preserve every buffer-view word and scene field.
 * Keep the original unless gzip-9 strictly improves; no quantization or reordering.
 * The tile compiler derives identity and conservative costs from these final bytes. */
export function meshoptTileBytes(input: Uint8Array): Uint8Array {
  const original = Uint8Array.from(input), packed = compressGlb(original);
  return gzipSync(packed, { level: 9 }).length < gzipSync(original, { level: 9 }).length ? packed : original;
}
