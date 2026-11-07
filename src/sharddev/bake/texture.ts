// oxlint-disable-next-line import/no-nodejs-modules -- Trusted author tools run the local, pinned texture encoder at build time.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Encoder throwaways belong to one temporary directory and are always removed.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Portable temporary directory for the author CLI.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only filenames inside the encoder's owned temporary directory.
import { join } from 'node:path';
import { parseKtx2 } from '../assets';
import { readImagePixels } from './image';
import { bakeRawColourPixels } from './rawTexture';

/** Bake PNG colour pixels to mipmapped sRGB UASTC KTX2; the engine's existing loader transcodes these blocks to ASTC. */
export function bakeColourTexture(png: Uint8Array, encoder = 'basisu', options: { flipY?: boolean } = {}): Uint8Array {
  if (png.length < 24 || png.length > 25_000_000 || png[0] !== 137 || png[1] !== 80 || png[2] !== 78 || png[3] !== 71) throw new Error('Texture source must be a bounded PNG');
  const header = new DataView(png.buffer, png.byteOffset, png.byteLength), width = header.getUint32(16), height = header.getUint32(20);
  if (width === 0 || height === 0 || width > 4096 || height > 4096) throw new Error('Texture dimensions exceed cap');
  const directory = mkdtempSync(join(tmpdir(), 'wildshard-texture-'));
  try {
    const input = join(directory, 'colour.png'), output = join(directory, 'colour.ktx2'); writeFileSync(input, png);
    execFileSync(encoder, ['-ktx2', '-uastc', '-uastc_level', '2', '-srgb', '-mipmap', '-mip_filter', 'box', '-max_threads', '4', '-ktx2_zstandard_level', '20', ...(options.flipY === true ? ['-y_flip'] : []), input, '-output_file', output], { stdio: 'pipe', timeout: 120000 });
    const bytes = Uint8Array.from(readFileSync(output)); parseKtx2(bytes); return bytes;
  } finally { rmSync(directory, { recursive: true }); }
}

/** Store bounded PNG/JPEG/WebP pixels byte-exact in a single-level Zstd RGBA8 KTX2.
 * No lossy encoder or colour transform runs. flipY explicitly selects source row orientation;
 * colourSpace:'linear' retains numerical texture values (default: sRGB).
 * look.samplers mips:'gpu' uses the runtime's existing mip law, as for a painted bitmap. */
export async function bakeRawColourTexture(image: Uint8Array, options: { flipY?: boolean; colourSpace?: 'srgb' | 'linear' } = {}): Promise<Uint8Array> {
  if (options.colourSpace !== undefined && !['srgb', 'linear'].includes(options.colourSpace)) throw new Error('Invalid texture colour space');
  return bakeRawColourPixels(await readImagePixels(image, options), options);
}
