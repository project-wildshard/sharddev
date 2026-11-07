import { expect, test, vi } from 'vitest';
import { BufferGeometry, Color, type ColorSpace, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import { setTerrainHeight } from '../src/shared/engine/world/terrainHeight';
import { smooth01, step } from '../src/shared/engine/entities/species/rigs';
import { shardContext } from '../src/client/game/plugin/context';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import type { SpeciesViewActor } from '../src/client/game/population/speciesViewSlots';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { installViewProgram } from '../src/client/game/shardfile/clientViewProgram';
import { compileScriptV2 } from '../src/sharddev/bake/compileScriptV2';
import { nalatiCreatureViews } from '../src/shards/nalati-grasslands/generators/creatureViews';
import source from '../src/shards/nalati-grasslands/behaviour/creatureViews.as?raw';

// G600 L8: the balbal glow / height and eagle height moved from species/balbal.ts and species/eagle.ts to a view module.
// The reference below is the original animate arithmetic, fed the same clocks (the view's own time, the 0.8 s death clock).
const rows = nalatiCreatureViews(), feature = { kind: 'view.program' as const, id: 'creature-views', module: 'views/nalati.creature-views.wasm', rows };
const ground = (x: number, z: number): number => .1 * x + .05 * z + 3;
interface Ref { deathT: number; deadT: number; altS?: number }
type Actor = SpeciesViewActor & { alive: boolean; attackPhase: number; mem: Record<string, number | undefined> };
const actor = (id: string, kind: string, x: number, mem: Record<string, number | undefined>, cracks = true): Actor => {
  const mesh = new Object3D();
  if (cracks) mesh.add(Object.assign(new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: 0xff7519 })), { name: 'balbal-cracks' }));
  return { entityId: id, kind, mesh, position: { x, y: 0, z: 2 * x }, yaw: 0, alive: true, mem, attackPhase: -1, scale: 1.2, seed: x * 3.7 + .4, yOffset: 0 };
};
const crack = (a: Actor): MeshBasicMaterial => {
  const mesh = a.mesh.getObjectByName('balbal-cracks');
  if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshBasicMaterial)) throw new Error('Missing cracks');
  return mesh.material;
};

/** Extra diagnostic reads cannot spend time in this arithmetic-only fixture. */
class DiagnosticColor extends Color {
  override setRGB(r: number, g: number, b: number, colorSpace?: ColorSpace): this {
    for (let read = 0; read < 32; read++) performance.now();
    return super.setRGB(r, g, b, colorSpace);
  }
}

/** The original animateBalbal / animateEagle arithmetic over a reference memory. */
function original(a: Actor, ref: Ref, t: number, dt: number): { glow: number; yOffset: number } {
  const m = a.mem, g = ground(a.position.x, a.position.z);
  if (a.kind === 'eagle') {
    const alt = m['altY'] ?? g + 20;
    ref.altS = (ref.altS ?? alt) + (alt - (ref.altS ?? alt)) * Math.min(1, dt * 6);
    return { glow: 0, yOffset: ref.altS - g };
  }
  if (!a.alive) { ref.deathT = ref.deathT < 0 ? 0 : Math.min(1, ref.deathT + dt / .8); ref.deadT += dt; }
  const atk = a.alive ? a.attackPhase : -1, wind = atk >= 0 ? step(atk, 0, .52) : 0, flash = atk >= 0 ? Math.max(0, 1 - Math.abs(atk - .55) * 14) : 0;
  const dead = ref.deathT >= 0 ? smooth01(ref.deathT) : 0, rising = m['field'] === 1 ? 1 - (m['rise'] ?? 1) : 0;
  const glow = (.9 + .25 * Math.sin(t * 2.3 + a.seed) + 2.6 * wind * wind + 4 * flash + 1.5 * rising * (.6 + .4 * Math.sin(t * 17))) * (1 - dead * .85);
  const sink = Math.max(0, ref.deadT - .9) * 1.1;
  return { glow, yOffset: (m['field'] === 1 ? -(1 - smooth01(m['rise'] ?? 1)) * 2.5 * a.scale : (m['floorY'] ?? g) - g) - sink };
}

