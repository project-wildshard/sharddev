// ONE-FORMAT OF27a: a rigged-hull body becomes a kit-skeleton GLB look. Pine's deer and Nalati's wolf rigs (their
// phone `*.rigged.glb`, copied from shard-pine-hollow 1c829c0 and shard-nalati 3ce897a) already name the kit quadruped's
// bones; the step keeps every vertex and weight, writes the skin file and the species and look rows, and the shard
// file admits them.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the two rig fixtures.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { commonCreature } from '@wildshard/kit/creatures';
import { prepareAssetDecoders } from '@wildshard/format/shardfileAssets';
import { shardfileRules } from '@wildshard/format/shardSchema';
import { validateSkinAssets } from '@wildshard/format/skinAssets';
import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons';
import { lowerShard } from '../scene/lower';
import { sceneShardfile } from '../scene/shardfile';
import { hullCreature, type HullCreatureOptions } from './hullLook';

const rig = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../../test/fixtures/hulls/${name}`, import.meta.url)));
const { species: { id: _id, body: _body, abilities: _abilities, harvest: _harvest, ...species } } = commonCreature('boar', { id: 'fixture.unused', look: 'fixture.unused.look' });
const OPTIONS: HullCreatureOptions = { species, size: 'medium', skeleton: 'quadruped', material: { family: 'pbr', vertexColours: false } };
const quadruped = CREATURE_SKELETONS.quadruped;
const kitBones = [quadruped.root, ...Object.values(quadruped.chains).flatMap(chain => chain.bones)];

test.each([['pine.deer', 'pine-deer-stag.phone.rigged.glb', 20], ['nalati.wolf', 'nalati-wolf.phone.rigged.glb', 22]] as const)(
  '%s: the hull rig becomes a kit quadruped skin look the shard file admits', async (id, file, bones) => {
    await prepareAssetDecoders();
    const creature = await hullCreature(id, rig(file), OPTIONS);
    expect(creature.bones).toBe(bones);
    expect(creature.triangles).toBeGreaterThan(1000);
    expect(creature.species.body).toEqual({ size: 'medium', scale: 1, look: `${id}.look`, skeleton: 'quadruped' });
    expect(creature.look).toMatchObject({ id: `${id}.look`, species: id, recipe: 'platform.skin' });
    const skin = JSON.parse(new TextDecoder().decode(creature.skin)) as { row: { rig: { joints: string[][]; sockets: string[] } } };
    expect(skin.row.rig.joints[0]).toEqual(expect.arrayContaining(kitBones));
    const scene = lowerShard({ slug: 'hulls', name: 'Hulls' }, (world) => {
      world.spawn(0, 0, 0);
      const den = new THREE.Object3D(); den.position.set(20, 0, 20); world.scene.add(den);
      world.spawnAt('hulls.one', den, { species: id, variant: species.variants[0]?.id ?? '', brain: null, strike: null, seed: 1, scale: 1 });
    });
    const { shard, assets } = sceneShardfile({ ...scene, creatures: [creature] });
    expect(shard.library).toContain(String(creature.look.parameters['skin']));
    expect(() => { validateSkinAssets(shard, assets); }).not.toThrow();
    expect(shardfileRules(shard)).toEqual([]);
  });

test('a rig with a bone outside the kit chains names it; a custom map renames source bones', async () => {
  await expect(hullCreature('pine.deer', rig('pine-deer-stag.phone.rigged.glb'), { ...OPTIONS, skeleton: 'biped' })).rejects.toThrow(/chain/u);
  const map = { root: 'body', chains: Object.fromEntries(Object.entries(quadruped.chains).map(([key, chain]) => [key, chain.bones])) };
  const creature = await hullCreature('pine.deer', rig('pine-deer-stag.phone.rigged.glb'), { ...OPTIONS, map });
  expect(creature.bones).toBe(20);
});
