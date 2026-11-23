// SHARD-COMPAT SI4: `@wildshard/sdk/headless/<path>` is `@wildshard/engine/<path>` for every harness path a shard's tests, scripts
// and ci read (the census's SI5 rows), and `@wildshard/sdk/headless` names the engine the shard pins.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'vitest';

const SDK = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(SDK, 'package.json'), 'utf8')) as { exports: Record<string, string>; peerDependencies: Record<string, string>; peerDependenciesMeta: Record<string, { optional?: boolean }> };
const rows = Object.entries(pkg.exports).filter(([key]) => key.startsWith('./headless/'));
/** The Node simulation hooks and the bake loaders register on import: their files are checked, not run here. */
const SIDE_EFFECTS = new Set(['scripts/sim-node-loader.mjs', 'scripts/format-hook.mjs', 'scripts/bake-loader.mjs']);
/** SI7: the engine's ambient declarations for a shard tsconfig's `types` list; a `.d.ts`, so it is checked, not imported. */
const TYPES_ONLY = new Set(['game/types']);
const engineOf = (key: string): string => `@wildshard/engine/${key.slice('./headless/'.length)}`;

test('the engine is a peer of the sdk, so each re-export resolves the shard\'s own engine', () => {
  expect(pkg.peerDependencies['@wildshard/engine']).toBe('*');
  expect(pkg.peerDependenciesMeta['@wildshard/engine']).toEqual({ optional: true });
});

test('every harness path the shards read has its sdk row, and each file re-exports exactly that engine path', () => {
  expect(rows.map(([key]) => key.slice('./headless/'.length)).sort()).toEqual([
    'app/resources', 'app/scope', 'core/tier', 'game/shardCook', 'game/shardfile/outputDescriptor', 'game/shardfile/serverPack', 'game/systems/viewmodel/armRig', 'game/types',
    'host/headless', 'host/headlessFolder', 'host/headlessJourney', 'host/headlessRuntime', 'host/headlessSections', 'host/headlessTape',
    'host/tickProtocol', 'physics/rapier', 'scripts/authored-manifest.mjs', 'scripts/bake-input-hashes.mjs', 'scripts/bake-loader.mjs',
    'scripts/bake-output.mjs', 'scripts/built-folder.mjs', 'scripts/debug-settings.mjs', 'scripts/format-hook.mjs',
    'scripts/frame-floor-grid.mjs', 'scripts/frame-floor-navigation.mjs', 'scripts/frame-floor-settings.mjs',
    'scripts/native-recorder-cache.mjs', 'scripts/program-discovery.mjs', 'scripts/proof-state.mjs', 'scripts/shard-outputs.mjs', 'scripts/shardfile-inputs.mjs',
    'scripts/sim-node-loader.mjs', 'scripts/tile-bake-report.mjs', 'sim/snapshot', 'test/FakeGame', 'world/Heightfield',
    'world/terrainHeight',
  ]);
  const require = createRequire(resolve(SDK, 'package.json'));
  for (const [key, file] of rows) {
    const text = readFileSync(resolve(SDK, file), 'utf8');
    const from = [...text.matchAll(/from '([^']+)'/gu)].map(match => match[1]);
    expect(new Set(from), key).toEqual(new Set([engineOf(key)]));
    expect(() => require.resolve(engineOf(key)), key).not.toThrow();
  }
});

test('each module the sdk re-exports has the engine module\'s own exports', { timeout: 120_000 }, async () => {
  for (const [key] of rows) {
    if (SIDE_EFFECTS.has(key.slice('./headless/'.length)) || TYPES_ONLY.has(key.slice('./headless/'.length))) continue;
    const [ours, theirs] = await Promise.all([import(`@wildshard/sdk/${key.slice(2)}`), import(engineOf(key))]) as [Record<string, unknown>, Record<string, unknown>];
    expect(Object.keys(ours).sort(), key).toEqual(Object.keys(theirs).sort());
    // Vitest may load a plain `.mjs` engine script once per specifier, so the check is each binding's kind, not its identity.
    for (const name of Object.keys(theirs)) expect(typeof ours[name], `${key} ${name}`).toBe(typeof theirs[name]);
  }
});

test('`@wildshard/sdk/headless` names the engine the shard pins: its folder, version and a require from it', async () => {
  const { engineRoot, enginePin, enginePackagePath, enginePackageUrl, engineRequire } = await import('@wildshard/sdk/headless');
  const own = createRequire(resolve(SDK, 'package.json')).resolve('@wildshard/engine/package.json');
  expect(enginePackagePath).toBe(own);
  expect(engineRoot).toBe(dirname(own));
  expect(new URL(enginePackageUrl).pathname).toBe(own);
  expect(enginePin).toBe((JSON.parse(readFileSync(own, 'utf8')) as { version: string }).version);
  expect(engineRequire.resolve('@dimforge/rapier3d-simd/package.json')).toContain('rapier3d-simd');
});

// SI6: the engine internals a shard's tests read sit behind `@wildshard/sdk/internal/engine/<path>`, each with its removal note (SI8).
const internal = Object.entries(pkg.exports).filter(([key]) => key.startsWith('./internal/engine/'));
test('every internal engine row re-exports exactly its engine path, resolves, and names SI8 as its removal', () => {
  expect(internal.length).toBeGreaterThan(200);
  const require = createRequire(resolve(SDK, 'package.json'));
  for (const [key, file] of internal) {
    const engine = `@wildshard/engine/${key.slice('./internal/engine/'.length)}`, text = readFileSync(resolve(SDK, file), 'utf8');
    expect(new Set([...text.matchAll(/from '([^']+)'/gu)].map(match => match[1])), key).toEqual(new Set([engine]));
    expect(text, key).toContain('Removal: SI8');
    expect(() => require.resolve(engine), key).not.toThrow();
  }
});
