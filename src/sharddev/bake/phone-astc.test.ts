import { expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Level bodies are checked against their declared raw ASTC size.
import { zstdDecompressSync } from 'node:zlib';
import { bakeWorldTexture } from './textureWasm';
import { writeImagePixels } from './image';
import { phoneAstcKtx2 } from './phoneAstc';
import { ktx2DeviceCosts } from '@wildshard/format/ktx2Cost';

const pixels = (width: number, height: number): Promise<Uint8Array> => writeImagePixels({ width, height,
  pixels: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 37 + Math.floor(i / 64) * 19) % 256) });

test.each([{ colour: 'srgb' as const, vk: 158 }, { colour: 'linear' as const, vk: 157 }])('a $colour UASTC file becomes ASTC 4x4 with its own mips and transfer', async row => {
  const input = await bakeWorldTexture(await pixels(16, 8), row.colour), output = await phoneAstcKtx2(input);
  const before = new DataView(input.buffer, input.byteOffset, input.byteLength), after = new DataView(output.buffer, output.byteOffset, output.byteLength);
  expect(after.getUint32(12, true)).toBe(row.vk);
  expect(after.getUint32(44, true)).toBe(2);
  for (const offset of [20, 24, 40]) expect(after.getUint32(offset, true)).toBe(before.getUint32(offset, true));
  const dfd = after.getUint32(48, true);
  expect(output[dfd + 12]).toBe(162);
  expect(output[dfd + 14]).toBe(input[before.getUint32(48, true) + 14]);
  const levels = after.getUint32(40, true);
  for (let level = 0; level < levels; level++) {
    const row24 = 80 + level * 24, at = Number(after.getBigUint64(row24, true)), size = Number(after.getBigUint64(row24 + 8, true));
    const raw = Math.ceil(Math.max(1, 16 >> level) / 4) * Math.ceil(Math.max(1, 8 >> level) / 4) * 16;
    expect(Number(after.getBigUint64(row24 + 16, true))).toBe(raw);
    expect(zstdDecompressSync(output.subarray(at, at + size)).length).toBe(raw);
  }
  // Every device uploads the blocks themselves: no RGBA expansion is charged.
  const costs = ktx2DeviceCosts(output);
  expect(costs.rgba).toBe(costs.astc); expect(costs.astc).toBe(ktx2DeviceCosts(input).astc);
});

test('an already transcoded file passes through unchanged', async () => {
  const astc = await phoneAstcKtx2(await bakeWorldTexture(await pixels(8, 8), 'srgb'));
  expect(await phoneAstcKtx2(astc)).toBe(astc);
});
