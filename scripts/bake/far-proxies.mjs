#!/usr/bin/env node
// SHARD-PLATFORM SF23: deterministically regenerate every grid shard's far proxy (public/assets/baked/<slug>/far.glb +
// far.json, and G539's camera-facing impostor far-impostor.png) from its height grid and its own far look; prints each
// proxy's resident MB, wire KB and triangles.
// G348: the shards are the ones that declare a far row in their own `data/placeholder.json` (look, and a grid or model
// parts when their land is not a height field); the baker is the SDK's (`@wildshard/sharddev/bake/placeholders`), the same
// one `wildshard build` runs for any shardfile. No shard table lives here.
// SF49: a shard whose land is models (floating islands) merges them in decimated; this runner hands it the SDK's model
// tools (`placeholderModelTools`: a GLB reader that samples the base colour per vertex, and meshoptimizer's simplifier),
// the same ones the near bake builds that land with (G380).
import { build } from 'vite';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { placeholderGridBytes, placeholderShards } from './placeholderShards.mjs';

const repo = resolve(import.meta.dirname, '../..'), scratch = mkdtempSync(join(tmpdir(), 'far-proxies-'));
// sharp comes with the glTF CLI (resolved through it, as scripts/nalati-models-color.mjs does)
const req = createRequire(realpathSync(join(repo, 'node_modules/@gltf-transform/cli/package.json')));
const shards = (await placeholderShards(repo)).filter(shard => shard.source.far !== undefined);
// one bundle: the SDK baker and every declared module, imported by the shard's own data (generated, never committed)
const modules = [...new Set(shards.flatMap(({ dir, source }) => ['look', 'grid', 'parts'].flatMap(key => source.far[key] === undefined ? [] : [join(dir, source.far[key].module)])))];
const entry = [`export * as sdk from ${JSON.stringify(join(repo, 'src/sharddev/bake/placeholders.ts'))};`, `export const modules = { ${modules.map((path) => `${JSON.stringify(path)}: () => import(${JSON.stringify(path)})`).join(', ')} };`].join('\n');
try {
  symlinkSync(join(repo, 'node_modules'), join(scratch, 'node_modules'));
  writeFileSync(join(scratch, 'entry.ts'), entry);
  // sharp (the bundle reaches it through the SDK's asset tools) stays outside the bundle as the runner's own copy: pnpm
  // does not hoist it to the repo root, so an inlined copy cannot find its platform binary, and one libvips per process
  const sharpUrl = pathToFileURL(req.resolve('sharp')).href;
  await build({ plugins: [{ name: 'external-sharp', enforce: 'pre', resolveId: (id) => (id === 'sharp' ? { id: sharpUrl, external: true } : null) }], configFile: false, logLevel: 'silent', build: { target: 'esnext', outDir: join(scratch, 'generator'), emptyOutDir: true, lib: { entry: join(scratch, 'entry.ts'), formats: ['es'], fileName: 'build' }, rolldownOptions: { platform: 'node', external: [/^node:/u, 'vite'] } } });
  const { sdk, modules: load } = await import(pathToFileURL(join(scratch, 'generator/build.js')).href), tools = await sdk.placeholderModelTools(repo);
  const exported = async (dir, ref) => { const value = (await load[join(dir, ref.module)]())[ref.export]; if (value === undefined) throw new Error(`${dir}: ${ref.module} has no export ${ref.export}`); return value; };
  for (const { slug, dir, source: { far: declared } } of shards) {
    const look = await exported(dir, declared.look), parts = declared.parts === undefined ? [] : await (await exported(dir, declared.parts))(tools);
    const ground = declared.grid === undefined ? placeholderGridBytes(repo, dir, slug) : null;
    const grid = ground === null ? (await exported(dir, declared.grid))() : ground.kind === 'baked' ? sdk.bakedTerrainGrid(ground.bytes) : sdk.colliderGrid(ground.bytes);
    const { manifest, bytes, impostor } = await sdk.bakeFarPlaceholder(grid, look, parts), out = join(repo, 'public/assets/baked', slug);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'far.glb'), bytes); writeFileSync(join(out, 'far-impostor.png'), impostor); writeFileSync(join(out, 'far.json'), sdk.placeholderJson(manifest));
    const { far } = manifest;
    console.log(`${slug.padEnd(18)} resident ${((far.decoded + far.gpu) / 1e6).toFixed(3)} MB  wire ${(far.compressed / 1e3).toFixed(0)} KB  ${far.triangles} tris  ${far.draws} draw`);
  }
} finally { rmSync(scratch, { recursive: true, force: true }); }
