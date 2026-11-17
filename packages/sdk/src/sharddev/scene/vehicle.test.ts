import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseMovers } from '@wildshard/format/movers';
import { solid, type PartOptions } from './author';
import { lowerShard, SceneRefusalError } from './lower';
import { sceneShardfile } from './shardfile';

// SHARD-SOURCE SS-MS2a4: a vehicle panel part (Mirror Salt's land-sail) lowers to one format `movers` row: a native carry
// `channel` with a `steer` driver, its rest the base centre of its bounds facing its heading, a board prompt beside it and a
// leave prompt at the seat, both in its own frame, a landing beside it, the wind push, and no collider.
const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 0.9 });
const sail = (part: THREE.Group): void => { const hull = solid(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 3.6), wood)); hull.position.set(-6, 0.45, 20); part.add(hull); };
const options: PartOptions = { panel: 'salt.sail', vehicle: { speed: 9, heading: 0, wind: { toward: [0.8, -0.6], push: 4 }, board: 'Board the land-sail', leave: 'Leave the land-sail' } };

test('a vehicle part lowers to a native steer carry that the format admits, with no collider', () => {
  const { shard } = sceneShardfile(lowerShard({ slug: 'ms2a4', name: 'MS2a4' }, (world) => { world.part('sail', sail, options); }));
  expect(shard.props?.panels.map((p) => p.id)).toEqual(['salt.sail']);
  expect(shard.props?.colliders.some((c) => c.panel === 'salt.sail')).toBe(false);
  const [row] = parseMovers(shard.movers);
  expect(row).toMatchObject({
    id: 'salt.sail', entity: 9101, kind: 'channel', execution: 'native', at: { x: -6, y: 0.2, z: 20 }, euler: { x: 0, y: 0, z: 0 }, boxes: [],
    trigger: { kind: 'interact', permission: 0 },
    driver: { kind: 'steer', speed: 9, turn: 1.2, boost: 1.5, accel: 6, ground: false, wind: { toward: [0.8, -0.6], push: 4 } },
    carry: { seat: 0.8, landings: [[1.6, 0, 0], [-1.6, 0, 0]], prompts: [{ at: [0, 1, 0], radius: 3.8, label: 'Board the land-sail' }, { at: [0, 2, 0], radius: 2, label: 'Leave the land-sail' }] },
  });
});

test('a vehicle built turned faces its heading, and its footprint turns with it', () => {
  const turned = (part: THREE.Group): void => { const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 1.2), wood); hull.position.set(0, 0.45, 0); part.add(hull); };
  const { shard } = sceneShardfile(lowerShard({ slug: 't', name: 'T' }, (world) => { world.part('sail', turned, { panel: 'salt.sail', vehicle: { speed: 5, heading: Math.PI / 2 } }); }));
  const [row] = parseMovers(shard.movers);
  expect(row?.euler.y).toBeCloseTo(Math.PI / 2, 4);
  expect(row?.carry?.landings[0][0]).toBeCloseTo(1.6, 4); // across its heading it is 1.2 m wide
  expect(row?.carry?.prompts.map((p) => p.label)).toEqual(['Board', 'Leave']);
});

test('a track mover and a vehicle take their own entities', () => {
  const { shard } = sceneShardfile(lowerShard({ slug: 'two', name: 'Two' }, (world) => {
    world.part('sail', sail, options);
    world.part('raft', (part) => { const deck = solid(new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 2), wood)); deck.position.set(10, 0.2, -4); part.add(deck); },
      { panel: 'fen.raft', mover: { path: [[10, 0.2, 26]], seconds: 30 } });
  }));
  expect(shard.movers.map((m) => [m.id, m.entity])).toEqual([['fen.raft', 9101], ['salt.sail', 9102]]);
});

test('a vehicle needs a panel and no mover, and its numbers stay in the format range', () => {
  const refuse = (opts: PartOptions, why: RegExp): void => {
    expect(() => lowerShard({ slug: 'r', name: 'R' }, (world) => { world.part('sail', sail, opts); })).toThrow(SceneRefusalError);
    expect(() => lowerShard({ slug: 'r', name: 'R' }, (world) => { world.part('sail', sail, opts); })).toThrow(why);
  };
  refuse({ vehicle: { speed: 9 } }, /a vehicle part is a panel/u);
  refuse({ panel: 'salt.sail', vehicle: { speed: 9 }, mover: { path: [[0, 0, 1]], seconds: 1 } }, /not touchable or a mover/u);
  refuse({ panel: 'salt.sail', vehicle: { speed: 90 } }, /speed 90 is outside/u);
  refuse({ panel: 'salt.sail', vehicle: { speed: 9, boost: 5 } }, /boost 5 is outside/u);
  refuse({ panel: 'salt.sail', vehicle: { speed: 9, wind: { toward: [0, 0], push: 3 } } }, /blows toward no direction/u);
  refuse({ panel: 'salt.sail', vehicle: { speed: 9, wind: { toward: [1, 0], push: 30 } } }, /wind push 30 is outside/u);
});
