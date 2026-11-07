// A counter on the server: the law `Exchange.use` held on a page. A page checks a press and sends it; the server takes the price, then
// grants, and what it refuses changes nothing. The page's own `use` goes at the flip.
// oxlint-disable-next-line import/no-nodejs-modules -- A world runs the shipped product bytes and physics module.
import { readFileSync } from 'node:fs';
import { beforeAll, expect, test } from 'vitest';
import { NetClient } from '../src/client/engine/net/client';
import { NetRoom } from '../src/server/engine/net/room';
import { SimNetWorld } from '../src/server/engine/net/simWorld';
import { createSimHost } from '../src/server/engine/sim';
import { loadRapier, type Rapier } from '../src/shared/engine/physics/rapier';
import { actRoutes } from '../src/shared/engine/sim/actRoutes';
import { leadPlayer } from '../src/shared/engine/sim/leadPlayer';
import { shardRows } from '../src/shared/engine/sim/shardRows';
import { directLoopback } from '../src/test/engine/netLoopback';
import { installPlayerOwned } from '../src/server/game/loot/playerOwned';
import { outputDescriptor } from '../src/shared/game/shardfile/outputDescriptor';
import { creditNativeInventory } from '../src/shared/game/inventoryLaw';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';
import { createTrustedHeadlessResident } from '../src/sdk/headlessRuntime';
import { netBuys } from '../src/sdk/standalone/netInput';
import { DRIFTWOOD_LOOT } from '../src/shards/driftwood-isle/generators/loot';
import { TRADES } from '../src/shards/pine-hollow/generators/trades';
import { builtProduct } from './fixtures/builtProduct';
import { SIM_LEVEL } from './fixtures/sim-level/level';

let rapier: Rapier;
beforeAll(async () => { rapier = await loadRapier(readFileSync('public/assets/physics/rapier.wasm')); });

test('a coin card spends the purse before it grants, once, and a short purse buys nothing', () => {
  const host = createSimHost(SIM_LEVEL, { rapier }), { exchange } = DRIFTWOOD_LOOT.economy, whetstone = exchange.goods.findIndex(good => good.id === 'whetstone-1');
  const owned = installPlayerOwned(host, 'exchange-coins', exchange, true), link = directLoopback(), client = new NetClient(link.client), routes = actRoutes(host), order: string[] = [];
  const price = exchange.goods[whetstone]?.costs[0]?.n ?? 0, room = new NetRoom({ world: new SimNetWorld(host), step: inputs => { netBuys(routes, inputs); host.step(); } });
  room.join(link.server); client.hello(); link.pump(); room.open(); link.pump();
  const frames = (): void => { client.flush(); link.pump(); room.tick(); room.tick(); link.pump(); client.present(); };
  owned.owned.onChange(() => { order.push(`granted with ${String(owned.purse.coins)} left`); });
  try {
    expect(whetstone).toBeGreaterThanOrEqual(0); expect(price).toBeGreaterThan(0);
    owned.file({ grant: 'coins', name: 'coins', amount: price - 1 }); frames();
    client.act({ kind: 'buy', seq: 0, good: whetstone }); frames();
    expect(owned.owned.has('whetstone-1'), 'one coin short').toBe(false);
    expect(client.owned.get('coins')).toBe(price - 1);
    owned.file({ grant: 'coins', name: 'coins', amount: price + 1 }); frames();
    client.act({ kind: 'buy', seq: 0, good: whetstone }); frames();
    expect(order).toEqual([`granted with ${String(price)} left`]);
    expect(client.owned.get('coins')).toBe(price); expect(client.owned.get('own.whetstone-1')).toBe(1);
    client.act({ kind: 'buy', seq: 0, good: whetstone }); frames();
    expect(client.owned.get('coins'), 'a card is bought once').toBe(price);
    expect(order).toHaveLength(1);
  } finally { room.dispose(); host.dispose(); }
});

test('Pine\'s counter takes every price from the seat that buys, and a short one takes nothing', { timeout: 60_000 }, async () => {
  const directory = builtProduct('pine-hollow'), product = await loadHeadlessProduct(directory), descriptor = outputDescriptor(product.shardfile);
  if (descriptor === undefined) throw new Error('Missing output');
  const assets = new Map(descriptor.index.files.map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(`${directory}/${file.path}`))]));
  const live = await createTrustedHeadlessResident({ product, shard: product.shardfile, assets, rapier }, undefined, { room: true }), { host } = live, lead = leadPlayer(host);
  const lines = (): ReadonlyMap<string, number> => { const out = new Map<string, number>(); for (const read of shardRows(host).owned.values()) read(lead.id, out); return out; };
  const pack = 'pack', buy = (good: number): void => { actRoutes(host).buy?.(lead.id, good); };
  try {
    const broadheads = TRADES.findIndex(good => good.id === 'broadheads');
    creditNativeInventory(host, pack, { item: 'boar-hide', count: 1 });
    buy(broadheads);
    expect(lines().get('item.boar-hide'), 'two goods short: the hide stays').toBe(1);
    creditNativeInventory(host, pack, { item: 'amber-resin', count: 2 });
    buy(broadheads);
    expect(lines().get('item.boar-hide') ?? 0).toBe(0); expect(lines().get('item.amber-resin') ?? 0).toBe(0);
  } finally { live.dispose(); }
});
