import { MaterialsSchema } from '@wildshard/format/materials';
import { parse } from 'valibot';
import { runtimeBoundWorldFiles, withoutRuntimeRows } from '../src/shared/game/plugin/runtimeRows';
import { DRIFTWOOD_LOOT as LOOT } from '../src/shards/driftwood-isle/generators/loot';
import { parseRows } from '@wildshard/format/rows';
import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { ShardfileClient } from '../src/client/game/shardfile/client';
import { ClientAssets } from '../src/client/game/shardfile/clientAssets';
import NINE from './fixtures/nine-product-inputs';
import NALATI from './fixtures/nalati-product-source';
import { FIXTURE_RUNTIME_COST } from './fixtures/clientPlanRuntime';

const boundA = 'a'.repeat(64), boundB = 'b'.repeat(64), boundC = 'c'.repeat(64), upperRef = 'A'.repeat(64);
const boundRefs = [boundA, boundB, boundC, upperRef, 'named-ref', ''];
test.each([
  { name: 'no shared names', text: 'unshared', kept: [boundA, boundB, boundC, upperRef, 'named-ref'] },
  { name: 'exact hash', text: boundA, kept: [boundB, boundC, upperRef, 'named-ref'] },
  { name: 'hash embedded in a longer hexadecimal run', text: `b${boundA}c`, kept: [boundB, boundC, upperRef, 'named-ref'] },
  { name: 'overlapping hashes in one run', text: 'a'.repeat(129), kept: [boundB, boundC, upperRef, 'named-ref'] },
  { name: 'separate shared hashes', text: `${boundA}/${boundC}`, kept: [boundB, upperRef, 'named-ref'] },
  { name: 'quoted and escaped metadata', text: `"${boundB}\n"`, kept: [boundA, boundC, upperRef, 'named-ref'] },
  { name: 'caller-owned uppercase reference', text: upperRef, kept: [boundA, boundB, boundC, 'named-ref'] },
  { name: 'caller-owned logical reference', text: 'path/named-ref.bin', kept: [boundA, boundB, boundC, upperRef] },
])('bound file classification preserves substring ownership: $name', ({ text, kept }) => {
  const source = emptyShardfile({ slug: 'bound-inventory', name: 'Bound inventory', author: 'Test', revision: 1, seed: 1 });
  source.runtime = { kind: 'client-plan', cost: FIXTURE_RUNTIME_COST, binds: ['movers'] }; source.identity.name = text;
  // The helper also serves caller-owned descriptors: their legacy logical/empty references retain the old substring law.
  source.movers = boundRefs.map((module, index) => ({ id: `ref-${String(index)}`, entity: index + 1, module, kind: 'channel',
    at: { x: 0, y: 0, z: 0 }, euler: { x: 0, y: 0, z: 0 }, enabled: true, boxes: [], input: [] }));
  source.sim.scripts = [...boundRefs];
  const before = JSON.stringify(source);
  expect([...runtimeBoundWorldFiles(source)]).toEqual(kept);
  expect([...runtimeBoundWorldFiles(source)]).toEqual(kept);
  expect(JSON.stringify(source)).toBe(before);
});

test('bound file classification finds distinct overlapping hashes through the final window', () => {
  const source = emptyShardfile({ slug: 'bound-overlap', name: `${boundA}b`, author: 'Test', revision: 1, seed: 1 });
  source.runtime = { kind: 'client-plan', cost: FIXTURE_RUNTIME_COST, binds: ['movers'] };
  source.movers = [boundA, `${'a'.repeat(63)}b`, boundB].map((module, index) => ({ id: `ref-${String(index)}`, entity: index + 1, module, kind: 'channel',
    at: { x: 0, y: 0, z: 0 }, euler: { x: 0, y: 0, z: 0 }, enabled: true, boxes: [], input: [] }));
  expect([...runtimeBoundWorldFiles(source)]).toEqual([boundB]);
});

test('late scheduling keeps real shared readers and never becomes a reader itself', () => {
  const source = emptyShardfile({ slug: 'late-bound', name: boundA, author: 'Test', revision: 1, seed: 1 });
  source.runtime = { kind: 'client-plan', cost: FIXTURE_RUNTIME_COST, binds: ['movers'] };
  source.movers = [boundA, boundB].map((module, index) => ({ id: `ref-${String(index)}`, entity: index + 1, module, kind: 'channel',
    at: { x: 0, y: 0, z: 0 }, euler: { x: 0, y: 0, z: 0 }, enabled: true, boxes: [], input: [] }));
  source.sim.scripts = [boundA, boundB]; source.late = [{ hash: boundA }, { hash: boundB, at: [1, 2] }];
  const before = structuredClone(source);
  expect([...runtimeBoundWorldFiles(source)]).toEqual([boundB]);
  expect(source).toEqual(before);
});

