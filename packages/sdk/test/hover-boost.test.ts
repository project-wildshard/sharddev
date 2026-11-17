// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { Events } from '../src/shared/engine/events/events';
import { isDev, setDev } from '../src/client/engine/core/devMode';
import { hoverSpeed } from '../src/shared/engine/player/hoverSpeed';
import { mountHoverBoost } from '../src/client/engine/ui/hoverBoost';
import { gridHoverSpeed, installGridHoverSpeed, installShardHoverSpeed, type GridHoverPort } from '../src/shared/game/grid/rules';
import CARD from '../src/shards/_template/data/card.json' with { type: 'json' };
import { MANIFEST as padding } from '../src/shards/_template/discovery.generated';
import { MANIFEST as main } from '../src/shards/driftwood-isle/discovery.generated';
import { MANIFEST as pastel } from '../src/shards/pastel-plain/discovery.generated';
import { MANIFEST as ink } from '../src/shards/ink-cel-valley/discovery.generated';
import { MANIFEST as blender } from '../src/shards/blender-template/discovery.generated';
import { MANIFEST as openPlot } from '../src/shards/open-plots/discovery.open-plot-ember-forge.generated';

const centre = { x: 0, y: 0, z: 0 };
afterEach(() => { setDev(false); document.body.replaceChildren(); });

test('real padding declarations select road cruise; a main shard keeps its default', () => {
  expect(CARD.hoverSpeedClass).toBe(padding.hoverSpeedClass);
  for (const row of [padding, blender, pastel, ink, openPlot]) {
    expect(row.hoverSpeedClass).toBe('road');
    expect(gridHoverSpeed(centre, 14, row.hoverSpeedClass)).toBe(30);
    const scope = new Scope('standalone-padding'), player: GridHoverPort = { hoverSpeedLimit: null };
    installShardHoverSpeed(player, scope, row.hoverSpeedClass);
    expect(hoverSpeed(player.hoverSpeedLimit?.(), true)).toBe(60);
    scope.dispose(); expect(player.hoverSpeedLimit).toBe(null);
  }
  expect(gridHoverSpeed(centre, 14, main.hoverSpeedClass)).toBe(14);
  const scope = new Scope('standalone-main'), player: GridHoverPort = { hoverSpeedLimit: null };
  installShardHoverSpeed(player, scope, main.hoverSpeedClass);
  expect(player.hoverSpeedLimit).toBe(null);
  expect(hoverSpeed(player.hoverSpeedLimit?.(), true)).toBe(56);
  scope.dispose();
});

test('the live cap follows a class change and restores its previous owner', () => {
  const scope = new Scope('hover-classes');
  const previous = () => 12;
  const player = { hoverSpeedLimit: previous };
  let speedClass: 'road' | 'shard' = 'road';
  installGridHoverSpeed(player, scope, () => ({ local: centre, shardCap: 14, speedClass, onHighwayDeck: true }));
  expect(player.hoverSpeedLimit()).toBe(30);
  speedClass = 'shard'; expect(player.hoverSpeedLimit()).toBe(14);
  scope.dispose(); expect(player.hoverSpeedLimit).toBe(previous);
});

test('boost gives 2× roads/padding and 4× interiors with a smooth entry strip', () => {
  expect(hoverSpeed(30, true)).toBe(60);
  expect(hoverSpeed(14, true)).toBe(56);
  expect(hoverSpeed(undefined, true)).toBe(56);
  expect(hoverSpeed(10, true)).toBe(40);
  expect(hoverSpeed(22, true)).toBe(58);
  expect(hoverSpeed(30, false)).toBe(30);
  expect(hoverSpeed()).toBe(14);
  expect(() => hoverSpeed(60, true)).toThrow(RangeError);
});

test('Developer gates visibility and input live, including a retained boost latch', () => {
  setDev(false);
  const scope = new Scope('hover-boost'), events = new Events();
  const root = document.createElement('div'); document.body.append(root);
  const player = { hover: true, hoverBoost: false };
  mountHoverBoost(root, player, events, scope);
  const button = root.querySelector('button');
  if (button === null) throw new Error('Missing boost button');
  const tap = () => { button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); };
  expect(button.hidden).toBe(true); tap(); expect(player.hoverBoost).toBe(false);
  setDev(true); expect(button.hidden).toBe(false); tap();
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(hoverSpeed(30, player.hoverBoost && isDev())).toBe(60);
  setDev(false); expect(button.hidden).toBe(true); tap();
  expect(hoverSpeed(30, player.hoverBoost && isDev())).toBe(30);
  setDev(true); tap(); expect(player.hoverBoost).toBe(false);
  player.hover = false; events.emit('player.hover', false); events.flush('input'); expect(button.hidden).toBe(true);
  player.hover = true; events.emit('player.hover', true); events.flush('input'); expect(button.hidden).toBe(false);
  scope.dispose(); expect(root.children.length).toBe(0);
  expect(events.census().listeners).toBe(0);
});
