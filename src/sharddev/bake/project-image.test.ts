// oxlint-disable-next-line import/no-nodejs-modules -- The context uses an explicit author root without writing files for pixel decode.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { createProjectGeneration } from '../projectGeneration';
import { readImagePixels, writeImagePixels } from './image';

const context = () => createProjectGeneration(resolve('src/shards/sunscar-dunes'), 'a'.repeat(64), new Map());

test('the injected image capability uses the defining bounded decoder and owns every pixel result', async () => {
  const ctx = context(); expect(ctx.readImagePixels).toBe(readImagePixels);
  const pixels = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
  const source = await writeImagePixels({ width: 1, height: 2, pixels });
  const first = await ctx.readImagePixels(source), second = await ctx.readImagePixels(source);
  expect(first).toEqual({ width: 1, height: 2, pixels });
  first.pixels.fill(0);
  expect(second.pixels).toEqual(pixels);
  expect((await ctx.readImagePixels(source, { flipY: true })).pixels).toEqual(new Uint8ClampedArray([5, 6, 7, 8, 1, 2, 3, 4]));
});

for (const bytes of [new Uint8Array(), new Uint8Array([1, 2, 3]), new Uint8Array(25_000_001)]) {
  test(`the injected image capability refuses invalid source bytes (${String(bytes.length)})`, async () => {
    await expect(context().readImagePixels(bytes)).rejects.toThrow();
  });
}
