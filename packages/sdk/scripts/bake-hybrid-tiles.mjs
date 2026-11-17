#!/usr/bin/env node
// SHARD-PLATFORM M3 (G227): compile a hybrid shard's code-built heightfield into its shardfile's 62.5 m terrain tiles.
// Trusted first-party bake: the generator (src/shards/<slug>/generators/tiles.ts) runs here only; its immutable wire files go
// to src/shards/<slug>/assets/<sha256> and the numeric rows to src/shards/<slug>/data/tiles.json, which shard.config.ts
// declares. test/shards/<slug>/tiles-bake.test.ts is the byte-exact stale gate (it re-runs the generator).
// Usage: node --import ./scripts/sim-node-loader.mjs scripts/bake-hybrid-tiles.mjs sunscar-dunes
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const GENERATORS = { 'sunscar-dunes': 'signalDunesTiles' };
const slug = process.argv[2] ?? '', name = GENERATORS[slug];
if (name === undefined) throw new Error(`bake-hybrid-tiles: no tile generator for "${slug}" (known: ${Object.keys(GENERATORS).join(', ')})`);
const root = resolve(import.meta.dirname, '..'), project = resolve(root, 'src/shards', slug);
const generator = await import(pathToFileURL(resolve(project, 'generators/tiles.ts')).href);
const baked = generator[name]();
const assets = resolve(project, 'assets');
mkdirSync(assets, { recursive: true });
// remove the hashes the previous bake declared and this one drops, so a rebake leaves no orphans; the folder also holds
// other bakes' library files (Signal's sand maps, data/sandMaps.json), which are not this bake's to remove
const keep = new Set(baked.assets.keys()), declared = resolve(project, 'data/tiles.json');
const previous = existsSync(declared) ? JSON.parse(readFileSync(declared, 'utf8')).files.map((file) => file.hash) : [];
for (const hash of previous) if (!keep.has(hash) && existsSync(resolve(assets, hash))) rmSync(resolve(assets, hash));
for (const [hash, bytes] of baked.assets) writeFileSync(resolve(assets, hash), bytes);
const { assets: _assets, ...metadata } = baked;
writeFileSync(resolve(project, 'data/tiles.json'), `${JSON.stringify(metadata)}\n`);
const bytes = [...baked.assets.values()].reduce((sum, b) => sum + b.length, 0);
console.info(`${slug} tiles: ${baked.tiles.length} tiles, ${baked.assets.size} files, ${bytes} bytes`);
