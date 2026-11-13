import { expect, test } from 'vitest';
import * as v from 'valibot';
import { CONTENT_CAPS } from '@wildshard/engine/core/config';
import { FarSchema } from '@wildshard/format/shardSections';
import { bakeFarPlaceholder, projectFarPlaceholder } from './placeholders';
import type { PlaceholderGrid, PlaceholderLook } from '@wildshard/engine/game/plugin/placeholderGeometry';

// QA 11-13 row 4: `wildshard check`'s generic far bake keeps the GLB alone when the GLB plus its impostor breaks a far cap.
const res = 17, heights = Float32Array.from({ length: res * res }, (_, i) => 30 * Math.sin((i % res) * 0.7) * Math.cos(Math.floor(i / res) * 0.5) + 20);
const grid: PlaceholderGrid = { res, size: 500, heights, splat: null };
const look: PlaceholderLook = { family: 'toon', quads: 4, colourAt: () => [0.6, 0.5, 0.3], cliff: { lip: [0.4, 0.4, 0.4], foot: [0.3, 0.3, 0.3] }, haze: { colour: [0.7, 0.7, 0.8] } };

test('the project far bake keeps its impostor when the pair fits the caps', async () => {
  const baked = await projectFarPlaceholder(grid, look), full = await bakeFarPlaceholder(grid, look);
  expect(baked.far).toEqual(full.manifest.far);
  expect(baked.impostor?.file).toEqual(full.manifest.impostorFile);
  expect(baked.impostor?.bytes).toEqual(full.impostor);
});

test('the project far bake drops to the GLB alone when its impostor breaches the resident cap', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  // Driftwood's case: the pair is over, the GLB alone is well under
  const baked = await projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, resident: full.manifest.far.decoded + full.manifest.far.gpu - 1 });
  expect(baked.impostor).toBeNull();
  expect(v.parse(FarSchema, baked.far)?.impostor).toBeUndefined();
  expect(baked.far.files).toEqual([full.manifest.file.hash]);
  expect(baked.file).toEqual(full.manifest.file);
  expect(baked.bytes).toEqual(full.bytes);
  const { file } = full.manifest;
  expect(baked.far).toMatchObject({ bounds: full.manifest.far.bounds, compressed: file.compressed, decoded: file.decoded, gpu: file.gpu, triangles: file.triangles, draws: file.draws });
});

test('the project far bake drops to the GLB alone when its impostor breaches the compressed cap', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  const baked = await projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, compressed: full.manifest.file.compressed });
  expect(baked.impostor).toBeNull();
  expect(baked.far.compressed).toBe(full.manifest.file.compressed);
});

test('the project far bake still refuses when the GLB alone breaches a cap', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  await expect(projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, resident: full.manifest.file.decoded + full.manifest.file.gpu - 1 })).rejects.toThrow('Far proxy exceeds content caps');
});
