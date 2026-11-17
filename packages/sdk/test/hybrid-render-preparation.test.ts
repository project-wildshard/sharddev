// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { shardContext, ShardPlugin } from '../src/client/game/plugin/context';
import { installEnteredRuntimeService } from '../src/client/game/shard/retainedHooks';
import type { ShardRuntime } from '../src/shared/game/shard/runtime';
import { parseShardSlug } from '../src/shared/game/shard/slug';
import { HybridRuntimeSession, type HybridResident } from '../src/client/game/shardfile/hybrid';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';

function deferred() {
  let finish: () => void = () => undefined, fail: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  return { promise, resolve: () => { finish(); }, reject: (error: Error) => { fail(error); } };
}

function fixture(failWorld = false, failImport = false) {
  const manifest = { ...TEMPLATE, slug: parseShardSlug('render-fixture') }, scope = new Scope('render-overlap');
  const app = new App(), events: string[] = [], render = deferred(), world = deferred(), imported = deferred();
  let contexts = 0;
  const runtime: ShardRuntime = { world: null, step: null, play: null, interactables: [], overhead: [], objects: {}, hooks: {},
    viewer: () => new Vector3(), horizonVeil: null };
  const source = emptyShardfile({ slug: manifest.slug, name: 'Render fixture', author: 'Fixture', revision: 1, seed: 7 });
  const product = createShardProduct({ slug: manifest.slug, revision: 1, shardfile: source, sections: new Map([['client/plan', { version: 1, features: [] }]]),
    files: new Map(), read: () => Promise.reject(new Error('No fixture file')) });
  const failure = new Error(failImport ? 'Original module refusal' : 'Original world refusal');
  const resident: HybridResident = { instance: 'fixture', slug: manifest.slug, declaration: null, product, firstParty: true,
    retainRuntime: true, scope, runtime, renderReady: render.promise, context: (owner, local) => {
      contexts++;
      const level = createLevelInstallation(app, owner, {}, () => ({ set: () => undefined, detail: () => undefined }));
      const context = shardContext(level.context, manifest, { shard: manifest, runtime: local, rows: new Map(),
        bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
      owner.onDispose(() => { events.push('dispose'); });
      return { ...level, context,
        prepareConstruction: () => { events.push('construct'); return () => { events.push('restore'); }; },
        beforeWorld: entered => {
          installEnteredRuntimeService(entered, () => { events.push('visible'); });
        }, afterWorld: () => { events.push('afterWorld'); }, afterKit: () => { events.push('afterKit'); } };
    } };
  const session = new HybridRuntimeSession(new Map([['fixture', resident]]), scope);
  // Use a controlled real world hook; the original admission suites retain
  // compiled-module validation independently of this scheduling control.
  class FixturePlugin extends ShardPlugin {
    override world(): void { events.push('world'); world.resolve(); if (failWorld) throw failure; }
  }
  vi.spyOn(session, 'prepare').mockImplementation(() => {
    imported.resolve();
    return failImport ? Promise.reject(failure) : Promise.resolve(FixturePlugin);
  });
  return { scope, events, render, world, imported, failure, session, manifest, contexts: () => contexts };
}

test('private world preparation overlaps render readiness but kit and visibility remain gated', async () => {
  const f = fixture();
  try {
    const preparing = f.session.prepareEntry('fixture');
    await f.world.promise;
    expect(f.events).toEqual(['construct', 'world']);
    expect(f.session.state().ready).toBe(false);
    f.render.resolve();
    expect(await preparing).toBe(true);
    expect(f.events).toEqual(['construct', 'world', 'afterWorld', 'afterKit', 'restore']);
    expect(await f.session.enter({ instance: 'fixture', slug: f.manifest.slug })).toBe(true);
    expect(f.events.at(-1)).toBe('visible');
  } finally { f.render.resolve(); f.scope.dispose(); }
});

test('ordinary activation waits for the same render fence before world bindings', async () => {
  const f = fixture();
  try {
    const entering = f.session.enter({ instance: 'fixture', slug: f.manifest.slug });
    // The render promise settles from this independent turn; no world hook can resolve it.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(f.events).toEqual([]);
    expect(f.contexts()).toBe(0);
    f.render.resolve();
    expect(await entering).toBe(true);
    expect(f.events).toEqual(['visible', 'world', 'afterWorld', 'afterKit']);
  } finally { f.render.resolve(); f.scope.dispose(); }
});

test('world refusal drains started rendering before cleanup and keeps its original error', async () => {
  const f = fixture(true);
  try {
    const preparing = f.session.prepareEntry('fixture'), refused = expect(preparing).rejects.toBe(f.failure);
    await f.world.promise;
    expect(f.events).toEqual(['construct', 'world']);
    f.render.reject(new Error('Later render refusal'));
    await refused;
    expect(f.events).toEqual(['construct', 'world', 'dispose', 'restore']);
    expect(f.session.state().ready).toBe(false);
  } finally { f.render.resolve(); f.scope.dispose(); }
});

test('render refusal cannot publish afterWorld, kit or entered services', async () => {
  const f = fixture(), failure = new Error('Original render refusal');
  try {
    const preparing = f.session.prepareEntry('fixture'), refused = expect(preparing).rejects.toBe(failure);
    await f.world.promise;
    f.render.reject(failure); await refused;
    expect(f.events).toEqual(['construct', 'world', 'dispose', 'restore']);
    expect(f.session.state().ready).toBe(false);
  } finally { f.render.resolve(); f.scope.dispose(); }
});

test('cancellation during the render wait drains it without advancing later hooks', async () => {
  const f = fixture(), controller = new AbortController();
  try {
    const preparing = f.session.prepareEntry('fixture', controller.signal);
    const settled = (async () => { try { return { value: await preparing }; } catch (error) { return { error }; } })();
    await f.world.promise;
    controller.abort(); f.render.resolve();
    expect(await settled).not.toEqual({ value: true });
    expect(f.events).toEqual(['construct', 'world', 'dispose', 'restore']);
    expect(f.session.state().ready).toBe(false);
  } finally { f.render.resolve(); f.scope.dispose(); }
});

test('module refusal drains started rendering before an installation exists', async () => {
  const f = fixture(false, true);
  let finished = false;
  try {
    const preparing = f.session.prepareEntry('fixture');
    const settled = (async () => {
      try { return { value: await preparing }; }
      catch (error) { return { error }; }
      finally { finished = true; }
    })();
    await f.imported.promise;
    await Promise.resolve(); await Promise.resolve();
    expect(finished).toBe(false);
    expect(f.contexts()).toBe(0);
    f.render.reject(new Error('Later render refusal'));
    expect(await settled).toEqual({ error: f.failure });
    expect(f.events).toEqual([]);
    expect(f.session.state().ready).toBe(false);
  } finally { f.render.resolve(); f.scope.dispose(); }
});
