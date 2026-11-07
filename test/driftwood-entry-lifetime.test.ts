// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { shardContext } from '../src/client/game/plugin/context';
import { parseShardSlug } from '../src/shared/game/shard/slug';
import type { ShardRuntime } from '../src/shared/game/shard/runtime';
import { HybridResidentWorld } from '../src/client/game/shardfile/hybrid';
import { bindResidentWorldScope } from '../src/client/game/shardfile/hybridPresentation';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';

test('entered adventure references retire while the resident world survives re-entry', async () => {
  const resident = new Scope('resident-world'), app = new App();
  const runtime: ShardRuntime = { world: null, step: null, play: null, interactables: [], overhead: [], objects: {}, hooks: {},
    viewer: () => new Vector3(), horizonVeil: null };
  const manifest = { ...TEMPLATE, slug: parseShardSlug('entry-lifetime') };
  const source = emptyShardfile({ slug: manifest.slug, name: 'Lifetime fixture', author: 'Fixture', revision: 1, seed: 7 });
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source, sections: new Map(), files: new Map(),
    read: () => Promise.reject(new Error('No fixture file')) });
  const cached = new HybridResidentWorld<{ owner: Scope }>();
  const adventure: { value: { visit: number } | null } = { value: null };
  let builds = 0;
  try {
    for (const visit of [1, 2]) {
      const entered = resident.child(`entered:${visit}`);
      bindResidentWorldScope(entered, resident);
      const installation = createLevelInstallation(app, entered, {}, () => ({ set: () => undefined, detail: () => undefined }));
      const context = shardContext(installation.context, manifest, { shard: manifest, runtime, rows: new Map(),
        bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
      const world = await cached.load(context, owner => { builds++; return Promise.resolve({ owner }); });
      entered.expose(adventure, 'value', { visit });
      expect(world.owner).toBe(resident);
      expect(adventure.value).toEqual({ visit });
      expect(builds).toBe(1);
      entered.dispose();
      expect(adventure.value).toBeNull();
      expect(world.owner.disposed).toBe(false);
    }
  } finally { resident.dispose(); }
});

test('out-of-order and sliced retirement never restore an ended adventure reference', () => {
  const first = new Scope('first-entry'), second = new Scope('second-entry');
  const adventure: { value: { visit: number } | null } = { value: null };
  first.expose(adventure, 'value', { visit: 1 });
  second.expose(adventure, 'value', { visit: 2 });
  first.dispose();
  expect(adventure.value).toEqual({ visit: 2 });
  for (const step of second.disposeSteps()) void step;
  expect(adventure.value).toBeNull();
  second.expose(adventure, 'value', { visit: 3 });
  expect(adventure.value).toBeNull();
});
