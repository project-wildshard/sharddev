// TEMPLATE-E2E TR-11 (J434): the retired Template's generation cases, on Mossgate, the template that replaced it (the
// case titles are the originals'). Mossgate is scene source with no map program, so the map pixel check went with the
// Template; the Template's pinned gameplay digest went too (it bounded only the retired bake), and its boss module now
// compiles at build, so the generation case checks the decision's section bytes. Every case still runs the real
// generator, its cache hit, the config-boundary bundle and the SDK-only import surface.
// oxlint-disable-next-line import/no-nodejs-modules -- Own only a scratch cache.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Bound the cache to the fixture.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Report measured generator timings independently of engine logging.
import process from 'node:process';
// oxlint-disable-next-line import/no-nodejs-modules -- Execute the same one-chunk author module as the CLI.
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { build, parseSync } from 'vite';
import { generatorImportViolation } from '../../lint/sdk-plugin.mjs';
import { createProjectGeneration, isProjectGenerator } from '../../src/sharddev/projectGeneration';
import { hashImmutableBytes } from '../../src/sharddev/immutable';
import { assertConfigBoundary } from '../../src/sharddev/configBoundary';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';

const ROOT = resolve('src/shards/mossgate');
// Loaded by path, not imported: this compiler's strict author rules are the SDK's, and Mossgate's generators are shard
// source under the author lint (an import here would put them in the CI21 compile).
const loadedConfig: unknown = await import(resolve(ROOT, 'shard.config.ts'));
if (typeof loadedConfig !== 'object' || loadedConfig === null || !('generate' in loadedConfig) || !isProjectGenerator(loadedConfig.generate)) throw new Error('Missing Mossgate generator');
const mossgateGenerate = loadedConfig.generate;
interface Generated { shard: Shardfile; output?: { platform?: { sections?: readonly { name: string; path: string; hash: string; bytes: number }[]; files?: ReadonlyMap<string, Uint8Array> } } }
const generate = async (context: Parameters<typeof mossgateGenerate>[0]): Promise<Generated> => await mossgateGenerate(context) as Generated;

test('template direct generation and a cache hit retain every original world row and asset byte', async () => {
  mkdirSync('tmp', { recursive: true }); const cache = mkdtempSync(resolve('tmp', 'mossgate-generation-'));
  try {
    const assets = new Map<string, Uint8Array>();
    const coldAt = performance.now(), cold = await generate(createProjectGeneration(ROOT, 'c'.repeat(64), assets, cache)), coldMs = performance.now() - coldAt;
    const hitAt = performance.now(), hit = await generate(createProjectGeneration(ROOT, 'c'.repeat(64), assets, cache)), hitMs = performance.now() - hitAt;
    expect(hit.shard).toEqual(cold.shard); expect(hit.output).toEqual(cold.output);
    // the Warden's decision rides the output's sim/scripts section (its module compiles from behaviour/warden.as at build),
    // and the section is the bytes of its hash
    const section = cold.output?.platform?.sections?.find(row => row.name === 'sim/scripts');
    const json = section === undefined ? undefined : cold.output?.platform?.files?.get(section.path);
    if (section === undefined || json === undefined) throw new Error('Missing Mossgate decision section');
    expect(hashImmutableBytes(json)).toBe(section.hash); expect(json.length).toBe(section.bytes);
    const scripts: unknown = JSON.parse(new TextDecoder().decode(json));
    if (!Array.isArray(scripts)) throw new Error('Decision section is not a list');
    expect(scripts.map(row => [(row as { id?: unknown }).id, (row as { source?: unknown }).source])).toContainEqual(['mossgate.warden.decision', 'behaviour/warden.as']);
    // every asset is a file the shard names, and each is the bytes of its hash
    const named = new Set(cold.shard.files.map(file => file.hash));
    expect(assets.size).toBeGreaterThan(0);
    for (const [hash, bytes] of assets) {
      expect(named.has(hash), hash).toBe(true);
      expect(hashImmutableBytes(bytes), hash).toBe(hash);
    }
    process.stdout.write(`${JSON.stringify({ coldProgramMs: coldMs, cachedProgramMs: hitMs, files: assets.size })}\n`);
  } finally { rmSync(cache, { recursive: true, force: true }); }
}, 60_000);

test('the actual template build closure bundles and executes through the unchanged config boundary', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve(ROOT, 'shard.config.ts'), formats: ['es'], fileName: 'config' }, rolldownOptions: { external: [/^node:/u] } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing Mossgate bundle');
  const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('Missing Mossgate chunk');
  assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports]);
  const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  if (typeof loaded !== 'object' || loaded === null || !('generate' in loaded) || !isProjectGenerator(loaded.generate)) throw new Error('Missing Mossgate build function');
  const cache = mkdtempSync(resolve('tmp', 'mossgate-bundle-')), assets = new Map<string, Uint8Array>();
  try {
    const generated = await loaded.generate(createProjectGeneration(ROOT, hashImmutableBytes(new TextEncoder().encode(chunk.code)), assets, cache));
    if (typeof generated !== 'object' || generated === null || !('shard' in generated)) throw new Error('Missing generated declaration');
    const source = parseShardfile(generated.shard);
    expect(source.identity.slug).toBe('mossgate');
    expect(source.files.filter(file => assets.has(file.hash))).toHaveLength(assets.size);
    expect(assets.size).toBeGreaterThan(0);
  } finally { rmSync(cache, { recursive: true, force: true }); }
}, 60_000);

test('Template boss and output sources use the unchanged SDK-only author import surface', () => {
  const sources = readdirSync(resolve(ROOT, 'generators')).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  expect(sources).toContain('fights.ts');
  for (const file of [...sources.map(name => resolve(ROOT, 'generators', name)), resolve(ROOT, 'shard.config.ts')]) {
    const parsed = parseSync(file, readFileSync(file, 'utf8'));
    expect(parsed.errors).toEqual([]);
    for (const node of parsed.program.body) if (node.type === 'ImportDeclaration') expect(generatorImportViolation(file, node.source.value), node.source.value).toBeNull();
  }
});
