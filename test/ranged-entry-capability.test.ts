// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { HeldFinishes } from '../src/client/game/loadout/finishes';
import * as rangedHost from '../src/client/game/loadout/rangedPage';
import { installEntryRangedPage } from '../src/client/game/shardfile/clientQuestComposition';
import { currentPageMode, setPageMode } from '../src/shared/game/grid/pageMode';
import authoredPlan from '../src/shards/pine-hollow/data/clientPlan.json' with { type: 'json' };
import { prepareRangedPage } from '../src/client/game/loadout/rangedPage';
import { shardContext } from '../src/client/game/plugin/context';
import type { ShardRuntime } from '../src/shared/game/shard/runtime';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { admitClientPlan, installClientPhase } from '../src/client/game/shardfile/clientPlan';
import { parseClientPlan } from '@wildshard/format/clientPlan';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST } from '../src/shards/_template/discovery.generated';
import { rangedPage } from '../src/shards/pine-hollow/generators/rangedPage';
import { PINE_SOURCES } from './fixtures/pine-sources';
import { fixtureJsonCheck, fixtureProductFile } from './fixtures/productFile';

const { RANGED_PAGE } = await rangedPage(PINE_SOURCES);

function fixture(finish = true, file = true) {
  const scope = new Scope('ranged-entry'), app = new App();
  const source = emptyShardfile({ slug: 'fixture-ranged', name: 'Ranged fixture', author: 'Fixture', revision: 1, seed: 3 });
  const pack = { url: 'https://example.invalid/finish.bin', rows: { bytes: 0, geometries: [] } };
  const sections = new Map<string, unknown>([['held/finishes', finish ? { source: pack } : {}], ['combat/items', {}]]);
  const name = 'client/ranged-page.json', rows = new TextEncoder().encode(JSON.stringify(RANGED_PAGE));
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source, sections, jsonCheck: fixtureJsonCheck,
    files: new Map([
      ...file ? [[name, fixtureProductFile(name, { hash: 'ranged', url: 'https://example.invalid/ranged.json' })] as const] : [],
      [RANGED_PAGE.collection.pack.url, { hash: 'collection', url: 'https://example.invalid/collection.bin' }],
    ]), read: hash => hash === 'ranged' ? Promise.resolve(rows) : Promise.reject(new Error('Unexpected decode')) });
  const runtime: ShardRuntime = { world: null, play: null, step: null, interactables: [], overhead: [], objects: {}, hooks: {},
    viewer: () => { throw new Error('Preparation must not read the player'); }, horizonVeil: null };
  const level = createLevelInstallation(app, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, MANIFEST, { shard: MANIFEST, runtime, rows: new Map(),
    bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  return { ctx, pack, name };
}

test('declared preparation passes the entered product directly to finish admission', async () => {
  const f = fixture(), prepare = vi.spyOn(HeldFinishes, 'prepare').mockRejectedValue(new Error('finish admission boundary'));
  try {
    await expect(prepareRangedPage(f.ctx, RANGED_PAGE)).rejects.toThrow('finish admission boundary');
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(f.ctx.product, f.ctx.scope);
  } finally { prepare.mockRestore(); f.ctx.scope.dispose(); }
});

test('a missing finish source refuses before finish admission', async () => {
  const f = fixture(false), prepare = vi.spyOn(HeldFinishes, 'prepare');
  try {
    await expect(prepareRangedPage(f.ctx, RANGED_PAGE)).rejects.toThrow('Missing declared finish geometry');
    expect(prepare).not.toHaveBeenCalled();
  } finally { prepare.mockRestore(); f.ctx.scope.dispose(); }
});

test('the finite capability requires its admitted file and runs only in the entered world phase', async () => {
  const missing = fixture(true, false), f = fixture(), row = { kind: 'held.ranged-page', file: f.name };
  const prepare = vi.spyOn(HeldFinishes, 'prepare').mockRejectedValue(new Error('finish admission boundary'));
  try {
    expect(() => admitClientPlan({ version: 1, features: [row] }, missing.ctx.product)).toThrow('admitted data file');
    expect(() => parseClientPlan({ version: 1, features: [{ ...row, call: 'prepareRangedPage' }] })).toThrow();
    const plan = admitClientPlan({ version: 1, features: [row] }, f.ctx.product);
    await installClientPhase(f.ctx, plan, 'kit', f.ctx.scope);
    await installClientPhase(f.ctx, plan, 'world', f.ctx.scope, 'resident');
    expect(prepare).not.toHaveBeenCalled();
    await expect(installClientPhase(f.ctx, plan, 'world', f.ctx.scope, 'entered')).rejects.toThrow('finish admission boundary');
    expect(prepare).toHaveBeenCalledOnce();
  } finally { prepare.mockRestore(); missing.ctx.scope.dispose(); f.ctx.scope.dispose(); }
});

test.each(['shard', 'grid'] as const)('declared ranged install preserves the original %s shadow policy', async mode => {
  const f = fixture(), before = currentPageMode(), boundary = vi.spyOn(rangedHost, 'installRangedPage').mockRejectedValue(new Error('entered ranged boundary'));
  try {
    setPageMode(mode);
    const row = parseClientPlan(authoredPlan).features.find(feature => feature.kind === 'held.ranged-page');
    if (row === undefined) throw new Error('Missing ranged entry rows');
    await expect(installEntryRangedPage(f.ctx, row)).rejects.toThrow('entered ranged boundary');
    expect(boundary.mock.calls[0]?.[1]).toMatchObject({ ...RANGED_PAGE, shadowBatch: mode === 'shard' });
  } finally { boundary.mockRestore(); setPageMode(before); f.ctx.scope.dispose(); }
});
