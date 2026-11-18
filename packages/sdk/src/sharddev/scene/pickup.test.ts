import * as THREE from 'three';
import { expect, test } from 'vitest';
import type { ShardWorld } from './author';
import { lowerShard } from './lower';
import { SceneRefusalError } from './refusal';
import type { ShardScene } from './description';
import { compileScript } from '../bake/compileScript';
import { builtSceneShardfile, type ShardfileOptions } from './shardfile';

// SHARD-SOURCE SS-GF1a1b: a lantern on a stand. `world.pickup` writes the tool (a `kit.lantern` the loadout does not carry,
// so an engine with SS-GF1a1a starts it on its stand), the take's scene and `itemActions` row (action 3, its flag), and the
// tool's fuel and light as owner fields projected by `itemFields`, under the generated state lane.
const lantern = { id: 'tool.spirit-lantern', name: 'Spirit lantern', colour: '#9fd8ff', intensity: 3, fuelSeconds: 600 } as const;
const stands = (world: ShardWorld): void => {
  world.ground(() => 0);
  world.spawn(0, 0, 4);
  world.part('stands', (part) => {
    for (const [i, x] of [-4, 4].entries()) {
      const hook = new THREE.Object3D(); hook.position.set(x, 1.2, 0); part.add(hook);
      world.pickup(`lantern.${String(i + 1)}`, hook, { label: 'Take the spirit lantern', radius: 2, item: lantern, flag: `glowfen.lantern.${String(i + 1)}` });
    }
  });
};
const built = (input: ShardScene, options?: ShardfileOptions) => builtSceneShardfile(input, compileScript, options);

test('a pickup writes its tool, take, flag and projected fields, and the shard parses', async () => {
  const { shard } = await built(lowerShard({ slug: 'ss-gf1a1b', name: 'SS-GF1a1b' }, stands));
  const tool = shard.items.rows.find((row) => row.id === lantern.id);
  expect(tool).toEqual({ id: 'tool.spirit-lantern', kind: 'tool', family: 'kit.lantern', ui: { name: 'Spirit lantern', icon: 'glyph', swapIcon: '', blurb: 'Spirit lantern' },
    view: { recipe: 'kit.lantern', colour: '#9fd8ff', position: [-0.3, -0.3, -0.55], rotation: [0, 0, 0] }, hook: null, action: 'spirit-lantern.light', fuelSeconds: 600, intensity: 3 });
  expect(shard.items.rows).toHaveLength(2); // the starter sword and the one lantern both stands hand over
  expect(shard.items.loadout.tools).toEqual([]); // on its stand, not in the loadout
  expect(shard.state.player).toEqual([
    { id: 6001, name: 'spirit-lantern.fuel', type: 'f64', privacy: 'owner', default: 1, min: 0, max: 1 },
    { id: 6002, name: 'spirit-lantern.lit', type: 'bool', privacy: 'owner', default: false },
  ]);
  expect(shard.targets.itemFields).toEqual([{ item: lantern.id, fieldId: 6001, property: 'fuel' }, { item: lantern.id, fieldId: 6002, property: 'lit' }]);
  expect(shard.hooks.scenes).toEqual([{ id: 'lantern.1', type: 6001, value: 3 }, { id: 'lantern.2', type: 6002, value: 3 }]);
  expect(shard.targets.itemActions).toEqual([
    { scene: 'lantern.1', item: lantern.id, action: 3, setsFlag: 'glowfen.lantern.1' }, { scene: 'lantern.2', item: lantern.id, action: 3, setsFlag: 'glowfen.lantern.2' },
  ]);
  expect(shard.targets.interactions.map((row) => [row.id, row.scene, row.at])).toEqual([['lantern.1', 'lantern.1', [-4, 1.2, 0]], ['lantern.2', 'lantern.2', [4, 1.2, 0]]]);
  expect(shard.quests.flags).toEqual(['glowfen.lantern.1', 'glowfen.lantern.2']);
  expect(shard.sim.scripts).toHaveLength(1); // item projections need a state lane
});

test('pickups refuse a bad tool, one tool with two specs, and a tool extend declares', async () => {
  const at = (world: ShardWorld): THREE.Object3D => { const node = new THREE.Object3D(); world.scene.add(node); return node; };
  const refused = (build: (world: ShardWorld) => void): string => {
    try { lowerShard({ slug: 'bad', name: 'Bad' }, build); } catch (error) { if (error instanceof SceneRefusalError) return error.message; throw error; }
    return 'no refusal';
  };
  expect(refused((world) => { world.pickup('a', at(world), { label: 'Take', radius: 2, item: { id: 'tool.Bad' as `tool.${string}`, name: 'x' } }); })).toMatch(/not a tool id/u);
  expect(refused((world) => { world.pickup('a', at(world), { label: 'Take', radius: 2, item: { ...lantern, intensity: 11 } }); })).toMatch(/intensity 11/u);
  expect(refused((world) => {
    world.pickup('a', at(world), { label: 'Take', radius: 2, item: lantern });
    world.pickup('b', at(world), { label: 'Take', radius: 2, item: { ...lantern, intensity: 1 } });
  })).toMatch(/other options/u);
  expect(refused((world) => {
    world.interact('a', at(world), { label: 'Use', radius: 2, scene: 'x' });
    world.pickup('a', at(world), { label: 'Take', radius: 2, item: lantern });
  })).toMatch(/two interacts share/u);
  const scene = lowerShard({ slug: 'clash', name: 'Clash' }, stands);
  await expect(built(scene, { extend: (shard) => ({ ...shard, items: { ...shard.items, rows: [...shard.items.rows, { ...shard.items.rows[0], id: lantern.id } as never] } }) })).rejects.toThrow(/extend declares item tool.spirit-lantern/u);
});
