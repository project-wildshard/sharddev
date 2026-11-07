import { expect, test } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import type { ViewTell } from '../src/shared/engine/script/viewProgram';
import { shardContext } from '../src/client/game/plugin/context';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { installViewProgram, lendViewCell, lendViewFrame, lendViewTell, lendViewValues } from '../src/client/game/shardfile/clientViewProgram';
import { ARENA_VIEW, arenaChainTell } from '@wildshard/format/arenaView';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { compileScriptV2 } from '../src/sharddev/bake/compileScriptV2';
import { nalatiTitanView } from '../src/shards/nalati-grasslands/generators/titanView';
import { TITAN_CLOCKS, TITAN_SCRIPT } from '../src/shards/nalati-grasslands/generators/stormTitanFight';
import source from '../src/shards/nalati-grasslands/behaviour/titanView.as?raw';

// Nalati zero R6: the Storm Titan's per-frame tells and pose moved from game/boss/arenaScript.ts to a view module at the
// fight's frame slot. The reference is the original block: the pose eases toward the tell snapshot at its rates (castL at
// 4 / s), the spear and fork rings draw at the spear while the tell is up (else both hide), and each chain landing's ring
// draws while it is on; an off landing gets no call at all.
type Ring = readonly [number, number, number, number] | 'hidden';
function recorder(): ViewTell & { drawn: Ring | null; calls: number } {
  const tell: ViewTell & { drawn: Ring | null; calls: number } = { drawn: null, calls: 0,
    ring: (x, z, radius, alpha) => { tell.calls++; tell.drawn = [x, z, radius, alpha]; },
    lane: () => { throw new Error('A Titan tell draws no lane'); }, wedge: () => { throw new Error('A Titan tell draws no wedge'); },
    hide: () => { tell.calls++; tell.drawn = 'hidden'; } };
  return tell;
}

