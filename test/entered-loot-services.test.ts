// @vitest-environment happy-dom
import { installPickupFixture } from './fixtures/pickupSetup';
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { shardContext } from '../src/client/game/plugin/context';
import { RetainedRuntimeHooks } from '../src/client/game/shard/retainedHooks';
import { BagMenu, type BagMenuOptions } from '../src/client/game/bag/tabs';
import { installLoot, type LootPresentation } from '../src/client/game/loot/runtime';
import { Owned } from '../src/shared/game/loot/Owned';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';

await installPickupFixture();

const none = (): void => undefined;

test('two runtimes on one page share the Bag, the coin chip and the minimap: only the entered one holds them', () => {
  const page = new Scope('two-runtimes'), app = new App(), marks: (string | null)[] = [];
  const menu = legacyDouble<Parameters<typeof installLoot>[0]['menu']>({ scope: page.child('menu'), isOpen: false, refresh: none, close: none, addTab: () => none, addTabFragment: () => none });
  const options: BagMenuOptions = { progress: legacyDouble<BagMenuOptions['progress']>({ rows: [], onChange: none }), inventory: legacyDouble<BagMenuOptions['inventory']>({ slots: 0, onChange: none }), kit: () => [] };
  new BagMenu(menu, options);
  const runtime = (name: string, deferActivation: boolean): RetainedRuntimeHooks => {
    const level = createLevelInstallation(app, page.child(name), {}, () => ({ set: none, detail: none }));
    return new RetainedRuntimeHooks(shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => none, fragment: () => none } }), { deferActivation });
  };
  const presentation = (id: string): LootPresentation => ({ gear: (purse) => ({ coins: purse.coins }), finds: null, marks: () => [], charted: () => true, chime: none, debugName: id });
  const install = (hooks: RetainedRuntimeHooks, slug: string): void => {
    installLoot({ ctx: hooks.context, manifest: { slug, loot: { coins: true } }, owned: new Owned(slug), scene: new THREE.Scene(),
      player: { position: new THREE.Vector3() }, camera: new THREE.PerspectiveCamera(), animals: () => [], menu,
      presentation: presentation(slug), minimap: { setMarks: (source) => { marks.push(source === null ? null : slug); } } });
  };
  const chips = (): number => document.querySelectorAll('.ws-loot-chip').length;
  try {
    const home = runtime('home', false), neighbour = runtime('neighbour', true);
    install(home, 'home-shard');
    // the warm neighbour builds while the home is entered: its page-global loot waits for its own entry
    install(neighbour, 'neighbour-shard');
    expect(chips()).toBe(1); expect(marks).toEqual(['home-shard']);
    home.deactivate(); neighbour.activate();
    expect(chips()).toBe(1); expect(marks).toEqual(['home-shard', null, 'neighbour-shard']);
    neighbour.deactivate(); home.activate();
    expect(chips()).toBe(1); expect(marks.at(-1)).toBe('home-shard');
  } finally { page.dispose(); }
  expect(chips()).toBe(0);
});
