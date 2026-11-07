import { lendOpenArenaView } from '../src/client/game/boss/arenaFire';
import { titanFightOwners } from './fixtures/titanFightOwners';
// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { installWorldFixture } from './fixtures/worldSetup';
import { lendNalatiPasture } from './fixtures/nalati-return-modules';
import { nalatiViewBytes } from './fixtures/nalati-view-modules';
import { titanPrograms as programs } from './fixtures/titanInlineWitness';
import { ArenaRoomEncounter, type OpenArenaWorld } from '../src/client/game/boss/arenaRoom';
import { ARENA_ROOM_PAGE } from '../src/client/game/boss/arenaRoomView';
import { bindArenaPoseView } from '../src/server/game/boss/headlessArenaPose';
import type { OpenArenaFight, OpenArenaFightSnapshot } from '../src/shared/game/boss/openArenaFight';
import { app } from '../src/client/engine/app/runtime';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import { shardContext } from '../src/client/game/plugin/context';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { installViewProgram } from '../src/client/game/shardfile/clientViewProgram';
import { lendLooks } from '../src/client/game/shardfile/lentLooks';
import { emptyShardfile } from '../src/sharddev/author';
import { parseArenaScriptData } from '@wildshard/format/arenaScriptRows';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { nalatiTitanView } from '../src/shards/nalati-grasslands/generators/titanView';
import fireView from '../src/shards/nalati-grasslands/data/arenaFire.json' with { type: 'json' };
import * as titan from '../src/shards/nalati-grasslands/generators/stormTitanFight';
import { titanGeometryRows } from '../src/shards/nalati-grasslands/generators/stormTitanGeometry';
import * as world from '../src/shards/nalati-grasslands/generators/layout';
import { bindFlatTerrain } from '@wildshard/engine/test/terrain';
import { manager } from '@wildshard/engine/test/manager';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';
import { mockCanvas } from '@wildshard/engine/test/weaponParity';

// CI12 (sp-x8's Titan native): the fight's pose view bound natively (bindArenaPoseView) runs the page's equations, and a
// fresh fight restored from a mid-fight snapshot, with a fresh view lane, continues exactly as the original did: the
// admitted titan view module carries nothing between frames outside the cells the snapshot keeps.
await installWorldFixture();
const geometry = titanGeometryRows(), STEPS = 150, AT = 70, MATERIALS = ['nalati-titan-cloud', 'nalati-titan-flame', 'nalati-titan-smoke', 'nalati-tell'];

function fight(scope: Scope, view: 'page' | 'native'): { fight: OpenArenaFight; player: Vector3 } {
  const f = manager(), materials = new Map(MATERIALS.map(id => [id, new MeshBasicMaterial()]));
  Object.assign(f.player, { velocity: new Vector3(), setBodyEnabled: () => undefined });
  lendLooks(scope, { materials, setParam: () => undefined, setTexture: () => undefined, bindMeshMap: () => { throw new Error('No mapped materials'); },
    instance: () => ({ material: new MeshBasicMaterial(), setParam: () => undefined }) });
  scope.onDispose(() => { for (const material of materials.values()) material.dispose(); });
  scope.expose(app, 'levelScope', scope);
  const game = Object.assign(f.game.asGame(), { app, levelScope: scope });
  lendNalatiPasture(scope);
  const data = parseArenaScriptData({ ...titanFightOwners, arenaScript: titan.TITAN_HOST, arenaFire: fireView, programs: { attack: programs.attack, wind: programs.wind } }, geometry);
  const weather = legacyDouble<OpenArenaWorld['weather']>({ flash: 0, raise: () => undefined, stormActive: true });
  const owner = new ArenaRoomEncounter({ kind: 'open', page: ARENA_ROOM_PAGE, world: { game, player: f.player, weather, tieSpot: null }, rows: data });
  const rows = nalatiTitanView(), module = nalatiViewBytes('titan-view'), camera = new PerspectiveCamera();
  if (view === 'native') bindArenaPoseView(owner.openFight, module, rows, { scope, player: f.player, camera });
  else {
    const product = createShardProduct({ slug: 'titan-view-fixture', revision: 1, sections: new Map(), files: new Map(),
      shardfile: emptyShardfile({ slug: 'titan-view-fixture', name: 'Titan view fixture', author: 'Test', revision: 1, seed: 1 }),
      read: () => Promise.reject(new Error('The Titan view needs no file read')) });
    const level = createLevelInstallation(new App(), scope.child('titan-view'), {}, () => ({ set: () => undefined, detail: () => undefined }));
    const ctx = shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
    Object.defineProperty(ctx.game, 'runtime', { value: { world: { registry: new WorldRegistry(), player: f.player, game: { camera } } } });
    lendOpenArenaView(owner.openFight, ctx.scope);
    installViewProgram(ctx, { kind: 'view.program', id: 'titan-view', module: 'views/nalati.titan-view.wasm', rows }, module);
  }
  return { fight: owner.openFight, player: f.player.position };
}