test('late world inventory retains the original native tile and simulation ownership', () => {
  const source = { ...NINE, late: NINE.library.map(hash => ({ hash })) };
  expect([...runtimeBoundWorldFiles(source)]).toEqual([...runtimeBoundWorldFiles(NINE)]);
  expect(withoutRuntimeRows(source).tiles).toEqual(withoutRuntimeRows(NINE).tiles);
  const assets = new ClientAssets(source, new Map(), { base: 'https://example.test/native/', firstParty: true, offline: false,
    fetch: () => Promise.reject(new Error('No asset read expected')), hash: () => Promise.resolve('a'.repeat(64)) });
  let expected = 0;
  new ShardfileClient(source, assets, { instance: source.identity.slug, recipes: new Map(), items: new Map(), catalogue: [], voices: () => new Map(),
    icon: () => { throw new Error('No item read expected'); }, onSimulationExpected: () => { expected++; }, trustedRuntime: true, worldOwner: 'runtime', audioOwner: 'runtime' });
  expect(expected).toBe(0);
});

// The callback is the public simulation-handoff contract, not a private mode probe.
test('native blob inventory does not announce a data sim; declared behavior still does', () => {
  const source = emptyShardfile({ slug: 'inventory', name: 'Inventory', author: 'Test', revision: 1, seed: 1 });
  const hash = 'a'.repeat(64);
  source.files.push({ hash, kind: 'binary', compressed: 1, decoded: 1, gpu: 0, triangles: 0, draws: 0, critical: true, dependencies: [] });
  source.library.push(hash); source.critical.push(hash);
  const assets = new ClientAssets(source, new Map(), { base: 'https://example.test/inventory/', firstParty: true, offline: false,
    fetch: () => Promise.reject(new Error('No asset read expected')), hash: () => Promise.resolve(hash) });
  let expected = 0;
  const bindings = { instance: 'inventory', recipes: new Map(), items: new Map(), catalogue: [],
    voices: () => new Map(), icon: () => { throw new Error('No item read expected'); },
    onSimulationExpected: () => { expected++; } };
  new ShardfileClient(source, assets, { ...bindings, trustedRuntime: true, worldOwner: 'runtime' });
  expect(expected).toBe(0);
  source.state.shared.push({ id: 1, name: 'active', type: 'bool', privacy: 'host', default: false });
  new ShardfileClient(source, assets, { ...bindings, trustedRuntime: true, worldOwner: 'runtime' });
  expect(expected).toBe(1);
  new ShardfileClient(source, assets, bindings);
  expect(expected).toBe(2);
});

test('explicit runtime loot ownership leaves inventory alone and does not install a second data simulation', () => {
  const source = emptyShardfile({ slug: 'owned-loot', name: 'Owned loot', author: 'Test', revision: 1, seed: 1 });
  source.rows = parseRows({ ...source.rows, loot: [LOOT] });
  source.runtime = { kind: 'client-plan', cost: FIXTURE_RUNTIME_COST, binds: ['loot'] };
  const stripped = withoutRuntimeRows(source);
  expect(source.rows.loot).toHaveLength(1); expect(stripped.rows.loot).toEqual([]);
  expect(stripped.rows.species).toBe(source.rows.species); expect(stripped.files).toBe(source.files);
  const assets = new ClientAssets(stripped, new Map(), { base: 'https://example.test/owned-loot/', firstParty: true, offline: false,
    fetch: () => Promise.reject(new Error('No asset read expected')), hash: () => Promise.resolve('a'.repeat(64)) });
  let expected = 0;
  const bindings = { instance: 'owned-loot', recipes: new Map(), items: new Map(), catalogue: [], voices: () => new Map(),
    icon: () => { throw new Error('No item read expected'); }, onSimulationExpected: () => { expected++; }, trustedRuntime: true, worldOwner: 'runtime' as const };
  new ShardfileClient(stripped, assets, bindings); expect(expected).toBe(0);
  new ShardfileClient({ ...source, runtime: { ...source.runtime, binds: [] } }, assets, bindings); expect(expected).toBe(1);
});

