import * as THREE from 'three';
import { expect, test } from 'vitest';
import { solid, type PartOptions } from './author';
import { lowerShard, SceneRefusalError } from './lower';
import { sceneShardfile } from './shardfile';

// SHARD-SOURCE SS-GF2a: a mover panel part (Glowfen's raft at the jetty) lowers to one format `movers` row: a native
// platform on a track driver started by standing on it, its rest at the part's bounds, its deck the mover's box, its keys
// spaced by distance, and no static collider; its GLB is the props panel every page poses with it.
const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 0.9 });
const raft = (part: THREE.Group): void => { const deck = solid(new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 2), wood)); deck.position.set(10, 0.2, -4); part.add(deck); };
const channel = lowerShard({ slug: 'gf2a', name: 'GF2a' }, (world) => {
  world.part('raft', raft, { panel: 'fen.raft', mover: { path: [[10, 0.2, 26], [40, 0.2, 26]], seconds: 30 } });
});

test('a mover part lowers to a native stand-started track mover with its deck as the box, and no static collider', () => {
  const { shard } = sceneShardfile(channel);
  expect(shard.props?.panels.map((p) => p.id)).toEqual(['fen.raft']);
  expect(shard.props?.colliders.some((c) => c.panel === 'fen.raft')).toBe(false);
  expect(shard.movers).toHaveLength(1);
  const [row] = shard.movers;
  expect(row).toMatchObject({
    id: 'fen.raft', entity: 9101, kind: 'platform', execution: 'native', enabled: true, at: { x: 10, y: 0.2, z: -4 },
    boxes: [{ x: 0, y: 0, z: 0, hx: 1.5, hy: 0.2, hz: 1, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    driver: { kind: 'track' }, trigger: { kind: 'stand', delay: 0 },
    // 30 m then 30 m: half the time each
    track: { clip: 'ride', duration: 30, loop: 'pingpong', speed: 1, times: [0, 15, 30], position: [[10, 0.2, -4], [10, 0.2, 26], [40, 0.2, 26]] },
  });
});

test('an always mover that runs once keeps its options', () => {
  const ferry = lowerShard({ slug: 'f', name: 'F' }, (world) => {
    world.part('ferry', raft, { panel: 'fen.ferry', mover: { path: [[10, 0.2, 6]], seconds: 5, start: 'always', loop: 'once' } });
  });
  const [row] = sceneShardfile(ferry).shard.movers;
  expect(row).toMatchObject({ trigger: { kind: 'always' }, track: { loop: 'once', times: [0, 5] } });
});

test('a mover part that is not a panel, is touchable too, has no solid or a bad path refuses by name', () => {
  const build = (options: PartOptions, fill = raft) =>
    () => lowerShard({ slug: 's', name: 's' }, (world) => { world.part('raft', fill, options); });
  expect(build({ mover: { path: [[0, 0, 1]], seconds: 3 } })).toThrow(/a mover part is a panel/u);
  expect(build({ panel: 'r.a', mover: { path: [[0, 0, 1]], seconds: 3 }, touchable: { material: 'wood' } })).toThrow(/mover or touchable/u);
  expect(build({ panel: 'r.a', mover: { path: [[0, 0, 1]], seconds: 3 } }, (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), wood)); })).toThrow(/no solid to stand on/u);
  expect(build({ panel: 'r.a', mover: { path: [], seconds: 3 } })).toThrow(/0 points/u);
  expect(build({ panel: 'r.a', mover: { path: [[400, 0, 0]], seconds: 3 } })).toThrow(/leaves the 500 m cell/u);
  expect(build({ panel: 'r.a', mover: { path: [[1, 1, 1]], seconds: 0 } })).toThrow(SceneRefusalError);
});
