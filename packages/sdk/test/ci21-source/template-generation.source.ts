// oxlint-disable-next-line import/no-nodejs-modules -- Compare the retained terrain metadata and own only a scratch cache.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Bound the cache to the fixture.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Report measured generator timings independently of engine logging.
import process from 'node:process';
// oxlint-disable-next-line import/no-nodejs-modules -- Execute the same one-chunk author module as the CLI.
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { build, parseSync } from 'vite';
import { generatorImportViolation } from '../../lint/sdk-plugin.mjs';
import { generate } from '../../src/shards/_template/shard.config';
import { templateTerrain } from '../../src/shards/_template/generators/terrain';
import { TEMPLATE_BEHAVIOUR, TEMPLATE_BOSS } from '../fixtures/templateSource';
import { templateBehaviour } from '../../src/shards/_template/generators/behaviour';
import { templateProduct } from '../../src/shards/_template/generators/product';
import { templatePropRows } from '../../src/shards/_template/generators/props';
import { createProjectGeneration, isProjectGenerator } from '../../src/sharddev/projectGeneration';
import { hashImmutableBytes } from '../../src/sharddev/immutable';
import { assertConfigBoundary } from '../../src/sharddev/configBoundary';
import { parseShardfile } from '@wildshard/format/shardSchema';

test('template direct generation and a cache hit retain every original world row and asset byte', async () => {
  mkdirSync('tmp', { recursive: true }); const cache = mkdtempSync(resolve('tmp', 'template-generation-'));
  try {
    const before = performance.now(), { assets: original, ...rows } = templateTerrain(), props = templatePropRows(), produced = performance.now() - before;
    const assets = new Map<string, Uint8Array>(), root = resolve('src/shards/_template');
    const coldAt = performance.now(), cold = await generate(createProjectGeneration(root, 'c'.repeat(64), assets, cache)), coldMs = performance.now() - coldAt;
    const hitAt = performance.now(), hit = await generate(createProjectGeneration(root, 'c'.repeat(64), assets, cache)), hitMs = performance.now() - hitAt;
    // SHARD-SOURCE AP36a: the world is scene source now (generators/scene.ts), so its tiles, panels' files, look entries and
    // their budget are the scene back end's; every other row is still the bake's, byte for byte, and so are the colliders
    const bake = templateProduct(rows, props, TEMPLATE_BEHAVIOUR, TEMPLATE_BOSS), scene = cold.shard;
    const WORLD = new Set(['budgets', 'look', 'files', 'tiles', 'library', 'far', 'props']);
    for (const [key, value] of Object.entries(bake)) if (!WORLD.has(key)) expect(JSON.stringify((scene as Record<string, unknown>)[key]), key).toBe(JSON.stringify(value));
    expect(scene.props?.colliders).toEqual(bake.props?.colliders);
    const panels = (shard: typeof scene): string[] => (shard.props?.panels ?? []).map(panel => `${panel.id} ${String(panel.visible)}`).sort();
    expect(panels(scene)).toEqual(panels(bake));
    expect(scene.props?.models.map(model => model.id)).toEqual(bake.props?.models.map(model => model.id));
    for (const [id, entry] of Object.entries(bake.look.materials)) expect(scene.look.materials[id], id).toEqual(entry);
    expect(hit.shard).toEqual(cold.shard); expect(hit.output).toEqual(cold.output);
    if (hit.map === undefined || cold.map === undefined) throw new Error('Missing Template map');
    expect(Buffer.compare(hit.map.pixels, cold.map.pixels)).toBe(0);
    const boss = assets.get(TEMPLATE_BOSS.hash); if (boss === undefined) throw new Error('Missing generated boss');
    expect(boss.length).toBe(TEMPLATE_BOSS.compressed);
    expect(hashImmutableBytes(boss)).toBe(TEMPLATE_BOSS.hash);
    const scripts = new Set([TEMPLATE_BOSS.hash]);
    for (const row of Object.values(await templateBehaviour(createProjectGeneration(root, 'c'.repeat(64), assets, cache)))) {
      if (!assets.has(row.hash)) throw new Error('Missing actual compiled module'); scripts.add(row.hash);
    }
    // every asset is a script or a file the shard names, and each is the bytes of its hash
    const named = new Set(scene.files.map(file => file.hash));
    for (const [hash, bytes] of assets) {
      expect(scripts.has(hash) || named.has(hash), hash).toBe(true);
      expect(hashImmutableBytes(bytes), hash).toBe(hash);
    }
    void original;
    process.stdout.write(`${JSON.stringify({ templateWorldMs: produced, coldProgramMs: coldMs, cachedProgramMs: hitMs, files: assets.size })}\n`);
  } finally { rmSync(cache, { recursive: true, force: true }); }
});

test('the actual template build closure bundles and executes through the unchanged config boundary', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/shards/_template/shard.config.ts'), formats: ['es'], fileName: 'config' }, rolldownOptions: { external: [/^node:/u] } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing template bundle');
  const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('Missing template chunk');
  assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports]);
  const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  if (typeof loaded !== 'object' || loaded === null || !('generate' in loaded) || !isProjectGenerator(loaded.generate)) throw new Error('Missing template build function');
  const cache = mkdtempSync(resolve('tmp', 'template-bundle-')), assets = new Map<string, Uint8Array>();
  try {
    const generated = await loaded.generate(createProjectGeneration(resolve('src/shards/_template'), hashImmutableBytes(new TextEncoder().encode(chunk.code)), assets, cache));
    if (typeof generated !== 'object' || generated === null || !('shard' in generated)) throw new Error('Missing generated declaration');
    const source = parseShardfile(generated.shard);
    expect(source.identity.slug).toBe('template');
    expect(source.files.filter(file => assets.has(file.hash))).toHaveLength(assets.size - 1);
    expect(assets.size).toBeGreaterThan(0);
  } finally { rmSync(cache, { recursive: true, force: true }); }
});


test('Template boss and output sources use the unchanged SDK-only author import surface', () => {
  for (const file of ['boss.ts', 'productOutput.ts']) {
    const path = resolve('src/shards/_template/generators', file), parsed = parseSync(path, readFileSync(path, 'utf8'));
    expect(parsed.errors).toEqual([]);
    for (const node of parsed.program.body) if (node.type === 'ImportDeclaration') expect(generatorImportViolation(path, node.source.value), node.source.value).toBeNull();
  }
});
