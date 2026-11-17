import sharp from 'sharp';

/** Bounded still raster header used before pixel decode by authored-world normalization and texture baking. */
export async function worldImageInfo(bytes: Uint8Array): Promise<{ mime: string; width: number; height: number }> {
  if (bytes.length === 0 || bytes.length > 25_000_000) throw new Error('World texture must be a bounded embedded PNG/JPEG/WebP');
  const header = await sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: 'warning' }).metadata();
  const { format, width, height, pages } = header;
  if ((format !== 'png' && format !== 'jpeg' && format !== 'webp')
    || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096
    || (pages !== undefined && pages !== 1)) throw new Error('World texture must be a bounded still PNG/JPEG/WebP');
  return { mime: `image/${format}`, width, height };
}
