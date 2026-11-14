import { expect, test } from 'vitest';
import * as v from 'valibot';
import { assetCost } from '@wildshard/format/shardfileAssets';
import { FarSchema } from '@wildshard/format/shardSections';
import { bakeFarPlaceholder } from './placeholders';
import { FAR_IMPOSTOR_BAKE } from './farImpostor';
import { readImagePixels } from './image';
import type { PlaceholderGrid, PlaceholderLook } from '@wildshard/engine/game/plugin/placeholderGeometry';

// G539: every far proxy bakes a camera-facing impostor beside it, admitted in the same far row and its caps.
const res = 17, heights = Float32Array.from({ length: res * res }, (_, i) => 30 * Math.sin((i % res) * 0.7) * Math.cos(Math.floor(i / res) * 0.5) + 20);
const grid: PlaceholderGrid = { res, size: 500, heights, splat: null };
const look: PlaceholderLook = { family: 'toon', quads: 4, colourAt: () => [0.6, 0.5, 0.3], cliff: { lip: [0.4, 0.4, 0.4], foot: [0.3, 0.3, 0.3] }, haze: { colour: [0.7, 0.7, 0.8] } };

test('the far bake ships an admitted impostor image', async () => {
  const baked = await bakeFarPlaceholder(grid, look);
  const far = v.parse(FarSchema, baked.manifest.far);
  if (far?.impostor === undefined) throw new Error('No impostor row');
  expect(far.files).toEqual([baked.manifest.file.hash, baked.manifest.impostorFile.hash]);
  expect(far.impostor).toMatchObject({ views: FAR_IMPOSTOR_BAKE.views, cols: FAR_IMPOSTOR_BAKE.cols, tile: [...FAR_IMPOSTOR_BAKE.tile] });
  const [tw, th] = FAR_IMPOSTOR_BAKE.tile, rows = Math.ceil(FAR_IMPOSTOR_BAKE.views / FAR_IMPOSTOR_BAKE.cols);
  const { pixels: data, width, height } = await readImagePixels(baked.impostor);
  expect([width, height]).toEqual([FAR_IMPOSTOR_BAKE.cols * tw, rows * th]);
  // every view covers something and leaves sky above it; alpha is one bit
  for (let k = 0; k < FAR_IMPOSTOR_BAKE.views; k++) {
    let covered = 0;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) covered += (data[(((Math.floor(k / FAR_IMPOSTOR_BAKE.cols) * th + y) * FAR_IMPOSTOR_BAKE.cols * tw) + (k % FAR_IMPOSTOR_BAKE.cols) * tw + x) * 4 + 3] ?? 0) > 0 ? 1 : 0;
    expect(covered).toBeGreaterThan(tw * th * 0.2); expect(covered).toBeLessThan(tw * th);
  }
  expect(new Set([...data].filter((_, i) => i % 4 === 3))).toEqual(new Set([0, 255]));
  const imageCost = assetCost('image', baked.impostor);
  expect(baked.manifest.impostorFile).toMatchObject(imageCost);
  expect(far.decoded).toBe(baked.manifest.file.decoded + imageCost.decoded);
  expect(far.gpu).toBe(baked.manifest.file.gpu + imageCost.gpu);
  // deterministic
  expect((await bakeFarPlaceholder(grid, look)).impostor).toEqual(baked.impostor);
});
