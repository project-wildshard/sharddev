// Build-only RGB half-float rows. The upload retains each driver's RGB9_E5 quantization.
import { gzipSync } from 'node:zlib';
import { DataUtils } from 'three';

/** Keep the shipped gzip OS marker stable across Darwin and Linux producers. */
export function encodeGainKey(data) {
  const bytes = gzipSync(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { level: 9 });
  bytes[9] = 19; // Preserve the original Darwin catalogue; this header does not affect inflation.
  return bytes;
}

/** Match BakedSky's gain lookup, drop constant alpha offline, and retain the original horizon means. */
export function packGainKey(color, gain, width, height) {
  if (color.length !== width * height * 4 || gain.length !== color.length) throw new Error('Sky plane sizes differ');
  const lin = new Float32Array(256), lut = new Uint16Array(65536);
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  const half = value => {
    f32[0] = value; const x = u32[0], e = ((x >>> 23) & 255) - 112, m = x & 0x7fffff;
    if (e >= 31) return 0x7bff;
    if (e <= 0) return e < -10 ? 0 : ((((m | 0x800000) >>> (1 - e)) + 0x1000) >>> 13);
    return (e << 10) + ((m + 0x1000) >>> 13);
  };
  for (let c = 0; c < 256; c++) { const s = c / 255; lin[c] = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
  for (let g = 0; g < 256; g++) for (let c = 0; c < 256; c++) lut[g * 256 + c] = half(Math.min(65504, lin[c] * 2 ** (g / 255 * 16)));
  const data = new Uint16Array(width * height * 3), horizon = [0, 0, 0], row = Math.floor(height * 0.47);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4, at = gain[i] * 256;
    for (let c = 0; c < 3; c++) {
      const value = lut[at + color[i + c]]; data[p * 3 + c] = value;
      if (Math.floor(p / width) === row && p % width % 4 === 0) horizon[c] += DataUtils.fromHalfFloat(value);
    }
  }
  return { data, horizon: horizon.map(c => c / Math.ceil(width / 4)) };
}
