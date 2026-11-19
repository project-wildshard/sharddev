import * as THREE from 'three';
import { expect, test } from 'vitest';
import { lowerShard } from './lower';
import { sceneShardfile } from './shardfile';
import { fire } from './fire';

// MOSSGATE-ZONE MZ7 (QA 11-19 row 29, Jake: "Flame effect here is dog shit"): the sdk's fire lives in a panel part (a
// brazier's flames show once its letter burns), so it is meshes in graph materials that move themselves, never sprites,
// points, lights or tile motion a panel cannot carry.
test('a fire lowers in a panel part as additive, self-animating graph meshes', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('uses', (part) => { const at = new THREE.Object3D(); at.position.set(2, 1.7, -4); part.add(at); world.interact('s.light-a', at, { label: 'Light', radius: 2.5, sets: { field: 's.brazier-a', scope: 'shared', value: true } }); });
    world.part('flame-a', (part) => { const f = fire({ size: 1, seed: 3 }); f.position.set(2, 1.1, -4); part.add(f); }, { panel: 's.flame-a', shownWhen: { field: 's.brazier-a', equals: true } });
  });
  const part = scene.parts.find((p) => p.name === 'flame-a');
  expect(part?.panel).toBe('s.flame-a');
  expect(part?.sprites).toHaveLength(0); expect(part?.points).toHaveLength(0); expect(part?.lights).toHaveLength(0);
  const graphs = (part?.draws ?? []).map((d) => scene.materials[d.material]?.entry).filter((e): e is NonNullable<typeof e> => e !== null && e !== undefined);
  expect(graphs.length).toBe(part?.draws.length);
  const effects = graphs.map((e) => (e as { graph?: { effectState?: { blend?: string; depthWrite?: boolean } } }).graph?.effectState);
  expect(effects.filter((e) => e?.blend === 'additive').length).toBeGreaterThan(0);
  expect(effects.every((e) => e?.depthWrite === false)).toBe(true);
  // the flames read the graph clock: they move with no tile motion
  expect(graphs.every((e) => JSON.stringify(e).includes('"time"'))).toBe(true);
  const { shard } = sceneShardfile(scene);
  expect(shard.props?.panels.map((p) => p.id)).toEqual(['s.flame-a']);
});

test('a fire seats on its origin: no card dips under the coals by more than its sink', () => {
  const f = fire({ size: 1 });
  f.updateMatrixWorld(true);
  let low = Infinity;
  f.traverse((o) => { const g = (o as { geometry?: { attributes: { position: { getY: (i: number) => number; count: number } } } }).geometry; if (g === undefined) return; for (let i = 0; i < g.attributes.position.count; i++) low = Math.min(low, g.attributes.position.getY(i)); });
  expect(low).toBeGreaterThanOrEqual(-0.05);
});
