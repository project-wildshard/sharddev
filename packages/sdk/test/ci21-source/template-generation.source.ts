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
import { templateBehaviour } from '../../src/shards/_template/generators/behaviour';
import { createProjectGeneration, isProjectGenerator } from '../../src/sharddev/projectGeneration';
import { hashImmutableBytes } from '../../src/sharddev/immutable';
import { assertConfigBoundary } from '../../src/sharddev/configBoundary';
import { parseShardfile } from '@wildshard/format/shardSchema';

/**
 * SHARD-SOURCE AP36c: the Template's gameplay, pinned: every section but the world's (budgets, look, files, tiles, library,
 * far, props), plus the authored collider rows and the panels' and models' ids. The bake it was once compared to is gone;
 * this is the AP36b build's gameplay with derived idle bindings and the OF3c2 factory-fur skin for the boar.
 */
const TEMPLATE_GAMEPLAY = '67e9aebd493b7f6d70aaeab604244381c5510b3579d03d2bdeba488cc31e4b1e';
/** The scene build's map, every RGBA byte (the ground-map test pinned the bake's before AP36c). */
const TEMPLATE_MAP = '4465db6cc11fdd95a997048d59adae04791c1665d80710c7949208deeda08eb8';
function gameplayDigest(shard: Awaited<ReturnType<typeof generate>>['shard']): string {
  const { budgets: _budgets, look: _look, files: _files, tiles: _tiles, library: _library, far: _far, props, ...gameplay } = shard;
  if (props === null) throw new Error('Missing Template props');
  const panels = props.panels.map(panel => `${panel.id} ${String(panel.visible)}`).sort(), models = props.models.map(model => model.id);
  return hashImmutableBytes(new TextEncoder().encode(JSON.stringify({ gameplay, colliders: props.colliders, panels, models })));
}

test('template direct generation and a cache hit retain every original world row and asset byte', async () => {
  mkdirSync('tmp', { recursive: true }); const cache = mkdtempSync(resolve('tmp', 'template-generation-'));
  try {
    const assets = new Map<string, Uint8Array>(), root = resolve('src/shards/_template');
    const coldAt = performance.now(), cold = await generate(createProjectGeneration(root, 'c'.repeat(64), assets, cache)), coldMs = performance.now() - coldAt;
    const hitAt = performance.now(), hit = await generate(createProjectGeneration(root, 'c'.repeat(64), assets, cache)), hitMs = performance.now() - hitAt;
    const scene = cold.shard;
    expect(gameplayDigest(scene)).toBe(TEMPLATE_GAMEPLAY);
    expect(hit.shard).toEqual(cold.shard); expect(hit.output).toEqual(cold.output);
    if (hit.map === undefined || cold.map === undefined) throw new Error('Missing Template map');
    expect(Buffer.compare(hit.map.pixels, cold.map.pixels)).toBe(0);
    expect(hashImmutableBytes(cold.map.pixels)).toBe(TEMPLATE_MAP);
    // the boss decision module the output names is in the store, the bytes of its hash
    const bossHash = /^assets\/([a-f0-9]{64})$/u.exec(cold.output?.blobs?.[0]?.source ?? '')?.[1] ?? '';
    const boss = assets.get(bossHash); if (boss === undefined) throw new Error('Missing generated boss');
    expect(hashImmutableBytes(boss)).toBe(bossHash);
    const scripts = new Set([bossHash]);
    for (const row of Object.values(await templateBehaviour(createProjectGeneration(root, 'c'.repeat(64), assets, cache)))) {
      if (!assets.has(row.hash)) throw new Error('Missing actual compiled module'); scripts.add(row.hash);
    }
    // every asset is a script or a file the shard names, and each is the bytes of its hash
    const named = new Set(scene.files.map(file => file.hash));
    for (const [hash, bytes] of assets) {
      expect(scripts.has(hash) || named.has(hash), hash).toBe(true);
      expect(hashImmutableBytes(bytes), hash).toBe(hash);
    }
    process.stdout.write(`${JSON.stringify({ coldProgramMs: coldMs, cachedProgramMs: hitMs, files: assets.size })}\n`);
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
