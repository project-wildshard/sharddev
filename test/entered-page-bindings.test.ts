// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { shardContext, type BagVerbs } from '../src/client/game/plugin/context';
import { installEnteredRuntimeService, RetainedRuntimeHooks } from '../src/client/game/shard/retainedHooks';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';
import { MeshBasicMaterial } from 'three';
import { withOwner } from '../src/shared/engine/app/ownership';
import { lendLooks, setLentParam, type LentLooks } from '../src/client/game/shardfile/lentLooks';
import { enteredFullMap } from '../src/client/game/grid/mapFrame';
import type { FullMap, MapPoi, MapQuest, MapZone } from '../src/client/engine/ui/Map';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';

const none = (): void => undefined;

test('two runtimes on one page: Bag tabs and input contexts with one id belong to the entered runtime only', () => {
  const page = new Scope('two-runtimes'), app = new App(), tabs = new Set<string>();
  // the page's Bag: one tab per id, as the page menu refuses a duplicate
  const bag = { tab: (spec: { readonly id: string }) => { if (tabs.has(spec.id)) throw new Error(`Duplicate UI tab: ${spec.id}`); tabs.add(spec.id); return () => { tabs.delete(spec.id); }; }, fragment: () => none };
  const runtime = (name: string, deferActivation: boolean): RetainedRuntimeHooks => {
    const owner = page.child(name);
    const level = createLevelInstallation(app, owner, { inputContext: (def) => { const held = owner.child(`input.${def.id}`); app.input.register(def, held); return () => { held.dispose(); }; } },
      () => ({ set: none, detail: none }));
    return new RetainedRuntimeHooks(shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag }), { deferActivation });
  };
  const install = (hooks: RetainedRuntimeHooks): void => {
    hooks.context.bag.tab(legacyDouble<Parameters<BagVerbs['tab']>[0]>({ id: 'finds.shared' }));
    installEnteredRuntimeService(hooks.context, (scope) => {
      hooks.context.inputContext({ id: 'ride.foot', actions: ['ride.whistle'] }); app.input.push('ride.foot', scope);
    });
  };
  try {
    const home = runtime('home', false), neighbour = runtime('neighbour', true);
    install(home); install(neighbour);
    expect([...tabs]).toEqual(['finds.shared']); expect(app.input.top).toBe('ride.foot');
    home.deactivate(); expect(tabs.size).toBe(0); expect(app.input.top).not.toBe('ride.foot');
    neighbour.activate(); expect([...tabs]).toEqual(['finds.shared']); expect(app.input.top).toBe('ride.foot');
    neighbour.deactivate(); home.activate(); expect([...tabs]).toEqual(['finds.shared']);
  } finally { page.dispose(); }
  expect(tabs.size).toBe(0);
});

test('the full map single slots belong to the entered resident; set while parked waits for its entry', () => {
  const page = new Scope('map'), calls: string[] = [];
  const map = legacyDouble<FullMap>({ setPois: (source: () => readonly unknown[]) => { calls.push(`pois:${source().length}`); },
    setQuest: (source: () => unknown) => { calls.push(`quest:${source() === null ? 'none' : 'card'}`); }, setZones: (zones: readonly unknown[]) => { calls.push(`zones:${zones.length}`); },
    addPois: () => none });
  let entry: Scope | null = null, installer: ((scope: Scope) => void) | null = null;
  const enter = (): void => { entry = page.child('entered'); installer?.(entry); }, leave = (): void => { entry?.dispose(); entry = null; };
  const resident = enteredFullMap(map, (install) => { installer = install; });
  resident.setPois(() => [legacyDouble<MapPoi>({ x: 0, z: 0 })]); resident.setQuest(() => legacyDouble<MapQuest>({})); resident.setZones([legacyDouble<MapZone>({})]);
  expect(calls).toEqual([]);
  enter(); expect(calls).toEqual(['pois:1', 'quest:card', 'zones:1']);
  resident.setZones([]); expect(calls.at(-1)).toBe('zones:0');
  leave(); expect(calls.slice(-3)).toEqual(['pois:0', 'quest:none', 'zones:0']);
  expect(resident.addPois(() => [])).toBe(none);
  page.dispose();
});

