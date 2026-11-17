import {zlibSync, unzlibSync} from 'fflate';

/** Config-safe portable deflate with owned, bounded input; no native file or compression services enter author bundles. */
export function encodePortableBytes(input:Uint8Array,level=9):Uint8Array<ArrayBuffer>{
  if(!(input instanceof Uint8Array)||!(input.buffer instanceof ArrayBuffer)||input.byteLength>256_000_000)throw new Error('Build codec requires bounded unshared bytes');
  const selected=([0,1,2,3,4,5,6,7,8,9]as const).find(value=>value===level);
  if(selected===undefined)throw new Error('Deflate level must be an integer from 0 to 9');
  return new Uint8Array(zlibSync(new Uint8Array(input),{level:selected}));
}

/** Config-safe portable source inflation with owned input/output and the build
 * byte cap. Retains the defining portable decoder and its malformed-stream refusals. */
export function decodePortableBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!(input instanceof Uint8Array) || !(input.buffer instanceof ArrayBuffer) || input.byteLength > 256_000_000) throw new Error('Build codec requires bounded unshared bytes');
  const bytes = unzlibSync(new Uint8Array(input));
  if (bytes.byteLength > 256_000_000) throw new Error('Decoded build byte cap');
  return new Uint8Array(bytes);
}
