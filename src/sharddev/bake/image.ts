import sharp from 'sharp';
import { worldImageInfo } from './worldImage';

/** Bounded, unpremultiplied RGBA raster in source row order; consumers explicitly choose any vertical flip. */
export interface ImagePixels { readonly width: number; readonly height: number; readonly pixels: Uint8ClampedArray }
/** Decode a still PNG/JPEG/WebP in Node with the SDK's pinned Sharp decoder, without a DOM or renderer. */
export async function readImagePixels(bytes: Uint8Array, options: { flipY?: boolean } = {}): Promise<ImagePixels> {
  const info = await worldImageInfo(bytes);
  const raster = sharp(bytes, { limitInputPixels: 4096 * 4096, animated: false, failOn: 'warning' });
  if (options.flipY === true) raster.flip();
  const decoded = await raster.ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== info.width || decoded.info.height !== info.height || decoded.info.channels !== 4 || decoded.data.length !== info.width * info.height * 4) throw new Error('Decoded raster differs from admitted dimensions');
  return { width: info.width, height: info.height, pixels: new Uint8ClampedArray(decoded.data) };
}
/** Encode exactly the supplied bounded RGBA raster as a deterministic lossless PNG at build time. */
export async function writeImagePixels(image: ImagePixels): Promise<Uint8Array> {
  const { width, height, pixels } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || pixels.length !== width * height * 4) throw new Error('Invalid bounded RGBA raster');
  return new Uint8Array(await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer());
}
