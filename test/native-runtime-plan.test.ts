import { originalSkyMovers } from './fixtures/sky-movers';
import { originalSkyNavigation } from './fixtures/sky-navigation';
// oxlint-disable-next-line import/no-nodejs-modules -- Read critical terrain blobs from the exact admitted product inventory.
import { readFile } from 'node:fs/promises';
// oxlint-disable-next-line import/no-nodejs-modules -- Check content-addressed proof bytes before native terrain decoding.
import { createHash } from 'node:crypto';
import { clientPageGround } from '../src/shared/game/shardfile/clientGround';
import { needsTerrainCollider } from '../src/shared/engine/level/spec';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';
import { builtProduct } from './fixtures/builtProduct';
import { outputDescriptor } from '../src/shared/game/shardfile/outputDescriptor';
import { readCreatureStrikes } from '@wildshard/format/creatures';
import { outputPlatformPayloads } from '../src/sharddev/outputProduct';
import { headlessSections } from '../src/sdk/headlessSections';
import { runtimeAccountedBytes } from '@wildshard/format/runtimeCost';
import { clientHomeBytes } from '../src/client/game/shardfile/clientResidency';
import { expect, it } from 'vitest';
import { parseNativeRuntimePlan, nativeRuntimeActorIds } from '@wildshard/format/nativeRuntimePlan';
import { pagePopulationRows } from '../src/shared/game/population/pageRows';
import { SKY_SPAWNS } from '../src/shards/far-reach/generators/rows/spawns';
import { SIGNAL_SPAWNS } from '../src/shards/sunscar-dunes/generators/rows/spawns';
import { SKY_CLIENT_PLAN } from '../src/shards/far-reach/generators/clientPlan';
import { clientOwnershipRules } from '@wildshard/format/clientOwnership';
import { skyProductRows } from '../src/shards/far-reach/generators/product';
import { signalProductRows, client as SIGNAL_CLIENT_PLAN } from './fixtures/sunscar-source-program';
import { emitPlatformSections } from '../src/sharddev/platformSections';
import { SKY_NATIVE_WORLD } from '../src/shards/far-reach/generators/rows/nativeWorld';
import { SIGNAL_NATIVE_WORLD } from '../src/shards/sunscar-dunes/generators/rows/nativeWorld';

it('admits both existing native policies without dropping owner metadata', () => {
  for (const recipe of [SKY_NATIVE_WORLD, SIGNAL_NATIVE_WORLD]) {
    const parsed = parseNativeRuntimePlan({ kind: 'held-melee', recipe, baked: { pieces: [], actors: [] } });
    expect(parsed.recipe.population.owner).toEqual(recipe.population.owner);
    expect(parsed.recipe.population.rows.homes).toEqual(recipe.population.rows.homes);
    expect(parsed.recipe.runtime).toEqual(recipe.runtime);
    expect(parsed.recipe.population.rows.program.species.map(row => row.variants))
      .toEqual(recipe.population.rows.program.species.map(row => row.variants));
    const output = emitPlatformSections(new Map([['sim/runtime-plan', parsed]]));
    expect(output.sections[0]?.schema).toBe('wildshard:sim/runtime-plan@1');
  }
});

it('refuses executable selectors, callbacks and unbounded native declarations', () => {
  const row = { kind: 'held-melee', recipe: SKY_NATIVE_WORLD, baked: { pieces: [] } };
  expect(() => parseNativeRuntimePlan({ ...row, module: 'file:///source.ts' })).toThrow();
  expect(() => parseNativeRuntimePlan({ ...row, kind: 'source' })).toThrow();
  expect(() => parseNativeRuntimePlan({ ...row, baked: { install: () => undefined } })).toThrow();
  expect(() => parseNativeRuntimePlan({ ...row, recipe: { ...row.recipe, player: { speed: Infinity } } })).toThrow();
  expect(() => parseNativeRuntimePlan({ ...row, recipe: { ...row.recipe, population: {
    ...row.recipe.population, rows: { ...row.recipe.population.rows, homes: Array.from({ length: 4097 }, () => row.recipe.population.rows.homes[0]) },
  } } })).toThrow();
});

