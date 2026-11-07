// oxlint-disable-next-line import/no-nodejs-modules -- The fixtures own their bounded author and output files.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- All fixture files stay under the owned scratch root.
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parseManifestMetadata } from '@wildshard/format/minimap';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { nameBlob } from '@wildshard/sharddev/blobs';
import { assetCost } from '@wildshard/format/product';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { buildProject, readProjectAssets } from '@wildshard/sharddev/project';
import { manifestImages, readManifestSource, type ProjectManifestSource } from '@wildshard/sharddev/projectManifest';
import { validateOutputProduct } from '@wildshard/sharddev/outputProduct';
import { AUTHOR_BUDGETS_MODULE } from '../src/sharddev/authorManifest';
import { runWildshard } from '../scripts/wildshard.mjs';
import metadata from '../src/shards/far-reach/manifest.json';

const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture(): { project: string; output: string; manifest: ProjectManifestSource & { readonly file: string }; bytes: Uint8Array; url: string; root: string } {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'project-level-')), folder = 'level-test', project = resolve(root, folder);
  owned.push(root); mkdirSync(project);
  const bytes = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png')), url = `/src/shards/${folder}/shared.png`;
  writeFileSync(resolve(project, 'shared.png'), bytes);
  const base = parseManifestMetadata(metadata), { compare: _compare, ...explore } = base.explore;
  const authored = parseManifestMetadata({ ...base, slug: folder,
    card: { thumb: url, portrait: url, landscape: url }, minimap: { ...base.minimap, image: url },
    explore: { ...explore, art: { world: url, models: url, sets: url, practice: url } },
    // The level's program values are its generator's; this fixture has none, so it binds what an author with no generator binds.
    bindings: { accent: base.bindings.accent, budgets: { module: AUTHOR_BUDGETS_MODULE, export: 'default' } },
  }, folder);
  const file = resolve(project, 'manifest.json'); writeFileSync(file, JSON.stringify(authored));
  writeFileSync(resolve(project, 'shard.config.ts'), `export default ${JSON.stringify(emptyShardfile({ slug: folder, name: 'Level', author: 'Test', revision: 1, seed: 3 }))};`);
  return { project, output: resolve(root, 'output'), root, bytes, url,
    manifest: { folder, file, imageRoots: [{ prefix: `/src/shards/${folder}/`, directory: project }] } };
}
it('packs complete level metadata while charging a reused map image once', async () => {
  const { project, output, manifest, bytes } = fixture(), hash = hashImmutableBytes(bytes), cost = assetCost('image', bytes);
  const map = { bytes, tilesHash: 'a'.repeat(64) };
  const loaded = await readProjectAssets(project, map, manifest);
  expect(loaded.shard.files).toHaveLength(1); expect(loaded.shard.library).toEqual([hash]); expect(loaded.assets.size).toBe(1);
  expect(loaded.shard.budgets.library).toMatchObject({ compressed: bytes.length, resident: cost.decoded + cost.gpu });
  expect(loaded.shard.map?.image).toBe(hash);
  expect(loaded.shard.manifest?.card.thumb).toBe(`/shardfiles/level-test/blobs/image/${hash}.png`);
  expect(loaded.shard.manifest?.minimap.image).toBe(loaded.shard.manifest?.card.thumb);
  await buildProject(project, output, { client: null, manifest, map });
  const checked = validateOutputProduct(output), level = checked.index.sections.find(row => row.name === 'ui/level');
  expect(level).toBeDefined(); expect(checked.index.files).toHaveLength(1);
  expect(checked.shard.manifest).toEqual(loaded.shard.manifest);
  expect(Uint8Array.from(readFileSync(resolve(output, checked.index.files[0]?.path ?? 'missing')))).toEqual(bytes);
});
it('the repository CLI supplies manifest roots and emits a source-free level section', async () => {
  const { project, output } = fixture();
  await runWildshard(['build', project, output, '--product-only', '--no-placeholders']);
  const checked = validateOutputProduct(output);
  expect(checked.index.sections.some(row => row.name === 'ui/level')).toBe(true);
  expect(checked.shard.manifest?.card.thumb).toMatch(/^\/shardfiles\/level-test\/blobs\/image\/[a-f0-9]{64}\.png$/u);
  expect(existsSync(resolve(output, 'manifest.json'))).toBe(false);
});
it('preserves an existing logical name and conservative image costs', async () => {
  const { project, manifest, bytes } = fixture(), cost = assetCost('image', bytes);
  const blob = nameBlob('authored/title.png', 'image', bytes, { decoded: cost.decoded + 100, gpu: cost.gpu + 200 });
  const source = emptyShardfile({ slug: 'level-test', name: 'Level', author: 'Test', revision: 1, seed: 3 });
  const { name: _name, path: _path, ...file } = blob.file;
  source.files.push({ ...file, kind: 'image' }); source.library.push(file.hash);
  source.budgets.library = { compressed: bytes.length, resident: file.decoded + file.gpu };
  writeFileSync(resolve(project, 'shard.config.ts'), `export default ${JSON.stringify(source)};
export const output = {namedFiles:[${JSON.stringify(blob.file)}],assets:new Map([[${JSON.stringify(file.hash)},new Uint8Array(${JSON.stringify([...bytes])})]])};`);
  const loaded = await readProjectAssets(project, undefined, manifest);
  expect(loaded.shard.files).toEqual(source.files); expect(loaded.shard.budgets).toEqual(source.budgets);
  expect(loaded.output.namedFiles).toEqual([blob.file]); expect(loaded.assets.size).toBe(1);
});
it('refuses missing, ambiguous and escaping image roots without a path fallback', async () => {
  const { project, manifest, root, url } = fixture();
  await expect(readManifestSource({ ...manifest, imageRoots: [] })).rejects.toThrow('exactly one');
  await expect(readManifestSource({ ...manifest, imageRoots: [...manifest.imageRoots, ...manifest.imageRoots] })).rejects.toThrow('exactly one');
  rmSync(resolve(project, 'shared.png'));
  await expect(readManifestSource(manifest)).rejects.toThrow();
  writeFileSync(resolve(root, 'outside.png'), new Uint8Array([1, 2]));
  symlinkSync(resolve(root, 'outside.png'), resolve(project, 'shared.png'));
  await expect(readManifestSource(manifest)).rejects.toThrow('escapes');
  const input: unknown = JSON.parse(readFileSync(manifest.file, 'utf8'));
  const parsed = parseManifestMetadata(input); parsed.card.thumb = url.replace('shared.png', '../outside.png');
  writeFileSync(manifest.file, JSON.stringify(parsed));
  await expect(readManifestSource(manifest)).rejects.toThrow('escapes');
});
it('does not discover undeclared source files in the SDK or overwrite conflicting level metadata', async () => {
  const { project, output, manifest } = fixture();
  expect((await readProjectAssets(project)).shard.manifest).toBeUndefined();
  const configured = emptyShardfile({ slug: 'level-test', name: 'Level', author: 'Test', revision: 1, seed: 3 });
  const input: unknown = JSON.parse(readFileSync(manifest.file, 'utf8'));
  configured.manifest = { ...parseManifestMetadata(input), name: 'A different level' };
  writeFileSync(resolve(project, 'shard.config.ts'), `export default ${JSON.stringify(configured)};`);
  await expect(buildProject(project, output, { client: null, manifest })).rejects.toThrow('differs from configured');
});
it('packs explicitly declared config metadata when no manifest file exists', async () => {
  const { project, output, manifest } = fixture(), { file, ...roots } = manifest;
  expect((await readProjectAssets(project, undefined, roots)).shard.manifest).toBeUndefined();
  const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const source = emptyShardfile({ slug: 'level-test', name: 'Level', author: 'Test', revision: 1, seed: 3 });
  source.manifest = parseManifestMetadata(input);
  writeFileSync(resolve(project, 'shard.config.ts'), `export default ${JSON.stringify(source)};`);
  rmSync(file);
  await runWildshard(['build', project, output, '--product-only', '--no-placeholders']);
  expect(validateOutputProduct(output).shard.manifest?.card.thumb).toMatch(/^\/shardfiles\/level-test\/blobs\/image\//u);
});
it.each(['far-reach', 'sunscar-dunes', 'pine-hollow', 'driftwood-isle'])('reads all declared %s level images through explicit source/public roots', async folder => {
  const project = resolve('src/shards', folder);
  const result = await readManifestSource({ folder, file: resolve(project, 'manifest.json'), imageRoots: [
    { prefix: `/src/shards/${folder}/`, directory: project }, { prefix: '/assets/', directory: resolve('public/assets') },
  ] });
  expect(result.blobs.length).toBeGreaterThan(0);
  for (const { url } of manifestImages(result.manifest)) expect(url.startsWith('data:image/') || url.startsWith(`/shardfiles/${folder}/blobs/image/`)).toBe(true);
});


it('packs the generated Template map with all declared level images through the real source loader', async () => {
  const project = resolve('src/shards/_template');
  const loaded = await readProjectAssets(project, undefined, { folder: '_template', file: resolve(project, 'manifest.json'), imageRoots: [
    { prefix: '/src/shards/_template/', directory: project }, { prefix: '/assets/', directory: resolve('public/assets') },
  ] });
  const manifest = loaded.shard.manifest; if (manifest === undefined) throw new Error('Missing Template level metadata');
  expect(loaded.output.namedFiles?.length).toBeGreaterThan(0);
  for (const { url } of manifestImages(manifest)) expect(url.startsWith('data:image/') || url.startsWith('/shardfiles/_template/blobs/image/')).toBe(true);
  const map = loaded.shard.map; if (map === undefined) throw new Error('Missing generated Template map');
  expect(loaded.assets.get(map.image)).toBeInstanceOf(Uint8Array);
});

it('the normal project adapter declares Explorer-only art late with full image costs', async () => {
  const {project, manifest, bytes} = fixture(), image = Uint8Array.from(readFileSync('test/fixtures/world-source/image.webp'));
  const authored = parseManifestMetadata(JSON.parse(readFileSync(manifest.file, 'utf8')));
  authored.explore.art.world = '/src/shards/level-test/explorer.webp';
  writeFileSync(resolve(project, 'explorer.webp'), image); writeFileSync(manifest.file, JSON.stringify(authored));
  const loaded = await readProjectAssets(project, undefined, manifest), hash = hashImmutableBytes(image);
  expect(loaded.shard.late).toEqual([{hash}]);
  expect(loaded.shard.library).toEqual(expect.arrayContaining([hash,hashImmutableBytes(bytes)]));
  expect(loaded.assets.get(hash)).toEqual(image);
  expect(loaded.shard.files.find(row => row.hash === hash)).toMatchObject({compressed:image.length,...assetCost('image',image)});
});
