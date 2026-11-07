// @vitest-environment happy-dom
import { Group, Vector3 } from 'three';
import { expect, test, vi } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { WorldRegistry } from '../src/client/engine/world/registry';
import type { Interactable } from '../src/shared/engine/world/interact/types';
import { FigureRows } from '../src/client/game/systems/npc/figureRows';
import { SceneHandles } from '../src/client/game/shardfile/sceneHandles';
import { installQuestTrader, openQuestTrader, type TraderShop, type QuestTraderContext } from '../src/client/game/quest/trader';
import driftwood from '../src/shards/driftwood-isle/data/traderStall.json';
import pine from '../src/shards/pine-hollow/data/traderStall.json';

function panel(): TraderShop & { opens: number } {
  let open = false;
  return { get isOpen() { return open; }, opens: 0, open() { open = true; this.opens++; }, close() { open = false; } };
}
function page(name: string) {
  const scope = new Scope(name), registry = new WorldRegistry(), prompts: Interactable[] = [];
  const frames: Parameters<QuestTraderContext['system']>[0][] = [];
  const player = { position: new Vector3(10, 2, 20), yaw: .8, pitch: .4 };
  const ctx: QuestTraderContext = { scope, game: { runtime: { world: { player, registry }, play: {}, interactables: prompts } },
    system: row => { frames.push(row); } };
  return { ctx, scope, registry, prompts, frames, player };
}

test('Maren borrows placement and keeps readiness, facing, offer and walking-close restoration', () => {
  const { ctx, scope, registry, prompts, frames, player } = page('trader-entry');
  const figure = new FigureRows(new SceneHandles({ setupMaterial: () => undefined }), {
    id: 'trader', name: 'The trader', feet: [6.7, 2, 12.2], yaw: Math.PI - .5, talkHeight: 1.4,
    collider: { kind: 'box', half: .3, top: 1.8, bottom: 0 }, rig: { skeleton: 'npc.legs.v1', clips: ['idle'], sockets: [] },
    visible: [], joints: [], sockets: [], drawDistance: 80, pointAt: [0, 0, 0], points: false,
  }, scope);
  scope.run(() => { registry.add({ id: 'trade-counter', name: 'Counter', category: 'props', file: 'test/quest-trader.test.ts', object: new Group() }); });
  const yaw = Math.PI - .5, at = { x: 6.7 + Math.sin(yaw) * 1.9, y: 3.35, z: 12.2 + Math.cos(yaw) * 1.9 };
  const resources = { figure: 'trader', counter: 'trade-counter', offer: 'offer', at, prompt: { label: 'Trade', radius: 2.8 }, before: [] };
  try {
    const stall = installQuestTrader(ctx, driftwood, resources), step = frames[0], prompt = prompts[0], shop = panel();
    if (step === undefined || prompt === undefined) throw new Error('Missing trader fixture');
    expect(stall.trader?.position).toBe(figure.group.position);
    expect(stall.at.toArray()).toEqual([at.x, at.y, at.z]);
    expect(step.id).toBe('shard.driftwood-isle.installTrader');
    expect(prompt.radius).toBe(0); prompt.onInteract(); expect(shop.opens).toBe(0);
    stall.shop = shop; player.position.copy(stall.at);
    expect(prompt.radius).toBe(2.8); prompt.onInteract();
    expect(player.yaw).toBe(Math.atan2(-(6.7 - player.position.x), -(12.2 - player.position.z)));
    expect(player.pitch).toBe(-.32); expect(shop.opens).toBe(1); expect(figure.takeSignal('offer')).toBe(true);
    stall.open(); expect(shop.opens).toBe(1); expect(prompt.radius).toBe(0); expect(figure.takeSignal('offer')).toBe(false);
    player.position.x += 5.299; step.run(.1, 1); expect(shop.isOpen).toBe(true);
    player.position.x += .002; step.run(.1, 2); expect(shop.isOpen).toBe(false); expect(player.pitch).toBe(.4);
    player.pitch = -.7; stall.open(); shop.close(); step.run(.1, 3); expect(player.pitch).toBe(-.7);
    expect(() => installQuestTrader(ctx, driftwood)).toThrow('resources');
    expect(() => installQuestTrader(ctx, driftwood, { ...resources, prompt: { label: 'Trade', radius: -1 } })).toThrow('radius');
    scope.dispose(); stall.open(); expect(shop.opens).toBe(2); expect(prompts).toEqual([]);
  } finally { scope.dispose(); }
});

test('Mott opens the existing lazy panel without a camera or walking-close owner', () => {
  const { ctx, scope, frames, prompts, player } = page('talk-shop'), shop = panel(), getShop = vi.fn(() => shop);
  player.yaw = .7; player.pitch = -.1;
  try {
    const stall = installQuestTrader(ctx, pine);
    const talk = (): void => { stall.shop = getShop(); openQuestTrader(scope, pine.name); };
    expect(getShop).not.toHaveBeenCalled(); expect(stall.trader).toBeNull(); expect(frames).toEqual([]); expect(prompts).toEqual([]);
    stall.open(); expect(shop.opens).toBe(0);
    talk(); talk(); player.position.set(100, 100, 100);
    expect(getShop).toHaveBeenCalledTimes(2); expect(shop.opens).toBe(2); expect(shop.isOpen).toBe(true);
    expect(player.yaw).toBe(.7); expect(player.pitch).toBe(-.1);
    expect(() => installQuestTrader(ctx, { ...pine, view: { pitch: 0, closeDistance: 5 } })).toThrow('resources');
    expect(() => installQuestTrader(ctx, { ...pine, reopen: 'yes' })).toThrow();
    expect(() => openQuestTrader(new Scope('other-trader'), pine.name)).toThrow('Missing entered trader');
    scope.dispose(); openQuestTrader(scope, pine.name); expect(shop.opens).toBe(2);
  } finally { scope.dispose(); }
});