it('retains the body-home field order used by existing native saves', () => {
  const parsed = parseNativeRuntimePlan({ kind: 'held-melee', recipe: SKY_NATIVE_WORLD, baked: { pieces: [] } });
  const source = SKY_NATIVE_WORLD.population.rows.placement.rows[0]?.home;
  const admitted = parsed.recipe.population.rows.placement?.rows[0]?.home;
  if (source === undefined || admitted === undefined) throw new Error('Missing original body home');
  expect(Object.keys(admitted)).toEqual(Object.keys(source));
});

it('retains director input order through canonical output for existing saves', () => {
  const emitted = emitPlatformSections(new Map([['sim/runtime-plan', { kind: 'held-melee', recipe: SKY_NATIVE_WORLD, baked: { pieces: [] } }]]));
  const bytes = emitted.files.get('sections/sim/runtime-plan.json');
  if (bytes === undefined) throw new Error('Missing native section');
  const decoded = parseNativeRuntimePlan(JSON.parse(new TextDecoder().decode(bytes)));
  expect(Object.keys(decoded.recipe.population.owner.stages.inputs))
    .toEqual(Object.keys(SKY_NATIVE_WORLD.population.owner.stages.inputs));
  expect(() => parseNativeRuntimePlan({ ...decoded, ownerInputs: ['foreign'] })).toThrow();
});

it('data pages allocate the original native roster, looks and stable actor identities', () => {
  for (const [recipe, expected] of [[SKY_NATIVE_WORLD, SKY_SPAWNS], [SIGNAL_NATIVE_WORLD, SIGNAL_SPAWNS]] as const) {
    const plan = parseNativeRuntimePlan({ kind: 'held-melee', recipe, baked: { pieces: [] } });
    expect(pagePopulationRows(plan)).toEqual(expected);
    expect(nativeRuntimeActorIds(plan)).toEqual(recipe.population.rows.homes.map(row => row.id)
      .concat('boss' in recipe.population.rows ? [recipe.population.rows.boss.id] : []));
    const duplicate = plan.recipe.population.rows.homes[0];
    if (duplicate === undefined) throw new Error('Missing authored body');
    const repeated = { ...plan, recipe: { ...plan.recipe, population: { ...plan.recipe.population,
      rows: { ...plan.recipe.population.rows, homes: [...plan.recipe.population.rows.homes, duplicate] } } } };
    expect(() => nativeRuntimeActorIds(repeated)).toThrow('duplicate');
  }
});

it('both data pages require their complete real feature, quest and encounter owners', () => {
  for (const [legacy, client, recipe] of [[skyProductRows(originalSkyNavigation(), originalSkyMovers()), SKY_CLIENT_PLAN, SKY_NATIVE_WORLD], [signalProductRows(), SIGNAL_CLIENT_PLAN, SIGNAL_NATIVE_WORLD]] as const) {
    const source = { ...legacy, runtime: null };
    const sections = new Map<string, unknown>([['client/plan', client], ['world/scenes', {}], ['world/targets', {}], ['actors/species-programs', {}],
      ['look/painted', {}], ['sim/scripts', []], ['sim/runtime-plan', { kind: 'held-melee', recipe, baked: { pieces: [] } }]]);
    expect(clientOwnershipRules(source, sections)).toEqual([]);
    for (const kind of ['held.melee', 'quest.page', 'population.homes', 'motion.channels', 'species.program'] as const) {
      sections.set('client/plan', { ...client, features: client.features.filter(row => row.kind !== kind) });
      expect(clientOwnershipRules(source, sections)).toContain(`Data page requires ${kind}`);
    }
    sections.set('client/plan', client);
    const motion = client.features.find(row => row.kind === 'motion.channels');
    const channel = motion?.rows.frames[0]?.program ?? motion?.rows.groups[0]?.programs[0];
    if (channel === undefined) throw new Error('Missing original motion program');
    expect(clientOwnershipRules({ ...source, clientChannels: source.clientChannels?.filter(row => row.id !== channel) ?? [] }, sections))
      .toContain('Data page motion requires every declared channel program');
    sections.delete('world/targets');
    expect(clientOwnershipRules(source, sections)).toContain('Data page requires world/targets');
    sections.delete('sim/runtime-plan');
    expect(clientOwnershipRules(source, sections)).toContain('Data page requires sim/runtime-plan');
  }
});

