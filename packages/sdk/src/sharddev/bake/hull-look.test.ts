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
import { resolveSkinLookFiles, validateSkinAssets } from '@wildshard/format/skinAssets';
import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons';
import { lowerShard } from '../scene/lower';
import { sceneShardfile } from '../scene/shardfile';
import { hullCreature, type HullCreatureOptions } from './hullLook';
import { hashImmutableBytes } from '../immutable';

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

// OF27b: the look the hull book drew. Pine's deer wears its hull's base and normal maps, each variant its own skin file in
// the look's variant table (the white stag its baked coat, the ghost its own rim and glow), a flap is pressed at build;
// the shard file admits the textures as the skin files' dependencies.
const pixel = (tag: number): Uint8Array => {
  const bytes = new Uint8Array(readFileSync(new URL('../../../test/fixtures/shard-assets/pixel.ktx2', import.meta.url)));
  bytes[bytes.length - 1] = tag; return bytes;
};
/** The fixture species' first variant under each id. */
function variantsNamed(ids: readonly string[]): unknown[] {
  const rows: unknown[] = [];
  for (const id of ids) rows.push({ ...species.variants[0], id });
  return rows;
}
const DEER_FUR = { roughness: 0.82, sheen: 0.3, sheenColor: [0.45, 0.36, 0.26], envMapIntensity: 0.6, rim: [1.0, 0.72, 0.42] } as const;
const deerSpecies = { ...species, variants: variantsNamed(['stag', 'white-stag', 'ghost']) } as HullCreatureOptions['species'];

test('pine.deer: the hull book look becomes a variant table of skins with maps, coats and fur', async () => {
  await prepareAssetDecoders();
  const [base, normal, white] = [pixel(1), pixel(2), pixel(3)];
  const creature = await hullCreature('pine.deer', rig('pine-deer-stag.phone.rigged.glb'), { species: deerSpecies, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base, normal }, surface: { family: 'pbr', fur: DEER_FUR }, variants: {
      'white-stag': { coat: white },
      ghost: { fur: { rim: [0.55, 0.92, 1.0], emissive: [0.3, 0.62, 0.75], emissiveIntensity: 0.16, sheenColor: [0.6, 0.8, 0.9] } } } } });
  expect(creature.files?.textures).toHaveLength(3);
  expect(creature.files?.skins).toHaveLength(3);
  const material = (bytes: Uint8Array): Record<string, unknown> => (JSON.parse(new TextDecoder().decode(bytes)) as { binding: { material: Record<string, unknown> } }).binding.material;
  expect(material(creature.skin)).toMatchObject({ family: 'pbr', roughness: 0.82, envStrength: 0.6, sheen: { amount: 0.3, roughness: 0.7 }, rim: [1.0, 0.72, 0.42] });
  const scene = lowerShard({ slug: 'hulls', name: 'Hulls' }, (world) => {
    world.spawn(0, 0, 0);
    const den = new THREE.Object3D(); den.position.set(20, 0, 20); world.scene.add(den);
    world.spawnAt('hulls.one', den, { species: 'pine.deer', variant: 'ghost', brain: null, strike: null, seed: 1, scale: 1 });
  });
  const { shard, assets } = sceneShardfile({ ...scene, creatures: [creature] });
  expect(() => { validateSkinAssets(shard, assets); }).not.toThrow();
  expect(shardfileRules(shard)).toEqual([]);
  const resolved = resolveSkinLookFiles(shard, creature.look, assets);
  const coat = (id: string): unknown => (resolved.variants?.get(id)?.binding.material['maps'] as { colour: string } | undefined)?.colour;
  expect(coat('white-stag')).not.toBe(coat('stag'));
  expect(resolved.variants?.get('ghost')?.binding.material['emissive']).toBeDefined();
  // the rig left its embedded images: its maps are the skin's own files
  const doc = JSON.parse(new TextDecoder().decode(creature.glb.subarray(20, 20 + new DataView(creature.glb.buffer, creature.glb.byteOffset).getUint32(12, true)))) as { images?: unknown[] };
  expect(doc.images ?? []).toEqual([]);
});

test('a flap is pressed into the hull at build: positions behind the back plane move, the rest stay', async () => {
  const flat = await hullCreature('pine.deer', rig('pine-deer-stag.phone.rigged.glb'), { species: deerSpecies, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base: pixel(1) }, surface: { family: 'painterly', rim: 0.3, bands: 0.5 } } });
  const pressed = await hullCreature('pine.deer', rig('pine-deer-stag.phone.rigged.glb'), { species: deerSpecies, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base: pixel(1) }, surface: { family: 'painterly', rim: 0.3, bands: 0.5 }, flap: { yMin: 0.9, y0: 1, z0: 0, slope: 0, keep: 0.1, bulge: 0 } } });
  expect(hashImmutableBytes(pressed.glb)).not.toBe(hashImmutableBytes(flat.glb));
  expect(pressed.triangles).toBe(flat.triangles);
});

