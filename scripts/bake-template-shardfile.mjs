#!/usr/bin/env node
// Trusted first-party source bake. Only numeric metadata and immutable bytes enter shard.config.ts.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { compileScript } from './compile-script.mjs';
import { executeBundle } from '../src/sharddev/executeBundle.ts';

const root = resolve(import.meta.dirname, '..'), project = resolve(root, 'src/shards/_template');
const result = await build({ plugins: [{ name: 'external-build-tool', enforce: 'pre', resolveId(id) { return id === 'vite' ? { id: import.meta.resolve('vite'), external: true } : null; } }], configFile: false, publicDir: false, logLevel: 'silent', build: { write: false, minify: false,
  lib: { entry: resolve(project, 'generators/terrain.ts'), formats: ['es'], fileName: 'terrain' }, rolldownOptions: { platform: 'node', external: [/^node:/u] } } });
const output = Array.isArray(result) ? result.at(0) : result;
if (output === undefined) throw new Error('Missing terrain generator output');
const chunks = output.output.filter((entry) => entry.type === 'chunk');
const chunk = chunks.at(0);
if (chunks.length !== 1 || chunk === undefined) throw new Error(`Terrain generator must bundle once: ${chunks.map((entry) => entry.fileName).join(',')}`);
const generator = await executeBundle(chunk.code, project);
if (typeof generator !== 'object' || generator === null || !('templateTerrain' in generator) || typeof generator.templateTerrain !== 'function')
  throw new Error('Missing terrain generator export');
const terrain = generator.templateTerrain();
mkdirSync(resolve(project, 'assets'), { recursive: true });
for (const [hash, bytes] of terrain.assets) writeFileSync(resolve(project, 'assets', hash), bytes);
const { assets: _assets, ...metadata } = terrain;
writeFileSync(resolve(project, 'data/terrain.json'), `${JSON.stringify(metadata, null, 2)}\n`);
const bytes = await compileScript(readFileSync(resolve(project, 'behaviour/door.as'), 'utf8'), { maximumPages: 2 });
const hash = createHash('sha256').update(bytes).digest('hex');
writeFileSync(resolve(project, 'assets', hash), bytes);
writeFileSync(resolve(project, 'behaviour/door.json'), `${JSON.stringify({ hash, compressed: bytes.length }, null, 2)}\n`);
const props = JSON.parse(readFileSync(resolve(project, 'data/props.json'), 'utf8'));
for (const file of props.files) copyFileSync(resolve(root, 'public/assets/baked/template-props', file.hash), resolve(project, 'assets', file.hash));
console.info(`template bake: ${terrain.tiles.length} tiles, ${terrain.assets.size} terrain files, door ${bytes.length} bytes`);
