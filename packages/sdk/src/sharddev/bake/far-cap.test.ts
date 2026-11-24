import { expect, test, vi } from 'vitest';
import * as v from 'valibot';
import { CONTENT_CAPS } from '@wildshard/format/contentBounds';
import { FarSchema } from '@wildshard/format/shardSections';
import { bakeFarPlaceholder, projectFarPlaceholder, repoFarRows } from './placeholders';
import type { PlaceholderGrid, PlaceholderLook } from './placeholderGeometry';

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

// J509 (Jake, 11-24): the look decides, not the byte cap; a zone whose far is over the 1.6 MB resident cap keeps its impostor.
test('the project far bake keeps its impostor over the 1.6 MB resident cap (J509)', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  const resident = full.manifest.far.decoded + full.manifest.far.gpu - 1, warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const baked = await projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, resident });
    expect(baked.impostor?.bytes).toEqual(full.impostor);
    expect(baked.far).toEqual(full.manifest.far);
    expect(baked.far.decoded + baked.far.gpu).toBeGreaterThan(resident);
    expect(warn.mock.calls.flat().join(' ')).toContain('J509');
  } finally { warn.mockRestore(); }
});

test('a zone over 1.6 MB resident keeps its far impostor at the real cap', async () => {
  const full = await bakeFarPlaceholder(grid, look), { far } = full.manifest;
  // Grow the bake's rows past CONTENT_CAPS.far.resident (1.6 MB) as a large impostor would; download, triangles and draws stay under.
  const big: typeof far = { ...far, decoded: CONTENT_CAPS.far.resident, gpu: far.gpu };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const kept = repoFarRows(big, full.bytes, full.impostor);
    expect(kept.far.impostor).toBeDefined();
    expect(kept.files).toHaveLength(2);
  } finally { warn.mockRestore(); }
});

test('the project far bake drops to the GLB alone when its impostor breaches the compressed cap', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  const baked = await projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, compressed: full.manifest.file.compressed });
  expect(baked.impostor).toBeNull();
  expect(baked.far.compressed).toBe(full.manifest.file.compressed);
});

test('the project far bake still refuses when the GLB alone breaches a cap the format refuses', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  await expect(projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, compressed: full.manifest.file.compressed - 1 })).rejects.toThrow('Far proxy exceeds content caps');
});

// FORMAT-PRUNE FP40: a repo bake's far (far.json, far.glb, far-impostor.png) shipped in its product, costs from its bytes.
test('a repo far keeps its row and impostor, its costs recomputed from the bytes', async () => {
  const full = await bakeFarPlaceholder(grid, look);
  const stale = { ...full.manifest.far, decoded: 0, gpu: 1 };
  const { far, files } = repoFarRows(stale, full.bytes, full.impostor);
  expect(far).toEqual(full.manifest.far);
  expect(files).toEqual([full.manifest.file, full.manifest.impostorFile]);
});

test('a repo far drops its impostor over the download cap and refuses when the GLB alone breaches it', async () => {
  const full = await bakeFarPlaceholder(grid, look), { file } = full.manifest;
  const over = repoFarRows(full.manifest.far, full.bytes, full.impostor, { ...CONTENT_CAPS.far, compressed: file.compressed });
  expect(over.far).toEqual({ bounds: full.manifest.far.bounds, files: [file.hash], compressed: file.compressed, decoded: file.decoded, gpu: file.gpu, triangles: file.triangles, draws: file.draws });
  expect(over.files).toEqual([file]);
  expect(() => repoFarRows(full.manifest.far, full.bytes, null, { ...CONTENT_CAPS.far, compressed: file.compressed - 1 })).toThrow('Far proxy exceeds content caps');
});
