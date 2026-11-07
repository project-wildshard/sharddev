import { parseKtx2 } from '../assets';
import { encodeBuildBytes } from './byteCodec';
import type { ImagePixels } from './image';

/** Pack owned bounded RGBA pixels into the original single-level Zstd KTX2, without file/image services.
 * Rows retain their supplied order. Linear stores numerical channels; the default transfer is sRGB.
 * An optional trusted build encoder preserves the same Zstd level; raster and KTX2 admission always run here. */
export function bakeRawColourPixels(image: ImagePixels, options: { colourSpace?: 'srgb' | 'linear' } = {}, encode?: (input: Uint8Array, level: number) => Uint8Array): Uint8Array {
  const { width, height, pixels } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096
    || !(pixels instanceof Uint8ClampedArray) || !(pixels.buffer instanceof ArrayBuffer) || pixels.byteLength !== width * height * 4) throw new Error('Invalid bounded RGBA raster');
  if (options.colourSpace !== undefined && !['srgb', 'linear'].includes(options.colourSpace)) throw new Error('Invalid texture colour space');
  const linear = options.colourSpace === 'linear';
  const input = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const packed = encode === undefined ? encodeBuildBytes(input, 'zstd', 19) : encode(input, 19);
  const descriptorSize = 92, offset = 104 + descriptorSize, out = new Uint8Array(offset + packed.length), view = new DataView(out.buffer);
  out.set([171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]);
  // RGBA8 with explicit transfer, one Zstd level. Descriptor and level bytes never overlap.
  [linear ? 37 : 43, 1, width, height, 0, 0, 1, 1, 2, 104, descriptorSize].forEach((value, i) => { view.setUint32(12 + i * 4, value, true); });
  view.setBigUint64(80, BigInt(offset), true); view.setBigUint64(88, BigInt(packed.length), true); view.setBigUint64(96, BigInt(pixels.length), true);
  view.setUint32(104, descriptorSize, true); view.setUint16(112, 2, true); view.setUint16(114, descriptorSize - 4, true); out.set([1, 1, linear ? 1 : 2, 0], 116);
  for (let channel = 0; channel < 4; channel++) {
    const at = 132 + channel * 16; view.setUint16(at, channel * 8, true); out[at + 2] = 7; out[at + 3] = channel === 3 ? 15 : channel; view.setUint32(at + 12, 255, true);
  }
  out.set(packed, offset); parseKtx2(out); return out;
}
