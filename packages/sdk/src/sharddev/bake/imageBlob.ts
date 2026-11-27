// oxlint-disable-next-line import/no-nodejs-modules -- Host-owned author tooling writes a deterministic lossless PNG at build time.
import { crc32, deflateSync } from 'node:zlib';
import type { ImagePixels } from './image';

/** SF18 (J525): a shardfile carries images only and the cook makes every KTX2. The SDK's build keeps each texture as the
 *  PNG or JPEG it was made from; these are its two small seams. */

/** The shardfile kind of a texture's bytes: a PNG or JPEG is an `image`; anything else (a KTX2 a generator still bakes)
 *  keeps its old kind, so format's images-only rule names it at pack time rather than the SDK hiding it. */
export function textureKind(bytes: Uint8Array): 'image' | 'ktx2' {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg ? 'image' : 'ktx2';
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

/** Exactly the supplied bounded RGBA raster as a lossless 8-bit RGBA PNG, synchronously and byte-for-byte deterministic
 *  (filter 0 on every row, one IDAT). The cook decodes the same texels. */
export function pngFromPixels(image: ImagePixels): Uint8Array {
  const { width, height, pixels } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || pixels.length !== width * height * 4) throw new Error('Invalid bounded RGBA raster');
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const stride = width * 4, raw = new Uint8Array((stride + 1) * height);
  for (let row = 0; row < height; row++) raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', header), chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