// OF27b4's board: a painterly hull look over a rig with no COLOR_0 (Nalati's wolf) must not ask for vertex colours. The
// hull book drew such a hull white under its atlas; a painterly surface that reads a missing colour channel draws black.
test('nalati.wolf: a painterly look over a colourless rig draws without vertex colours', async () => {
  await prepareAssetDecoders();
  const wolfSpecies = { ...species, variants: variantsNamed(['grey', 'dark']) } as HullCreatureOptions['species'];
  const creature = await hullCreature('nalati.wolf', rig('nalati-wolf.phone.rigged.glb'), { species: wolfSpecies, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base: pixel(1) }, surface: { family: 'painterly', rim: 0.8, bands: 0.85 }, variants: { dark: { coat: pixel(2) } } } });
  const material = (bytes: Uint8Array): Record<string, unknown> => (JSON.parse(new TextDecoder().decode(bytes)) as { binding: { material: Record<string, unknown> } }).binding.material;
  for (const skin of creature.files?.skins ?? []) expect(material(skin)).toMatchObject({ family: 'painterly', rim: 0.8, bands: 0.85, vertexColours: false });
});

// OF27c: Pine's thrall extras (the hull book's `RiggedHullUrls.parts`, `boar_thrall` of `thrall-extras.glb`; boar rig and
// parts copied from shard-pine-hollow 1c829c0) join the rig as two primitives on its bones, drawn by their own look
// materials: their vertex colour, and the overgrown glow on the glowing half. Every variant of the look carries them.
const BOAR_FUR = { roughness: 0.9, sheen: 0.25, sheenColor: [0.4, 0.33, 0.25], envMapIntensity: 0.5, rim: [0.9, 0.7, 0.45] } as const;
test('pine.boar.thrall: the thrall extras ride the rig as parts with their own look materials', async () => {
  await prepareAssetDecoders();
  const thrall = { ...species, variants: variantsNamed(['thrall']) } as HullCreatureOptions['species'];
  const parts = { glb: rig('pine-thrall-extras.phone.glb'), node: 'boar_thrall' };
  const plain = await hullCreature('pine.boar.thrall', rig('pine-boar.phone.rigged.glb'), { species: thrall, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base: pixel(1) }, surface: { family: 'pbr', fur: BOAR_FUR } } });
  const creature = await hullCreature('pine.boar.thrall', rig('pine-boar.phone.rigged.glb'), { species: thrall, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base: pixel(1) }, surface: { family: 'pbr', fur: BOAR_FUR }, variants: { thrall: { parts } } } });
  expect(creature.triangles).toBeGreaterThan(plain.triangles);
  expect(Object.keys(creature.materials ?? {})).toEqual(['pine.boar.thrall.parts', 'pine.boar.thrall.parts.glow']);
  expect(creature.materials?.['pine.boar.thrall.parts.glow']).toMatchObject({ family: 'pbr', vertexColours: true, emissiveIntensity: expect.closeTo(2.86, 5) });
  const binding = (JSON.parse(new TextDecoder().decode(creature.skin)) as { binding: { materials?: Record<string, string> } }).binding;
  expect(binding.materials).toEqual({ parts: 'pine.boar.thrall.parts', 'parts.glow': 'pine.boar.thrall.parts.glow' });
  const scene = lowerShard({ slug: 'hulls', name: 'Hulls' }, (world) => {
    world.spawn(0, 0, 0);
    const den = new THREE.Object3D(); den.position.set(20, 0, 20); world.scene.add(den);
    world.spawnAt('hulls.one', den, { species: 'pine.boar.thrall', variant: 'thrall', brain: null, strike: null, seed: 1, scale: 1 });
  });
  const { shard, assets } = sceneShardfile({ ...scene, creatures: [creature] });
  expect(shard.look.materials['pine.boar.thrall.parts']).toBeDefined();
  expect(() => { validateSkinAssets(shard, assets); }).not.toThrow();
  expect(shardfileRules(shard)).toEqual([]);
});

test('parts on some variants only refuse: one material contract per variant table', async () => {
  const mixed = { ...species, variants: variantsNamed(['plain', 'thrall']) } as HullCreatureOptions['species'];
  await expect(hullCreature('pine.boar', rig('pine-boar.phone.rigged.glb'), { species: mixed, size: 'medium', skeleton: 'quadruped',
    look: { maps: { base: pixel(1) }, surface: { family: 'pbr', fur: BOAR_FUR },
      variants: { thrall: { parts: { glb: rig('pine-thrall-extras.phone.glb'), node: 'boar_thrall' } } } } })).rejects.toThrow(/own species/u);
});
