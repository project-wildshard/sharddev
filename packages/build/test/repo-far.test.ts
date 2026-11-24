// FORMAT-PRUNE FP40: a shard repo's own product (built with no generic bake) carries its repo's own far proxy, so the engine can
// delete its `public/assets/baked/<slug>/` copies and read every legacy neighbour's far view from its product.
// oxlint-disable-next-line import/no-nodejs-modules -- Owns a temporary repo bake fixture.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolves only the owned fixture directory.
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { bakeFarPlaceholder, placeholderJson } from '@wildshard/sdk/bake/placeholders';
import { withRepoFar } from '../src/sharddev/project';

type PlaceholderGrid = Parameters<typeof bakeFarPlaceholder>[0];
type PlaceholderLook = Parameters<typeof bakeFarPlaceholder>[1];

const res = 17, heights = Float32Array.from({ length: res * res }, (_, i) => 30 * Math.sin((i % res) * 0.7) * Math.cos(Math.floor(i / res) * 0.5) + 20);
const grid: PlaceholderGrid = { res, size: 500, heights, splat: null };
const look: PlaceholderLook = { family: 'toon', quads: 4, colourAt: () => [0.6, 0.5, 0.3], cliff: { lip: [0.4, 0.4, 0.4], foot: [0.3, 0.3, 0.3] }, haze: { colour: [0.7, 0.7, 0.8] } };

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function repo(tamper = false): Promise<{ root: string; baked: Awaited<ReturnType<typeof bakeFarPlaceholder>> }> {
  const baked = await bakeFarPlaceholder(grid, look);
  mkdirSync(resolve('tmp'), { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'repo-far-')), folder = join(root, 'public/assets/baked/test-isle');
  roots.push(root);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'far.glb'), tamper ? baked.bytes.slice(1) : baked.bytes); writeFileSync(join(folder, 'far-impostor.png'), baked.impostor);
  writeFileSync(join(folder, 'far.json'), placeholderJson(baked.manifest));
  return { root, baked };
}
const shard = (far: Shardfile['far'] = null): Shardfile => ({ identity: { slug: 'test-isle' }, files: [], far }) as unknown as Shardfile;

test("a product with no far row takes its repo bake's far row and files, byte for byte", async () => {
  const { root, baked } = await repo(), assets = new Map<string, Uint8Array>();
  const out = withRepoFar(shard(), assets, root);
  expect(out.far).toEqual(baked.manifest.far);
  expect(out.files).toEqual([baked.manifest.file, baked.manifest.impostorFile]);
  expect([...assets.get(baked.manifest.file.hash) ?? []]).toEqual([...baked.bytes]);
  expect([...assets.get(baked.manifest.impostorFile.hash) ?? []]).toEqual([...baked.impostor]);
});

test('a bake file that is not the one far.json names refuses', async () => {
  const { root } = await repo(true);
  expect(() => withRepoFar(shard(), new Map(), root)).toThrow('far.glb is not the bake');
});

test('a shard that declares its own far, or whose repo holds no bake, is kept as it is', async () => {
  const { root, baked } = await repo();
  const own = shard(baked.manifest.far);
  expect(withRepoFar(own, new Map(), root)).toBe(own);
  const none = shard();
  expect(withRepoFar(none, new Map(), resolve('tmp', 'no-such-repo'))).toBe(none);
});