test('a parked runtime\'s HUD widgets and discs leave the HUD until it is entered, in their own slots', () => {
  const page = new Scope('hud'), app = new App(), band = document.createElement('div'); document.body.append(band);
  const hud = { widget: (_band: unknown, el: HTMLElement) => { band.append(el); return () => { el.remove(); }; },
    disc: () => { const button = document.createElement('button'); band.append(button); return { button, dispose: () => { button.remove(); } }; },
    relabel: () => none, verb: () => none, pin: () => none };
  const runtime = (name: string, deferActivation: boolean): RetainedRuntimeHooks => {
    const level = createLevelInstallation(app, page.child(name), legacyDouble<Parameters<typeof createLevelInstallation>[2]>({ hud }), () => ({ set: none, detail: none }));
    return new RetainedRuntimeHooks(shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => none, fragment: () => none } }), { deferActivation });
  };
  try {
    const home = runtime('home', false), neighbour = runtime('neighbour', true);
    const mine = document.createElement('i'), theirs = document.createElement('b');
    home.context.hud.widget('band.1', mine, 0); neighbour.context.hud.widget('band.1', theirs, 0);
    const disc = neighbour.context.hud.disc(legacyDouble<Parameters<typeof neighbour.context.hud.disc>[0]>({}));
    expect([...band.children]).toEqual([mine]);
    home.deactivate(); neighbour.activate();
    expect([...band.children]).toEqual([theirs, disc]);
    neighbour.deactivate(); home.activate();
    expect([...band.children]).toEqual([mine]);
  } finally { page.dispose(); band.remove(); }
});

test('two copies of one product define and push one input context id at construction: only the entered copy holds it', () => {
  const page = new Scope('copies'), app = new App();
  const runtime = (name: string, deferActivation: boolean): RetainedRuntimeHooks => {
    const owner = page.child(name);
    const level = createLevelInstallation(app, owner, { inputContext: (def) => { const held = owner.child(`input.${def.id}`); app.input.register(def, held); return () => { held.dispose(); }; } },
      () => ({ set: none, detail: none }));
    return new RetainedRuntimeHooks(shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => none, fragment: () => none } }), { deferActivation });
  };
  const construct = (hooks: RetainedRuntimeHooks): void => {
    // native construction: define the kit's context and push it at once, outside any entered service
    hooks.context.inputContext({ id: 'plot.kit', actions: ['use'] }); hooks.context.app.input.push('plot.kit', hooks.context.scope);
  };
  try {
    const home = runtime('home', false), copy = runtime('copy', true);
    construct(home); construct(copy);
    expect(app.input.top).toBe('plot.kit');
    home.deactivate(); expect(app.input.top).not.toBe('plot.kit');
    copy.activate(); expect(app.input.top).toBe('plot.kit');
    copy.deactivate(); home.activate(); expect(app.input.top).toBe('plot.kit');
    home.context.app.input.pop('plot.kit'); expect(app.input.top).not.toBe('plot.kit');
    home.deactivate(); home.activate(); expect(app.input.top).not.toBe('plot.kit');
  } finally { page.dispose(); }
});

test('two copies lend the same look id: a caller owned by one copy writes its own, an unowned one the newest', () => {
  const page = new Scope('looks'), home = page.child('home'), copy = page.child('copy'), writes: string[] = [];
  const lend = (name: string): LentLooks => legacyDouble<LentLooks>({ materials: new Map([['pool', new MeshBasicMaterial()]]),
    setParam: (_id: string, param: string) => { writes.push(`${name}.${param}`); } });
  try {
    lendLooks(home, lend('home')); lendLooks(copy, lend('copy'));
    withOwner(home.child('entered'), () => { setLentParam('pool', 'level', 1); });
    withOwner(copy, () => { setLentParam('pool', 'level', 1); });
    setLentParam('pool', 'fade', 1);
    expect(writes).toEqual(['home.level', 'copy.level', 'copy.fade']);
    copy.dispose(); withOwner(home, () => { setLentParam('pool', 'level', 0); }); setLentParam('pool', 'fade', 0);
    expect(writes.slice(-2)).toEqual(['home.level', 'home.fade']);
  } finally { page.dispose(); }
});