test.each([false, true])('quality-only rows register once without a data simulation (runtime stages %s)', async runtimeStagesOnly => {
  const [{ App }, { Scope }, { createLevelInstallation }, { shardContext }, { createShardProduct }, { MANIFEST }, { parsePlumbing }] = await Promise.all([
    import('../src/client/engine/app/app'), import('../src/shared/engine/app/scope'), import('../src/client/engine/level/installation'),
    import('../src/client/game/plugin/context'), import('../src/shared/game/shardfile/shardProduct'), import('../src/shards/_template/discovery.generated'), import('@wildshard/format/plumbing'),
  ]);
  const source = emptyShardfile({ slug: 'harbour', name: 'Harbour', author: 'Test', revision: 1, seed: 1 });
  source.plumbing = parsePlumbing({ namespace: 'harbour', input: [], debug: [], knobs: [{ id: 'harbour.spray', phone: 0.5, desktop: 0.5 }, { id: 'harbour.shadows', phone: false, desktop: false }] });
  const assets = new ClientAssets(source, new Map(), { base: 'https://example.test/harbour/', firstParty: true, offline: false,
    fetch: () => Promise.reject(new Error('No asset read expected')), hash: () => Promise.resolve('a'.repeat(64)) });
  let expected = 0;
  const bindings = { instance: 'harbour', recipes: new Map(), items: new Map(), catalogue: [], voices: () => new Map(),
    icon: () => { throw new Error('No item read expected'); }, onSimulationExpected: () => { expected++; }, trustedRuntime: true, worldOwner: 'runtime' as const, runtimeStagesOnly };
  const client = new ShardfileClient(source, assets, bindings), app = new App(), scope = new Scope('quality-only');
  const level = createLevelInstallation(app, scope, {}, () => ({ set: () => { throw new Error('No progress expected'); }, detail: () => { throw new Error('No progress expected'); } }));
  const manifest = MANIFEST; // Existing typed boot metadata; the admitted fixture stays fictional.
  const ctx = shardContext(level.context, manifest, { shard: manifest, rows: new Map(), bag: {
    tab: () => { throw new Error('No bag expected'); }, fragment: () => { throw new Error('No bag expected'); },
  } }, createShardProduct({ slug: source.identity.slug, revision: source.identity.revision, shardfile: source, sections: new Map(), files: new Map(),
    read: () => Promise.reject(new Error('No product asset read expected')) }));
  try {
    expect(expected).toBe(0);
    await client.world(ctx); await client.kit(ctx); await client.play(ctx);
    expect(app.levelRegistrations.knobSchemas()).toEqual([{ id: 'harbour.harbour', defaults: { 'harbour.spray': 0.5, 'harbour.shadows': false } }]);
    source.plumbing = parsePlumbing({ ...source.plumbing, input: [{ id: 'harbour.horn', priority: 1, actions: [{ id: 'harbour.horn', keys: ['KeyH'] }] }] });
    new ShardfileClient(source, assets, { ...bindings, runtimeStagesOnly: false }); expect(expected).toBe(1);
  } finally { scope.dispose(); }
  expect(app.levelRegistrations.knobSchemas()).toEqual([]);
});


test('look-only trusted hybrids retain native kit and play ownership', async () => {
  const [{ App }, { Scope }, { createLevelInstallation }, { shardContext }, { createShardProduct }, { MANIFEST }] = await Promise.all([
    import('../src/client/engine/app/app'), import('../src/shared/engine/app/scope'), import('../src/client/engine/level/installation'),
    import('../src/client/game/plugin/context'), import('../src/shared/game/shardfile/shardProduct'), import('../src/shards/_template/discovery.generated'),
  ]);
  const source = emptyShardfile({ slug: 'look-only', name: 'Look only', author: 'Test', revision: 1, seed: 1 });
  source.look.materials = parse(MaterialsSchema, { smoke: { family: 'toon' } });
  const assets = new ClientAssets(source, new Map(), { base: 'https://example.test/look-only/', firstParty: true, offline: false,
    fetch: () => Promise.reject(new Error('No asset read expected')), hash: () => Promise.resolve('a'.repeat(64)) });
  let expected = 0;
  const bindings = { instance: 'look-only', recipes: new Map(), items: new Map(), catalogue: [], voices: () => new Map(),
    icon: () => { throw new Error('No item read expected'); }, onSimulationExpected: () => { expected++; }, trustedRuntime: true, worldOwner: 'runtime' as const };
  const client = new ShardfileClient(source, assets, bindings), app = new App(), scope = new Scope('look-only');
  const level = createLevelInstallation(app, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, MANIFEST, { shard: MANIFEST, rows: new Map(), bag: {
    tab: () => () => undefined, fragment: () => () => undefined,
  } }, createShardProduct({ slug: source.identity.slug, revision: source.identity.revision, shardfile: source, sections: new Map(), files: new Map(),
    read: () => Promise.reject(new Error('No product asset read expected')) }));
  try {
    expect(expected).toBe(0);
    // No data world/equipment exists: these must stay under the trusted kit.
    await client.kit(ctx); await client.play(ctx);
    source.state.shared.push({ id: 1, name: 'active', type: 'bool', privacy: 'host', default: false });
    const gameplay = new ShardfileClient(source, assets, bindings); expect(expected).toBe(1);
    await expect(gameplay.play(ctx)).rejects.toThrow('normal play stage');
  } finally { scope.dispose(); app.engineScope.dispose(); }
});

test.each([
  ['Nalati', NALATI],
  ['Nine', NINE],
] as const)('%s look-only native rows never request a second simulation', (_name, source) => {
  const assets = new ClientAssets(source, new Map(), { base: 'https://example.test/native/', firstParty: true, offline: false,
    fetch: () => Promise.reject(new Error('No asset read expected')), hash: () => Promise.resolve('a'.repeat(64)) });
  let expected = 0;
  new ShardfileClient(source, assets, { instance: source.identity.slug, recipes: new Map(), items: new Map(), catalogue: [], voices: () => new Map(),
    icon: () => { throw new Error('No item read expected'); }, onSimulationExpected: () => { expected++; }, trustedRuntime: true, worldOwner: 'runtime', audioOwner: 'runtime' });
  expect(expected).toBe(0);
});
