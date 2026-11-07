import { expect, test, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import type { ViewTell } from '../src/shared/engine/script/viewProgram';
import { shardContext } from '../src/client/game/plugin/context';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { installViewProgram, lendViewTell, lendViewValues } from '../src/client/game/shardfile/clientViewProgram';
import { eliteViewSource, eliteViewTell } from '@wildshard/format/eliteFeature';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { compileScriptV2 } from '../src/sharddev/bake/compileScriptV2';
import { nalatiEliteViews } from '../src/shards/nalati-grasslands/generators/eliteViews';
import source from '../src/shards/nalati-grasslands/behaviour/eliteViews.as?raw';

// Nalati zero R9: the external elites' lane tells moved from game/quest/elitePage.ts to a view module. The reference is
// the original tick's drawing: the rider's last windup / active strike lane, else the herd's charge lane 3 m short of
// its target, else hidden.
type Values = Record<string, number>;
function original(v: Values): readonly number[] | null {
  if ((v['strike'] ?? 0) > 0) return [v['sx0'] ?? 0, v['sz0'] ?? 0, v['sx1'] ?? 0, v['sz1'] ?? 0, v['sw'] ?? 0, v['strike'] === 1 ? .42 : .36];
  const laneT = v['laneT'] ?? 0;
  if (laneT <= 0) return null;
  const fx = v['fx'] ?? 0, fz = v['fz'] ?? 0, dx = (v['tx'] ?? 0) - fx, dz = (v['tz'] ?? 0) - fz, distance = Math.hypot(dx, dz) || 1, k = Math.max(0, distance - 3) / distance;
  return [fx, fz, fx + dx * k, fz + dz * k, 3, .55 * Math.min(1, laneT * 2)];
}
function recorder(): ViewTell & { drawn: readonly number[] | null } {
  const tell = { drawn: null as readonly number[] | null,
    ring: () => { throw new Error('An elite lane draws no ring'); }, wedge: () => { throw new Error('An elite lane draws no wedge'); },
    lane: (...p: number[]) => { tell.drawn = p; }, hide: () => { tell.drawn = null; } };
  return tell;
}

test('the elite lane tells match the original strike and charge drawing', async () => {
  const elites = ['qara-batyr', 'argymaq'], rows = nalatiEliteViews(elites);
  const feature = { kind: 'view.program' as const, id: 'elite-views', module: 'views/nalati.elite-views.wasm', rows };
  const module = await compileScriptV2(source, { lane: 'view', ioBytes: rows.budget.ioBytes });
  const host = new App(), scope = new Scope('elite-views'), camera = new PerspectiveCamera();
  const product = createShardProduct({ slug: 'elite-fixture', revision: 1, sections: new Map(), files: new Map(),
    shardfile: emptyShardfile({ slug: 'elite-fixture', name: 'Elite fixture', author: 'Test', revision: 1, seed: 1 }),
    read: () => Promise.reject(new Error('Elite views need no file read')) });
  const level = createLevelInstallation(host, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  Object.defineProperty(ctx.game, 'runtime', { value: { world: { registry: new WorldRegistry(), player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, game: { camera } } } });
  const values = new Map<string, Values>(elites.map(elite => [elite, {}])), tells = new Map(elites.map(elite => [elite, recorder()]));
  for (const elite of elites) {
    const tell = tells.get(elite), held = values.get(elite);
    if (tell === undefined || held === undefined) throw new Error('Missing elite fixture');
    lendViewTell(ctx.scope, eliteViewTell(elite), tell); lendViewValues(ctx.scope, eliteViewSource(elite), field => held[field] ?? 0);
  }
  const systems: Parameters<typeof ctx.system>[0][] = [];
  const install = vi.spyOn(ctx, 'system').mockImplementation(row => { systems.push(row); });
  try {
    installViewProgram(ctx, feature, module);
    const system = systems[0]; if (system === undefined) throw new Error('Missing elite views');
    expect(system.id).toBe('shard.nalati-grasslands.elite-views');
    const rider = values.get('qara-batyr'), herd = values.get('argymaq');
    if (rider === undefined || herd === undefined) throw new Error('Missing elite values');
    const states: [Values, Values][] = [
      [{}, {}],
      [{ strike: 1, sx0: 3, sz0: -4, sx1: 9, sz1: 12, sw: 2.5 }, { laneT: .1, fx: 1, fz: 2, tx: 21, tz: -13 }],
      [{ strike: 2, sx0: -1, sz0: 0, sx1: 5, sz1: 1, sw: 1.75 }, { laneT: .9, fx: 1, fz: 2, tx: 3, tz: 2 }],
      [{ strike: 0, sx0: 7, sz0: 7, sx1: 8, sz1: 8, sw: 1 }, { laneT: .4, fx: 5, fz: 5, tx: 5, tz: 5 }],
      [{}, { laneT: 0, fx: 1, fz: 2, tx: 21, tz: -13 }],
    ];
    let t = 0;
    for (const [a, b] of states) {
      for (const key of Object.keys(rider)) Reflect.deleteProperty(rider, key);
      for (const key of Object.keys(herd)) Reflect.deleteProperty(herd, key);
      Object.assign(rider, a); Object.assign(herd, b);
      // a frame lands its bank the frame after it ran: run two, then read
      for (let frame = 0; frame < 2; frame++) { t += 1 / 30; system.run(1 / 30, t); }
      for (const [elite, held] of [['qara-batyr', rider], ['argymaq', herd]] as const) {
        const want = original(held), drawn = tells.get(elite)?.drawn ?? null;
        if (want === null) expect(drawn).toBeNull();
        else { expect(drawn).not.toBeNull(); for (const [i, value] of want.entries()) expect(drawn?.[i]).toBeCloseTo(value, 9); }
      }
    }
  } finally { install.mockRestore(); scope.dispose(); }
});
