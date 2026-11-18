// ONE-FORMAT CC24: world.creature compiles a three.js Group of named bones to a GLB rig, its skin and the species and
// look rows that name them; the shard file carries both files and the rows check.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { commonCreature } from '@wildshard/kit/creatures';
import { prepareAssetDecoders } from '@wildshard/format/shardfileAssets';
import { shardfileRules } from '@wildshard/format/shardSchema';
import { validateSkinAssets } from '@wildshard/format/skinAssets';
import { creatureNumbers } from '../creatureCaps';
import { lowerShard } from './lower';
import { sceneShardfile } from './shardfile';
import type { CreatureWorldOptions } from './worldCreature';

// The kit boar's sim rows, without its strikes and harvest (they name strikes and items the shard declares).
const { species: { id: _id, body: _body, abilities: _abilities, harvest: _harvest, ...species } } = commonCreature('boar', { id: 'fixture.unused', look: 'fixture.unused.look' });

/** A 3-bone (body, head, tail), 2-clip creature: one mesh on the body. */
function body(bones = 3): THREE.Group {
  const root = new THREE.Group(); root.name = 'critter';
  let parent: THREE.Object3D = root;
  for (let index = 0; index < bones; index++) {
    const bone = new THREE.Group(); bone.name = ['body', 'head', 'tail'][index] ?? `b${index}`; bone.position.set(0, index === 0 ? 0.5 : 0, index === 0 ? 0 : 0.3);
    parent.add(bone); parent = bone;
  }
  root.children[0]?.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), new THREE.MeshStandardMaterial()));
  return root;
}
const clips = ['idle', 'walk'].map(name => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995])]));
const OPTIONS: CreatureWorldOptions = { species, size: 'small', clips, loops: ['idle', 'walk'], material: { family: 'pbr', vertexColours: true },
  volumes: [{ part: 'head', bone: 'head', shape: 'sphere', radius: 0.2, halfLength: 0, axis: 'y', multiplier: 2 }] };

test('a 3-bone, 2-clip creature compiles, passes skin admission and its rows check', async () => {
  await prepareAssetDecoders();
  const scene = lowerShard({ slug: 'critters', name: 'Critters' }, (world) => {
    world.spawn(0, 0, 0);
    world.creature('critters.critter', body(), OPTIONS);
    const den = new THREE.Object3D(); den.position.set(20, 0, 20); world.scene.add(den);
    const variant = species.variants[0]?.id ?? 'boar';
    world.spawnAt('critters.one', den, { species: 'critters.critter', variant, brain: null, strike: null, seed: 1, scale: 1 });
  });
  expect(scene.creatures?.map(c => [c.id, c.bones, c.triangles])).toEqual([['critters.critter', 3, 12]]);
  const { shard, assets } = sceneShardfile(scene);
  const row = shard.rows.species.find(entry => entry.id === 'critters.critter');
  expect(row?.body).toEqual({ size: 'small', scale: 1, look: 'critters.critter.look', volumes: OPTIONS.volumes });
  const look = shard.rows.looks.find(entry => entry.id === 'critters.critter.look');
  expect(look?.recipe).toBe('platform.skin');
  const skin = String(look?.parameters['skin']);
  expect(shard.library).toContain(skin);
  expect(() => { validateSkinAssets(shard, assets); }).not.toThrow();
  expect(shardfileRules(shard)).toEqual([]);
  expect(creatureNumbers(shard, assets)).toEqual([{ species: 'critters.critter', size: 'small', bones: 3, volumes: 1, triangles: 12, decodedBytes: expect.any(Number) }]);
});

test('world.creature refuses a body in the scene, a rig over 64 bones and a socket that is no bone', () => {
  expect(() => lowerShard({ slug: 'c', name: 'c' }, (world) => { const b = body(); world.scene.add(b); world.creature('c.x', b, OPTIONS); }))
    .toThrow('a creature body hangs in the scene');
  expect(() => lowerShard({ slug: 'c', name: 'c' }, (world) => { world.creature('c.x', body(65), { ...OPTIONS, sockets: ['body', 'head'] }); }))
    .toThrow('a creature has 65 bones, over the cap of 64');
  expect(() => lowerShard({ slug: 'c', name: 'c' }, (world) => { world.creature('c.x', body(40), OPTIONS); }))
    .toThrow('a creature names 40 sockets, over the 32 a skin holds');
  expect(() => lowerShard({ slug: 'c', name: 'c' }, (world) => { world.creature('c.x', body(), { ...OPTIONS, sockets: ['wing'] }); }))
    .toThrow('socket wing is not a bone of the rig');
  expect(() => lowerShard({ slug: 'c', name: 'c' }, (world) => { world.creature('c.x', body(), OPTIONS); world.creature('c.x', body(), OPTIONS); }))
    .toThrow('two creatures share this id');
});