it('both data homes retain the reviewed client floor and ordinary sim allocation', () => {
  for (const source of [skyProductRows(originalSkyNavigation(), originalSkyMovers()), signalProductRows()]) {
    expect(source.runtime).toBeNull();
    const floor = source.budgets.client;
    if (floor === undefined) throw new Error('Missing retained client measurement');
    expect(clientHomeBytes(source.budgets)).toBe(Math.max(source.budgets.sim.resident, runtimeAccountedBytes(floor)));
    expect(clientHomeBytes(source.budgets, 'img')).toBe(Math.max(source.budgets.sim.resident, runtimeAccountedBytes(floor.imagesFirst ?? floor)));
    const larger = clientHomeBytes(source.budgets) + 1;
    expect(clientHomeBytes({ ...source.budgets, sim: { ...source.budgets.sim, resident: larger } })).toBe(larger);
  }
});

it('build admission carries the verified native plan into its renderer-free worker context', () => {
  for (const recipe of [SKY_NATIVE_WORLD, SIGNAL_NATIVE_WORLD]) {
    const plan = parseNativeRuntimePlan({ kind: 'held-melee', recipe, baked: { pieces: [] } });
    const strikes = readCreatureStrikes(recipe.population.rows.program.strikes);
    const emitted = emitPlatformSections(new Map<'sim/runtime-plan' | 'actors/strikes', unknown>([['sim/runtime-plan', plan], ['actors/strikes', strikes]]));
    const payloads = outputPlatformPayloads(emitted);
    expect(headlessSections(payloads).get('sim/runtime-plan')).toEqual(plan);
    expect(headlessSections(payloads).get('actors/strikes')).toEqual(strikes);
    const first = emitted.sections[0]; if (first === undefined) throw new Error('Missing native plan');
    const files = new Map(emitted.files), original = files.get(first.path);
    if (original === undefined) throw new Error('Missing verified native bytes');
    const forged = original.slice(); forged[0] = 32; files.set(first.path, forged);
    expect(() => outputPlatformPayloads({ sections: emitted.sections, files })).toThrow('hash or size mismatch');
  }
});

it('native page entries retain their sampled collider and structure-floor policies', async () => {
  for (const [slug, collision, height] of [['far-reach', false, SKY_NATIVE_WORLD.ground.height], ['sunscar-dunes', true, null]] as const) {
    const directory = builtProduct(slug), product = await loadHeadlessProduct(directory), source = product.shardfile;
    const files = outputDescriptor(source)?.index.files;
    if (files === undefined) throw new Error('Missing native product index');
    const refs = source.terrain === null ? [] : [source.terrain.collider, ...(source.terrain.sampling === undefined ? [] : [source.terrain.sampling.file])];
    const assets = new Map<string, Uint8Array>();
    for (const ref of new Set(refs)) {
      const file = files.find(entry => entry.hash === ref);
      if (file === undefined) throw new Error('Missing admitted terrain file');
      const bytes = await readFile(`${directory}/${file.path}`);
      expect(bytes.length).toBe(file.compressed);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.hash);
      assets.set(ref, Uint8Array.from(bytes));
    }
    const ground = clientPageGround(source, assets);
    expect(needsTerrainCollider({ ground })).toBe(collision);
    if (height !== null) expect(ground.terrain.heightAt(0, 0)).toBe(height);
    else {
      expect(Number.isFinite(ground.terrain.heightAt(0, 70))).toBe(true);
      expect(() => clientPageGround(source, new Map())).toThrow('Missing admitted terrain');
    }
  }
});