/** one step of the scripted fight: the spear, the winds (no rider owner: the dome breaks), then the grass fire and chains */
function step(run: { fight: OpenArenaFight; player: Vector3 }, i: number): void {
  const { fight: a, player } = run;
  player.set(world.CAIRN.x + Math.sin(i * .07) * 9, 0, world.CAIRN.z + titan.TITAN_PLACE.centreZ + Math.cos(i * .05) * 7);
  if (i === 0) { a.tied = true; a.reset(0); a.intro(0, true); a.begin(0); a.body.setVisible(true); }
  if (i === 45) a.enterPhase(1);
  if (i === 90) a.enterPhase(2);
  a.update(1 / 30, i / 30, true);
  // a ray at the heart every few frames publishes the heart target (where arrows stuck in it follow)
  if (i % 7 === 3) { const eye = player.clone().setY(2), focus = a.body.focusWorld(new Vector3()); a.target(eye, focus.sub(eye).normalize(), 400, null); }
}

test('the native pose view runs the page slot\'s equations, and a restored fight continues exactly', () => {
  mockCanvas();
  const restoreTerrain = bindFlatTerrain({ heightAt: () => 0, normalAt: () => [0, 1, 0], waterLevel: () => -100 }), random = app.rng.stream('ai'), start = random.snapshot();
  const page: OpenArenaFightSnapshot[] = [], native: OpenArenaFightSnapshot[] = [];
  let mid: { fight: OpenArenaFightSnapshot; random: ReturnType<typeof random.snapshot> } | null = null;
  // Compare equations at equal frame cadence. The page's adaptive lane may
  // otherwise skip after three CPU overruns while the native lane runs every
  // frame. Observer clock reads must not spend a simulated CPU budget; the
  // ViewLane controls separately cover halving and recovery under real costs.
  let elapsed = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  try {
    for (const [view, out] of [['page', page], ['native', native]] as const) {
      random.restore(start);
      const scope = new Scope(`titan-${view}`), run = fight(scope, view);
      try {
        for (let i = 0; i < STEPS; i++) {
          elapsed = i * 1000 / 30;
          if (view === 'native' && i === AT) mid = { fight: structuredClone(run.fight.snapshot()), random: random.snapshot() };
          step(run, i); out.push(structuredClone(run.fight.snapshot()));
        }
      } finally { scope.dispose(); }
    }
    for (let i = 0; i < STEPS; i++) expect(native[i], `Titan pose frame ${i}`).toEqual(page[i]);
    expect(native).toEqual(page);
    // the scripted fight moves every part the continuation carries
    const first = native[0], last = native.at(-1);
    if (first === undefined || last === undefined || mid === null) throw new Error('Missing recorded fight');
    expect(last.clocks).not.toEqual(first.clocks); expect(last.field.modes.some(mode => mode !== first.field.modes[0])).toBe(true);
    expect(native.some(row => row.view !== null && JSON.stringify(row.view) !== JSON.stringify(first.view))).toBe(true);
    expect(native.some(row => row.whirls.drawn.some(d => d.shown === 1))).toBe(true);
    expect(new Set(native.map(row => row.heart.position.join(','))).size).toBeGreaterThan(2);
    expect(mid.fight.heart.position).not.toEqual([0, 0, 0]);
    // a fresh fight and a fresh view lane, restored at AT (the host's ai stream with it), run the same suffix
    random.restore(mid.random);
    const scope = new Scope('titan-restored'), run = fight(scope, 'native');
    try {
      run.fight.restore(mid.fight, () => null);
      expect(run.fight.snapshot()).toEqual(mid.fight);
      for (let i = AT; i < STEPS; i++) { elapsed = i * 1000 / 30; step(run, i); expect(run.fight.snapshot()).toEqual(native[i]); }
    } finally { scope.dispose(); }
  } finally { clock.mockRestore(); random.restore(start); restoreTerrain(); }
});
