// oxlint-disable-next-line import/no-nodejs-modules -- Deterministic native compression is build-only.
import { constants, deflateSync, inflateSync, zstdCompressSync } from 'node:zlib';
import { encodePortableBytes } from '@wildshard/sdk/bake/portableBytes';

/** Encode bounded owned build results with the pinned codecs; never installs a runtime service.
 * Deflate keeps its portable default; native explicitly preserves Node zlib bytes under a native cache key. */
export function encodeBuildBytes(input: Uint8Array, codec: 'deflate' | 'zstd', level?: number, deflateBackend: 'portable' | 'native' = 'portable'): Uint8Array {
  if (!(input instanceof Uint8Array) || !(input.buffer instanceof ArrayBuffer) || input.byteLength > 256_000_000) throw new Error('Build codec requires bounded unshared bytes');
  if (level !== undefined && !Number.isInteger(level)) throw new Error('Build codec level must be an integer');
  if (deflateBackend !== 'portable' && deflateBackend !== 'native') throw new Error('Unknown deflate backend');
  const bytes = new Uint8Array(input); // Own the selected view; detached inputs refuse here.
  if (codec === 'deflate') {
    const selected = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find(value => value === (level ?? 9));
    if (selected === undefined) throw new Error('Deflate level must be an integer from 0 to 9');
    return new Uint8Array(deflateBackend === 'native' ? deflateSync(bytes, { level: selected }) : encodePortableBytes(bytes, selected));
  }
  if (codec !== 'zstd') throw new Error('Unknown build codec');
  if (deflateBackend !== 'portable') throw new Error('Deflate backend is only valid for deflate');
  const selected = level ?? 19;
  if (!Number.isInteger(selected) || selected < 1 || selected > 22) throw new Error('Zstd level must be an integer from 1 to 22');
  return new Uint8Array(zstdCompressSync(bytes, { params: { [constants.ZSTD_c_compressionLevel]: selected } }));
}

/** Decode one bounded build-time zlib stream into an owned buffer of exactly the declared size.
 * The native inflater enforces the bound during decoding, before an oversized result can allocate. */
export function decodeBuildDeflate(input: Uint8Array, expectedBytes: number): Uint8Array<ArrayBuffer> {
  if (!(input instanceof Uint8Array) || !(input.buffer instanceof ArrayBuffer) || input.byteLength > 256_000_000) throw new Error('Build codec requires bounded unshared bytes');
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > 256_000_000) throw new Error('Invalid decoded build byte length');
  const bytes = new Uint8Array(input); // Own the selected view; detached inputs refuse here.
  const decoded = inflateSync(bytes, { maxOutputLength: Math.max(1, expectedBytes) });
  if (decoded.byteLength !== expectedBytes) throw new Error('Decoded build byte length differs');
  return Uint8Array.from(decoded);
}
