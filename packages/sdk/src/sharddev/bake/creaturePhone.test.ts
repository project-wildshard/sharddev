import { expect, test } from 'vitest';
import * as THREE from 'three';
import { commonCreature } from '@wildshard/kit/creatures';
import { parseRows } from '@wildshard/format/rows';
import { parseGlb, prepareAssetDecoders } from '@wildshard/format/shardfileAssets';
import { validateSkinAssets } from '@wildshard/format/skinAssets';
import { creatureGlb, creatureSkin, type CreatureRig } from '../scene/creature';
import { hashImmutableBytes } from '../immutable';
import { readRigMotion } from './rig';
import { creaturePhoneGlb } from './creaturePhone';

function rig(): CreatureRig {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  root.name = 'phone'; body.name = 'body'; head.name = 'head'; body.position.y = 0.6; head.position.set(0, 0.3, 0.4);
  root.add(body); body.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), material), head);
  const clips = ['idle', 'walk'].map(name => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('head.position', [0, 1], [0, 0.3, 0.4, 0, 0.35, 0.4])]));
  return creatureGlb(root, { clips });
}

/** The skin admission a shard runs on a creature look, for one rig GLB. */
function admit(input: CreatureRig, glb: Uint8Array): void {
  const content = commonCreature('boar', { id: 'phone.boar', look: 'phone.look' });
  const skin = creatureSkin({ ...input, glb }, { id: 'phone.boar', binding: { loops: ['idle', 'walk'], material: { family: 'pbr', vertexColours: true } } });
  const metadata = new TextEncoder().encode(JSON.stringify(skin)), file = hashImmutableBytes(glb), hash = hashImmutableBytes(metadata);
  const rows = parseRows({ species: [content.species], strikes: content.strikes, weather: [], days: [], compendiums: [], loot: [],
    looks: [{ id: 'phone.look', species: 'phone.boar', recipe: 'platform.skin', material: null, parameters: { skin: hash }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] });
  const files = [{ hash: file, kind: 'glb' as const, compressed: glb.length, ...parseGlb(glb), dependencies: [], critical: false },
    { hash, kind: 'json' as const, compressed: metadata.length, decoded: metadata.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false }];
  validateSkinAssets({ rows, files, look: { materials: {} } }, new Map([[file, glb], [hash, metadata]]));
}

test('a fixture builds both meshes: the phone mesh keeps the rig and clips, passes skin admission and draws fewer triangles', async () => {
  await prepareAssetDecoders();
  const desktop = rig(), phone = await creaturePhoneGlb(desktop.glb, { ratio: 0.4, error: 0.05 });
  expect(phone.triangles.desktop).toBe(parseGlb(desktop.glb).triangles);
  expect(phone.triangles.phone).toBe(parseGlb(phone.glb).triangles);
  expect(phone.triangles.phone).toBeGreaterThan(0);
  expect(phone.triangles.phone).toBeLessThanOrEqual(phone.triangles.desktop * 0.5);
  admit(desktop, desktop.glb); admit(desktop, phone.glb);
  // Clips compare by their tracks (a three clip's uuid is fresh per read); nodes by name, parent and rest transform.
  const motion = async (glb: Uint8Array) => {
    const read = await readRigMotion(glb);
    return { nodes: read.nodes, clips: read.clips.map(clip => ({ name: clip.name, duration: clip.duration,
      tracks: clip.tracks.map(track => [track.name, [...track.times], [...track.values]]) })) };
  };
  expect(await motion(phone.glb)).toEqual(await motion(desktop.glb));
  // The source stays the author's: simplifying copies.
  expect(parseGlb(desktop.glb).triangles).toBe(phone.triangles.desktop);
});

test('the default keeps the surface within 1% of the radius, and a bad ratio or error refuses', async () => {
  const desktop = rig(), phone = await creaturePhoneGlb(desktop.glb);
  expect(phone.triangles.phone).toBeLessThan(phone.triangles.desktop);
  await expect(creaturePhoneGlb(desktop.glb, { ratio: 0 })).rejects.toThrow('ratio 0 is outside 0.05 to 1');
  await expect(creaturePhoneGlb(desktop.glb, { error: 2 })).rejects.toThrow('error 2 is outside 0 to 1');
});
