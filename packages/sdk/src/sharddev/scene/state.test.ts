// oxlint-disable-next-line import/no-nodejs-modules -- The sim proof loads the engine's shipped physics bytes.
import { readFileSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the physics package beside the engine.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the engine's own install.
import { resolve } from 'node:path';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadRapier } from '@wildshard/engine/physics/rapier';
import { createShardfileSim } from '@wildshard/engine/game/plugin/simulation';
import { solid, type ShardWorld } from './author';
import { lowerShard } from './lower';
import { SceneRefusalError } from './refusal';
import type { ShardScene } from './description';
import { compileScript } from '../bake/compileScript';
import { builtSceneShardfile, type ShardfileOptions } from './shardfile';

// SHARD-SOURCE SS-GF0: a scene shard sets a state field without the author writing a script. A use prompt's `sets` writes
// the field; a panel's `shownWhen` shows it while the field holds. The sdk declares the fields, a hooks scene per use, a
// targets panel per shown panel, and one generated ABI v0 module bound as the shard's server script.
const stone = new THREE.MeshStandardMaterial({ color: '#77736a', roughness: 0.9 });
const flame = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff8a1c' });
const shrine = (world: ShardWorld): void => {
  world.ground(() => 0);
  world.spawn(0, 0, 4);
  world.part('altar', (part) => {
    const altar = solid(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), stone)); altar.position.set(0, 0.5, 0); part.add(altar);
    const bowl = new THREE.Object3D(); bowl.name = 'bowl'; bowl.position.set(0, 1.2, 0); part.add(bowl);
    world.interact('shrine.light', bowl, { label: 'Light the shrine', radius: 3, sets: { field: 'shrine.lit', scope: 'shared', value: true } });
    const step = new THREE.Object3D(); step.position.set(2, 1, 0); part.add(step);
    world.interact('shrine.offer', step, { label: 'Leave a lantern', radius: 3, sets: { field: 'shrine.lanterns', scope: 'shared', add: 1, max: 3 } });
    const mark = new THREE.Object3D(); mark.position.set(-2, 1, 0); part.add(mark);
    world.interact('shrine.mark', mark, { label: 'Touch the stone', radius: 3, unless: 'shrine.mark.spent', sets: { field: 'shrine.touched', scope: 'player', value: true } });
  });
  world.part('flame', (part) => {
    const fire = solid(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), flame)); fire.position.set(0, 1.5, 0); part.add(fire);
  }, { panel: 'shrine.flame', shownWhen: { field: 'shrine.lit', equals: true } });
  world.part('socket', (part) => {
    part.add(solid(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), flame)).translateX(-2));
  }, { panel: 'shrine.socket', shownWhen: { field: 'shrine.touched', equals: true } });
  world.part('third', (part) => {
    part.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), flame).translateY(2.5));
  }, { panel: 'shrine.third', shownWhen: { field: 'shrine.lanterns', equals: 3 } });
};
const scene = lowerShard({ slug: 'ss-gf0', name: 'SS-GF0' }, shrine);
// the build hands the compiler in (`ctx.compileScript`): an author bundle never imports it
const built = (input: ShardScene, options?: ShardfileOptions) => builtSceneShardfile(input, compileScript, options);

