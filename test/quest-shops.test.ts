// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import { shardContext } from '../src/client/game/plugin/context';
import { RetainedRuntimeHooks } from '../src/client/game/shard/retainedHooks';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { parseShardSlug } from '../src/shared/game/shard/slug';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { DRIFTWOOD as source } from './fixtures/driftwood-program';
import { TRADER_STALL as coinRows } from '../src/shards/driftwood-isle/generators/questShop';
import { TRADER_STALL as barterRows } from '../src/shards/pine-hollow/generators/questShop';
import { TRADES } from '../src/shards/pine-hollow/generators/trades';
import { FIGURE_CATALOGUE } from '../src/shards/pine-hollow/generators/figureCatalogue';
import { Owned } from '../src/shared/game/loot/Owned';
import { Purse, publishPurse } from '../src/shared/game/loot/Purse';
import { installQuestTrader, installQuestShop } from '../src/client/game/quest/trader';

function page(loot: unknown = source.rows.loot) {
  const scope = new Scope('shop-entry'), host = new App(), events: string[] = [], owned = new Owned('shop-entry');
  for (const id of owned.all) owned.revoke(id);
  const product = createShardProduct({ slug: source.identity.slug, revision: source.identity.revision, shardfile: source,
    sections: new Map([['economy/loot', { rows: { loot } }]]), files: new Map(), read: () => Promise.reject(new Error('No shop file read')) });
  const level = createLevelInstallation(host, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, { ...TEMPLATE, slug: parseShardSlug(source.identity.slug) }, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  const pack = new Map<string, number>(), inventory = {
    count: (id: string) => pack.get(id) ?? 0,
    take: (id: string, n: number) => { if ((pack.get(id) ?? 0) < n) return false; pack.set(id, (pack.get(id) ?? 0) - n); events.push(`take:${id}:${n}`); return true; },
    add: (id: string, n: number) => { pack.set(id, (pack.get(id) ?? 0) + n); events.push(`add:${id}:${n}`); },
  };
  const hud = { holdPause: false, entered: true, toast: (text: string) => { events.push(text); }, setPaused: () => undefined };
  const weapons = { stowed: false, setEnabled: (on: boolean) => { events.push(`weapons:${on}`); } };
  Object.defineProperty(ctx.game, 'runtime', { value: {
    world: { registry: new WorldRegistry(), player: { position: new Vector3(), yaw: 0, pitch: 0, swimming: false } },
    play: { owned, inventory, hud, weapons, menu: { isOpen: false, close: () => undefined }, nolock: true, touchUi: () => true,
      audio: { voices: { play: (id: string) => { events.push(id); } } } }, interactables: [],
  } });
  return { ctx, scope, events, owned, pack, hud, weapons };
}

test('Pine cards retain all original post-grant feedback as data and malformed feedback refuses before construction', () => {
  const trader = FIGURE_CATALOGUE.figures['trader'];
  if (trader === undefined) throw new Error('Missing authored trader figure');
  expect(trader.phone.id).toBe(trader.desktop.id);
  for (const trade of TRADES) expect(barterRows.shop?.after[trade.id]).toEqual([
    ...('skin' in trade.get ? [{ kind: 'wear', finish: trade.get.skin }] : []),
    { kind: 'bark', audio: 'ambience', group: 'trader', figure: trader.phone.id }, { kind: 'chime', at: 'none', gain: 1 }, { kind: 'toast', text: `Traded · ${trade.label}` },
  ]);
  const { ctx, scope } = page(), rows = { name: 'Bad shop', reopen: true, shop: { place: 'Bad', barter: false, lifetime: 'resident', after: {} } };
  try {
    installQuestTrader(ctx, rows);
    expect(() => installQuestShop(ctx, rows)).toThrow('exact purchase feedback');
    expect(() => installQuestShop(ctx, { ...rows, shop: { ...rows.shop, after: { key: [{ kind: 'call', owner: 'code', path: ['run'] }] } } })).toThrow();
  } finally { scope.dispose(); }
});

test('resident counters prepare off-board while entered counters recreate their real widgets on each home entry', () => {
  vi.useFakeTimers();
  const { ctx: base, scope } = page();
  const retained = new RetainedRuntimeHooks(base, { deferActivation: true }), ctx = retained.context;
  publishPurse(scope, new Purse('shop-entry', { read: () => 12, write: () => true }));
  const { placement: _placement, view: _view, ...rows } = coinRows;
  try {
    const resident = installQuestTrader(ctx, rows), getResident = installQuestShop(ctx, rows), original = getResident();
    expect(resident.shop).toBe(original);
    const enteredRows = { ...rows, name: 'Entered counter', shop: { ...rows.shop, lifetime: 'entered' } };
    const entered = installQuestTrader(ctx, enteredRows), getEntered = installQuestShop(ctx, enteredRows);
    expect(entered.shop).toBeNull(); expect(() => getEntered()).toThrow('left its home');
    retained.activate(); const first = getEntered(); expect(entered.shop).toBe(first);
    retained.deactivate(); expect(entered.shop).toBeNull(); expect(first.scope.disposed).toBe(true);
    expect(getResident()).toBe(original); expect(original.scope.disposed).toBe(false);
    retained.activate(); expect(getEntered()).not.toBe(first); expect(getResident()).toBe(original);
    original.dispose();
  } finally { scope.dispose(); vi.useRealTimers(); }
});