test('the Titan view eases the pose and draws the tells as the fight did', async () => {
  const rows = nalatiTitanView(), slots = TITAN_SCRIPT.fight.retainEvents.tell, { sources, cells: ids, tells: tellIds } = ARENA_VIEW;
  const feature = { kind: 'view.program' as const, id: 'titan-view', module: 'views/nalati.titan-view.wasm', rows };
  const module = await compileScriptV2(source, { lane: 'view', ioBytes: rows.budget.ioBytes });
  const scope = new Scope('titan-view'), product = createShardProduct({ slug: 'titan-fixture', revision: 1, sections: new Map(), files: new Map(),
    shardfile: emptyShardfile({ slug: 'titan-fixture', name: 'Titan fixture', author: 'Test', revision: 1, seed: 1 }),
    read: () => Promise.reject(new Error('The Titan view needs no file read')) });
  const level = createLevelInstallation(new App(), scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  Object.defineProperty(ctx.game, 'runtime', { value: { world: { registry: new WorldRegistry(), player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, game: { camera: new PerspectiveCamera() } } } });
  const life: Record<string, number> = {}, clocks: Record<string, number> = {}, pose = { bend: .1, raise: .2, castL: 0 }, spear = new Vector3(4, 0, -9);
  const cells = { bend: { value: 0 }, raise: { value: 0 }, castL: { value: 0 }, struck: { value: 0 }, alpha: { value: 0 } };
  const spearTell = recorder(), forkTell = recorder(), chains = TITAN_CLOCKS.landings.map(() => recorder());
  lendViewValues(ctx.scope, sources.life, field => life[field] ?? 0); lendViewValues(ctx.scope, sources.clocks, field => clocks[field] ?? 0);
  lendViewValues(ctx.scope, sources.pose, field => field === 'bend' ? pose.bend : field === 'raise' ? pose.raise : pose.castL);
  lendViewValues(ctx.scope, sources.spear, field => field === 'x' ? spear.x : spear.z);
  for (const key of ['bend', 'raise', 'castL', 'struck', 'alpha'] as const) lendViewCell(ctx.scope, ids[key], cells[key]);
  lendViewTell(ctx.scope, tellIds.spear, spearTell); lendViewTell(ctx.scope, tellIds.fork, forkTell);
  for (const [i, tell] of chains.entries()) lendViewTell(ctx.scope, arenaChainTell(i), tell);
  const slot = lendViewFrame(ctx.scope, ARENA_VIEW.slot);
  try {
    installViewProgram(ctx, feature, module);
    const states: { life: Record<string, number>; on: readonly number[]; dt: number }[] = [
      { life: { [slots.tell]: 1, [slots.bend]: .8, [slots.bendRate]: 3, [slots.raise]: .9, [slots.raiseRate]: 2, [slots.castL]: 1, [slots.ringRadius]: 6, [slots.ringAlpha]: .5,
        [slots.forkRadius]: 9, [slots.forkAlpha]: .3, [slots.chainRadius]: 4, [slots.chainAlpha]: .7, [slots.struck]: 1, [slots.alpha]: .6 }, on: [1, 0, 1, 0, 0, 0, 0, 1], dt: 1 / 30 },
      { life: { [slots.tell]: 0, [slots.bend]: .2, [slots.bendRate]: 10, [slots.raise]: .2, [slots.raiseRate]: 0, [slots.castL]: 0, [slots.chainRadius]: 3, [slots.chainAlpha]: .2,
        [slots.struck]: 0, [slots.alpha]: .1 }, on: [0, 0, 1, 1, 0, 0, 0, 0], dt: 1 / 60 },
      { life: { [slots.tell]: 1, [slots.bend]: .5, [slots.bendRate]: .5, [slots.raise]: .4, [slots.raiseRate]: 50, [slots.castL]: .3, [slots.ringRadius]: 2, [slots.ringAlpha]: .9,
        [slots.forkRadius]: 3, [slots.forkAlpha]: .02, [slots.struck]: 1, [slots.alpha]: 1 }, on: [0, 0, 0, 0, 0, 0, 0, 0], dt: .1 },
    ];
    let t = 0;
    for (const state of states) {
      for (const key of Object.keys(life)) Reflect.deleteProperty(life, key);
      Object.assign(life, state.life);
      for (const [i, landing] of TITAN_CLOCKS.landings.entries()) { clocks[landing.on] = state.on[i] ?? 0; clocks[landing.x] = 10 + i; clocks[landing.z] = -3 * i; }
      const want = { bend: pose.bend + ((life[slots.bend] ?? 0) - pose.bend) * Math.min(1, state.dt * (life[slots.bendRate] ?? 0)),
        raise: pose.raise + ((life[slots.raise] ?? 0) - pose.raise) * Math.min(1, state.dt * (life[slots.raiseRate] ?? 0)),
        castL: pose.castL + ((life[slots.castL] ?? 0) - pose.castL) * Math.min(1, state.dt * 4) };
      const before = chains.map(tell => tell.calls);
      t += state.dt; slot.frame(state.dt, t);
      expect(cells.bend.value).toBeCloseTo(want.bend, 12); expect(cells.raise.value).toBeCloseTo(want.raise, 12); expect(cells.castL.value).toBeCloseTo(want.castL, 12);
      expect(cells.struck.value).toBe(life[slots.struck] ?? 0); expect(cells.alpha.value).toBe(life[slots.alpha] ?? 0);
      const up = life[slots.tell] === 1;
      for (const [tell, radius, alpha] of [[spearTell, slots.ringRadius, slots.ringAlpha], [forkTell, slots.forkRadius, slots.forkAlpha]] as const) {
        const a = life[alpha] ?? 0;
        if (!up || a <= .01) expect(tell.drawn).toBe('hidden');
        else expect(tell.drawn).toEqual([spear.x, spear.z, life[radius] ?? 0, a]);
      }
      for (const [i, tell] of chains.entries()) {
        if (state.on[i] === 1) expect(tell.drawn).toEqual([10 + i, -3 * i, life[slots.chainRadius] ?? 0, life[slots.chainAlpha] ?? 0]);
        else expect(tell.calls).toBe(before[i]);
      }
      Object.assign(pose, { bend: cells.bend.value, raise: cells.raise.value, castL: cells.castL.value });
    }
  } finally { scope.dispose(); }
});