test('balbal glow and height and eagle height match the original animate arithmetic', async () => {
  const module = await compileScriptV2(source, { lane: 'view', ioBytes: rows.budget.ioBytes });
  const host = new App(), scope = new Scope('creature-views'), camera = new PerspectiveCamera();
  const product = createShardProduct({ slug: 'creature-fixture', revision: 1, sections: new Map(), files: new Map(),
    shardfile: emptyShardfile({ slug: 'creature-fixture', name: 'Creature fixture', author: 'Test', revision: 1, seed: 1 }),
    read: () => Promise.reject(new Error('Creature views need no file read')) });
  const level = createLevelInstallation(host, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  const rising = actor('rising', 'balbal', 4, { field: 1 }), dungeon = actor('dungeon', 'balbal', -6, { floorY: -12 }, false);
  const dying = actor('dying', 'balbal', 9, {}), eagle = actor('eagle', 'eagle', 20, {}, false), horse = actor('horse', 'horse', 1, {}, false);
  const animals: Actor[] = [horse, rising, dungeon, dying, eagle];
  const lit = crack(rising); lit.color = new DiagnosticColor().copy(lit.color);
  Object.defineProperty(ctx.game, 'runtime', { value: { world: { registry: new WorldRegistry(), player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, game: { camera } },
    play: { animals: { animals } } } });
  const systems: Parameters<typeof ctx.system>[0][] = [];
  const install = vi.spyOn(ctx, 'system').mockImplementation(row => { systems.push(row); });
  setTerrainHeight(ground);
  // One diagnostic instant per displayed frame: extra observer reads do not
  // spend a fake CPU budget. Separate ViewLane tests own adaptive cadence.
  let elapsed = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  try {
    installViewProgram(ctx, feature, module);
    const system = systems[0]; if (system === undefined) throw new Error('Missing creature views');
    expect(system.id).toBe('shard.nalati-grasslands.creature-views'); expect(system.phase).toBe('update');
    const refs = new Map<Actor, Ref>(animals.map(a => [a, { deathT: -1, deadT: 0 }]));
    let t = 0;
    for (let frame = 0; frame < 90; frame++) {
      const dt = frame % 3 === 0 ? 1 / 30 : 1 / 60;
      // the brain's memory moves: the rising warrior's think writes its rise, attacks swing, one warrior falls, the eagle flies
      if (frame === 2) rising.mem['rise'] = 0;
      if (frame > 2) rising.mem['rise'] = Math.min(1, (rising.mem['rise'] ?? 0) + dt / 1.6);
      rising.attackPhase = frame > 40 ? ((frame - 40) * .02) % 1 : -1; dying.attackPhase = frame < 20 ? frame * .05 : -1;
      if (frame === 25) dying.alive = false;
      if (frame === 3) dungeon.mesh.add(Object.assign(new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: 0xff7519 })), { name: 'balbal-cracks' }));
      if (frame >= 5) eagle.mem['altY'] = 40 + Math.sin(frame * .1) * 3;
      if (frame === 60) { eagle.mem['altY'] = 31; eagle.mem['altS'] = 31; refs.set(eagle, { deathT: -1, deadT: 0, altS: 31 }); }
      t += dt; elapsed += .05; system.run(dt, t);
      for (const a of [rising, dungeon, dying, eagle]) {
        const ref = refs.get(a); if (ref === undefined) throw new Error('Missing reference');
        const want = original(a, ref, t, dt);
        expect(a.yOffset).toBeCloseTo(want.yOffset, 9);
        if (a.kind === 'balbal' && (a !== dungeon || frame >= 3)) {
          const color = crack(a).color;
          for (const [i, value] of [color.r, color.g, color.b].entries()) expect(value).toBeCloseTo(([1, .46, .1][i] ?? 0) * want.glow, 9);
        }
      }
    }
    expect(dying.yOffset).toBeLessThan(0); expect(horse.yOffset).toBe(0);
  } finally { clock.mockRestore(); install.mockRestore(); scope.dispose(); setTerrainHeight(() => 0); }
});