test('sets and shownWhen write the state, hooks, targets and one generated server script', async () => {
  const { shard, assets } = await built(scene);
  expect(shard.state.shared).toEqual([
    { id: 6001, name: 'shrine.lit', type: 'bool', privacy: 'public', default: false },
    { id: 6002, name: 'shrine.lanterns', type: 'i32', privacy: 'public', default: 0, min: 0, max: 3 },
  ]);
  expect(shard.state.player).toEqual([{ id: 6003, name: 'shrine.touched', type: 'bool', privacy: 'owner', default: false }]);
  expect(shard.hooks.scenes).toEqual([
    { id: 'shrine.light', type: 6001, value: 1 }, { id: 'shrine.offer', type: 6002, value: 1 }, { id: 'shrine.mark', type: 6003, value: 1 },
  ]);
  // Shared uses auto-spend. The stone opts in to a spent condition scoped to the player who used it.
  expect(shard.hooks.conditions).toEqual([
    { id: 'shrine.light.spent', scope: 'shared', fieldId: 6001, equals: 1 }, { id: 'shrine.offer.spent', scope: 'shared', fieldId: 6002, equals: 3 },
    { id: 'shrine.mark.spent', scope: 'player', fieldId: 6003, equals: 1 },
  ]);
  expect(shard.targets.interactions.map((row) => [row.id, row.scene, row.unless])).toEqual([
    ['shrine.light', 'shrine.light', 'shrine.light.spent'], ['shrine.offer', 'shrine.offer', 'shrine.offer.spent'], ['shrine.mark', 'shrine.mark', 'shrine.mark.spent'],
  ]);
  expect(shard.targets.panels).toEqual([
    { panel: 'shrine.flame', scope: 'shared', fieldId: 6001, equals: 1, visibleWhenMatched: true, colliders: ['shrine.flame'], activeWhenMatched: true },
    // SS-GF1a2: a player's socket shows by their own field and is never the one shared collider
    { panel: 'shrine.socket', scope: 'player', fieldId: 6003, equals: 1, visibleWhenMatched: true, colliders: [], activeWhenMatched: true },
    { panel: 'shrine.third', scope: 'shared', fieldId: 6002, equals: 3, visibleWhenMatched: true, colliders: [], activeWhenMatched: true },
  ]);
  const [module] = shard.sim.scripts;
  if (module === undefined) throw new Error('no generated script');
  expect(shard.sim.scripts).toHaveLength(1);
  expect(shard.sim.bindings).toEqual([{ module, entity: 1106943697, actorId: 'actor.player', kind: 'server' }]);
  // the socket is the player's alone: no collider stands for it (review MUST-FIX); the shared flame keeps its own
  expect(shard.props?.colliders.map((c) => c.id)).toContain('shrine.flame');
  expect(shard.props?.colliders.map((c) => c.id)).not.toContain('shrine.socket');
  expect(shard.files.find((f) => f.hash === module)).toMatchObject({ kind: 'wasm', critical: true });
  expect(shard.critical).toContain(module);
  expect(assets.get(module)?.length).toBeGreaterThan(0);
});

test('a scene with no sets has no generated script', async () => {
  const plain = lowerShard({ slug: 'plain', name: 'Plain' }, (world) => { world.ground(() => 0); });
  const { shard } = await built(plain);
  expect(shard.sim.scripts).toEqual([]);
  expect(shard.state.shared).toEqual([]);
});

