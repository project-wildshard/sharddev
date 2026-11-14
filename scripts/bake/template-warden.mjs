#!/usr/bin/env node
// SHARD-SOURCE M4.10: bake the Template's Barrow Warden skin (src/shards/_template/generators/warden.ts) into its
// content-addressed assets (the GLB and its { row, binding } skin file) and its data/skins.json entry. The generator is
// TypeScript, so it is bundled first, as scripts/bake/skins.mjs bundles the skin fixture; generators/warden.test.ts
// re-bakes and refuses committed bytes that differ.
import { build } from 'vite';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dirname, '../..'), project = resolve(repo, 'src/shards/_template'), scratch = resolve(repo, `tmp/bake-warden-${process.pid}`);
try {
  mkdirSync(scratch, { recursive: true }); symlinkSync(join(repo, 'node_modules'), join(scratch, 'node_modules'));
  await build({ configFile: false, logLevel: 'silent', build: { target: 'esnext', outDir: join(scratch, 'generator'), emptyOutDir: true, lib: { entry: join(project, 'generators/warden.ts'), formats: ['es'], fileName: 'warden' }, rolldownOptions: { platform: 'node', external: [/^node:/u, 'vite', '@gltf-transform/core', '@gltf-transform/extensions', 'meshoptimizer'] } } });
  const { bakeWardenSkin } = await import(pathToFileURL(join(scratch, 'generator/warden.js')).href);
  const { glb, json, entry } = await bakeWardenSkin();
  writeFileSync(resolve(project, 'assets', entry.glb), glb); writeFileSync(resolve(project, 'assets', entry.skin), json);
  const path = resolve(project, 'data/skins.json'), skins = JSON.parse(readFileSync(path, 'utf8')), at = skins.findIndex((row) => row.species === entry.species);
  const previous = at === -1 ? undefined : skins[at];
  if (at === -1) skins.push(entry); else skins[at] = entry;
  writeFileSync(path, `${JSON.stringify(skins, null, 2)}\n`);
  for (const hash of [previous?.glb, previous?.skin]) if (hash !== undefined && hash !== entry.glb && hash !== entry.skin) rmSync(resolve(project, 'assets', hash), { force: true });
  const glbRow = entry.files[1];
  console.info(`template warden: skin ${entry.skin.slice(0, 8)}, glb ${entry.glb.slice(0, 8)} (${glb.length} bytes, ${glbRow.triangles} triangles, ${glbRow.draws} draws)`);
} finally { rmSync(scratch, { recursive: true, force: true }); }