test('bad sets and shownWhen refuse by name', () => {
  const build = (fill: (world: ShardWorld) => void) => () => lowerShard({ slug: 'r', name: 'R' }, (world) => {
    world.part('a', (part) => { const node = new THREE.Object3D(); part.add(node); fill({ ...world, interact: (id, _at, options) => { world.interact(id, node, options); } }); });
  });
  const node = new THREE.Object3D();
  expect(build((w) => { w.interact('a.b', node, { label: 'x', radius: 2 }); })).toThrow(/needs a scene or sets/u);
  expect(build((w) => { w.interact('a.b', node, { label: 'x', radius: 2, scene: 'a.b', sets: { field: 'f.x', scope: 'shared', value: true } }); })).toThrow(/scene or sets, not both/u);
  expect(build((w) => { w.interact('a.b', node, { label: 'x', radius: 2, sets: { field: 'Bad', scope: 'shared', value: true } }); })).toThrow(/not a state field name/u);
  expect(build((w) => {
    w.interact('a.b', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', value: true } });
    w.interact('a.c', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'player', value: true } });
  })).toThrow(/one scope/u);
  expect(build((w) => {
    w.interact('a.b', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', value: true } });
    w.interact('a.c', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', add: 1, max: 2 } });
  })).toThrow(/true or false, or numbers/u);
  expect(build((w) => { w.interact('a.b', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', value: 1.5 } }); })).toThrow(/whole number/u);
  expect(build((w) => { w.interact('a.b', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', add: 1, max: 0 } }); })).toThrow(/max/u);
  const shown = (options: Parameters<ShardWorld['part']>[2]) => () => lowerShard({ slug: 's', name: 'S' }, (world) => {
    world.part('a', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), stone)); }, options);
  });
  expect(shown({ shownWhen: { field: 'f.x', equals: true } })).toThrow(/a shown part is a panel/u);
  expect(shown({ panel: 'p.a', shownWhen: { field: 'f.x', equals: true } })).toThrow(/no use prompt sets f.x/u);
  expect(shown({ panel: 'p.a', shownWhen: { field: 'f.x', equals: true }, touchable: { material: 'wood' } })).toThrow(/not touchable or a mover/u);
  expect(build((w) => {
    w.interact('a.b', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', add: 1, max: 3 } });
    w.interact('a.c', node, { label: 'x', radius: 2, sets: { field: 'f.x', scope: 'shared', add: 1, max: 5 } });
  })).toThrow(/same max/u);
});

test('extend keeps its own state, hooks and scripts beside the generated ones, and a clash refuses', async () => {
  const { shard } = await built(scene, { extend: (base) => ({ ...base, state: { ...base.state, shared: [{ id: 6001, name: 'mine', type: 'bool', privacy: 'public', default: false }] } }) });
  expect(shard.state.shared.map((f) => [f.id, f.name])).toEqual([[6001, 'mine'], [6002, 'shrine.lit'], [6003, 'shrine.lanterns']]);
  await expect(built(scene, { extend: (base) => ({ ...base, state: { ...base.state, shared: [{ id: 9, name: 'shrine.lit', type: 'bool', privacy: 'public', default: false }] } }) }))
    .rejects.toThrow(SceneRefusalError);
});

// The engine's own Rapier, beside the engine (pnpm links it there, not into this repo's node_modules).
function physicsBytes(): Uint8Array {
  const require = createRequire(resolve(realpathSync(resolve('node_modules/@wildshard/engine')), 'package.json'));
  return Uint8Array.from(readFileSync(require.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm')));
}

test('on the server, using the prompts raises the shared fields and the panels show', async () => {
  const { shard, assets } = await built(scene);
  const sim = createShardfileSim(shard, assets, { rapier: await loadRapier(physicsBytes()) });
  try {
    const lane = sim.lane, player = sim.host.players.get('actor.player');
    if (lane === undefined || player === undefined) throw new Error('no state lane or player');
    const steps = (n: number): void => { for (let i = 0; i < n; i++) sim.host.step(); };
    const shared = (name: string): number | undefined => lane.world.view('actor.player').shared[name];
    const shows = (panel: string): boolean => {
      const row = shard.targets.panels.find((p) => p.panel === panel); if (row === undefined) throw new Error(`no panel ${panel}`);
      return lane.world.view('actor.player')[row.scope][shard.state[row.scope].find((f) => f.id === row.fieldId)?.name ?? ''] === row.equals;
    };
    const use = (id: string): void => {
      const row = shard.targets.interactions.find((r) => r.id === id); if (row === undefined) throw new Error(`no prompt ${id}`);
      player.position.set(row.at[0], 0.05, row.at[2] + 1.2); player.motor.resetAt(player.position); steps(2);
      expect(sim.selectedInteraction(), id).toBe(id);
      expect(sim.interact(id)).toBe(true);
      steps(6);
    };
    // the flame's collider follows the field on the server: keep what the targets' sync last told it
    const port = sim.colliders.get('shrine.flame'); if (port === undefined) throw new Error('no flame collider');
    let active: boolean | null = null;
    const set = port.setActive.bind(port); port.setActive = (on: boolean): void => { active = on; set(on); };
    steps(10);
    expect(shared('shrine.lit')).toBe(0);
    expect(shows('shrine.flame')).toBe(false);
    expect(active).toBe(false);
    use('shrine.light');
    expect(shared('shrine.lit')).toBe(1);
    expect(shows('shrine.flame')).toBe(true);
    expect(active).toBe(true);
    for (let i = 0; i < 2; i++) use('shrine.offer');
    expect(shared('shrine.lanterns')).toBe(2);
    expect(shows('shrine.third')).toBe(false);
    use('shrine.offer');
    expect(shared('shrine.lanterns')).toBe(3);
    expect(shows('shrine.third')).toBe(true);
    use('shrine.mark');
    expect(lane.world.view('actor.player').player['shrine.touched']).toBe(1);
  } finally { sim.dispose(); }
});
