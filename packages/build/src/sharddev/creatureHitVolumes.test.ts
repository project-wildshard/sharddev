// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures and build products stay in this lane's repository scratch.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned fixture paths.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import * as THREE from 'three';
import * as v from 'valibot';
import { commonCreature } from '@wildshard/kit/creatures';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { prepareAssetDecoders, parseGlb } from '@wildshard/format/shardfileAssets';
import { creatureGlb, creatureSkin } from '@wildshard/sdk/scene/creature';
import { creatureHitVolumes, expandCreatureHitVolumes } from '@wildshard/sdk/internal/creatureHitVolumes';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { emptyShardfile } from '@wildshard/sdk/author';
import { buildProject } from './project';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { outputSectionPayloads } from '@wildshard/format/outputFields';
import { settleHandwrittenCreatureLayers } from '@wildshard/sdk/internal/handwrittenCreatureLayers';

const Doc = v.looseObject({ nodes: v.array(v.looseObject({ name: v.optional(v.string()), children: v.optional(v.array(v.number())) })) });
function rig() {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  root.name = 'fixture'; body.name = 'body'; head.name = 'head'; head.position.y = 1;
  root.add(body); body.add(new THREE.Mesh(new THREE.BoxGeometry(.4, .5, .3), material), head);
  return creatureGlb(root, { clips: [new THREE.AnimationClip('idle', 1, [new THREE.VectorKeyframeTrack('head.position', [0, 1], [0, 1, 0, 0, 1, 0])])] });
}
const HEAD_MARKER = { radius: .1 };
function marked(extras: unknown = HEAD_MARKER, edit?: (doc: v.InferOutput<typeof Doc>) => void): ReturnType<typeof rig> {
  const original = rig(), bytes = original.glb, size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const doc = v.parse(Doc, JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + size))));
  const head = doc.nodes.find(node => node.name === 'head'); if (head === undefined) throw new Error('Missing fixture head');
  head.children = [...head.children ?? [], doc.nodes.length]; doc.nodes.push({ name: 'hit.head', translation: [0, .2, 0], extras }); edit?.(doc);
  const text = Buffer.from(JSON.stringify(doc)), json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]), tail = bytes.subarray(20 + size);
  const header = Buffer.from(bytes.subarray(0, 20)); header.writeUInt32LE(20 + json.length + tail.length, 8); header.writeUInt32LE(json.length, 12);
  return { ...original, glb: Uint8Array.from(Buffer.concat([header, json, tail])) };
}
async function fixture(input = marked()) {
  await prepareAssetDecoders();
  const content = commonCreature('boar', { id: 'author.marker', look: 'author.marker.look' }), source = emptyShardfile({ slug: 'marker-fixture', name: 'Marker fixture', author: 'Test', saveRevision: 1, seed: 19 });
  content.species.body = { size: 'small', scale: 1, look: 'author.marker.look' };
  const skin = creatureSkin(input, { id: 'author.marker', binding: { loops: ['idle'], material: { family: 'pbr', vertexColours: true } } });
  const glb = input.glb, file = hashImmutableBytes(glb), cost = parseGlb(glb), metadata = new TextEncoder().encode(JSON.stringify(skin)), hash = hashImmutableBytes(metadata);
  source.rows = parseRows({ ...source.rows, species: [content.species], strikes: content.strikes,
    looks: [{ id: 'author.marker.look', species: 'author.marker', recipe: 'platform.skin', material: null, parameters: { skin: hash }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] });
  source.items.catalogue = content.items;
  const variant = content.species.variants[0]; if (variant === undefined) throw new Error('Missing fixture variant');
  source.creatures.spawns = [{ id: 'marker.actor', species: 'author.marker', variant: variant.id, at: [0, 0, 4], yaw: 0, scale: 1, seed: 1, brain: null, strike: null }];
  source.files = [{ hash: file, kind: 'glb', compressed: glb.length, ...cost, dependencies: [], critical: false },
    { hash, kind: 'json', compressed: metadata.length, decoded: metadata.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false }];
  source.library = [hash];
  source.budgets.library = { resident: source.files.reduce((sum, row) => sum + row.decoded + row.gpu, 0), compressed: source.files.reduce((sum, row) => sum + row.compressed, 0) };
  return { source, assets: new Map([[file, glb], [hash, metadata]]), input, file, skin: hash };
}
test('a real Blender-style hit.head empty becomes an admitted head volume without altering the GLB', async () => {
  const f = await fixture(), bytes = Uint8Array.from(f.input.glb), expanded = expandCreatureHitVolumes(f.source, f.assets);
  expect(expanded.rows.species[0]?.body?.volumes).toEqual([{ part: 'head', bone: 'head', shape: 'sphere', radius: .1, halfLength: 0, axis: 'y', multiplier: 2, at: [0, .2, 0] }]);
  expect(f.source.rows.species[0]?.body?.volumes).toBeUndefined(); expect(f.input.glb).toEqual(bytes);
  expect(() => parseShardfile(expanded)).not.toThrow();
});
test('shield zero, scaled capsule axis and explicit row overrides keep their authored values', async () => {
  const f = await fixture(marked({ shape: 'capsule', radius: .1, halfLength: .4, multiplier: 0 }, doc => {
    const node = doc.nodes.find(row => row.name === 'hit.head'); if (node === undefined) throw new Error('Missing marker');
    node.name = 'hit.shield'; node['scale'] = [2, 2, 2]; node['rotation'] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2).toArray();
  }));
  expect(creatureHitVolumes(f.input.glb)[0]).toMatchObject({ part: 'shield', multiplier: 0, shape: 'capsule', radius: .2, halfLength: .8, axis: 'z' });
  const body = f.source.rows.species[0]?.body; if (body === undefined) throw new Error('Missing body');
  body.volumes = [{ part: 'shield', bone: 'body', shape: 'sphere', radius: .5, halfLength: 0, axis: 'y', multiplier: 0 }];
  expect(expandCreatureHitVolumes(f.source, f.assets).rows.species[0]?.body?.volumes).toEqual(body.volumes);
});
test('malformed markers, absent bone parents, duplicate parts and nonuniform scaling refuse', async () => {
  await prepareAssetDecoders();
  for (const extra of [{ radius: -1 }, { shape: 'mesh' }, { multiplier: -1 }, { radius: Infinity }, { radius: .1, extra: true }]) {
    expect(() => creatureHitVolumes(marked(extra).glb)).toThrow();
  }
  expect(() => creatureHitVolumes(marked({}, doc => {
    const head = doc.nodes.find(row => row.name === 'head'); if (head === undefined) throw new Error('Missing head'); head.children = [];
  }).glb)).toThrow('no named skin bone parent');
  expect(() => creatureHitVolumes(marked({}, doc => {
    const head = doc.nodes.find(row => row.name === 'head'); if (head === undefined) throw new Error('Missing head');
    head.children = [...head.children ?? [], doc.nodes.length]; doc.nodes.push({ name: 'hit.head' });
  }).glb)).toThrow('Duplicate creature volume part');
  expect(() => creatureHitVolumes(marked({}, doc => { const node = doc.nodes.find(row => row.name === 'hit.head'); if (node !== undefined) node['scale'] = [1, 2, 1]; }).glb)).toThrow('positive and uniform');
});
test('an unmarked existing creature is a source identity and keeps its complete skin bytes', async () => {
  const f = await fixture(rig()), before = JSON.stringify(f.source), hashes = [...f.assets].map(([hash, bytes]) => [hash, hashImmutableBytes(bytes)]);
  expect(expandCreatureHitVolumes(f.source, f.assets)).toBe(f.source);
  expect(JSON.stringify(f.source)).toBe(before); expect([...f.assets].map(([hash, bytes]) => [hash, hashImmutableBytes(bytes)])).toEqual(hashes);
});
test('variant marker differences refuse until explicit row overrides give every variant the same parts', async () => {
  const first = await fixture(), second = await fixture(marked({ radius: .2 })), look = first.source.rows.looks[0], species = first.source.rows.species[0];
  if (look === undefined || species?.body === undefined) throw new Error('Missing variant fixture');
  for (const [hash, bytes] of second.assets) first.assets.set(hash, bytes);
  first.source.files.push(...second.source.files);
  const skins = Object.fromEntries(species.variants.map((variant, index) => [variant.id, index === 0 ? first.skin : second.skin]));
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, skins })), hash = hashImmutableBytes(bytes);
  first.assets.set(hash, bytes); first.source.library.push(hash); look.parameters['variants'] = hash;
  first.source.files.push({ hash, kind: 'json', compressed: bytes.length, decoded: bytes.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [first.skin, second.skin], critical: false });
  expect(() => expandCreatureHitVolumes(first.source, first.assets)).toThrow('variant hit markers differ');
  species.body.volumes = [{ part: 'head', bone: 'head', shape: 'sphere', radius: .5, halfLength: 0, axis: 'y', multiplier: 2 }];
  expect(expandCreatureHitVolumes(first.source, first.assets).rows.species[0]?.body?.volumes).toEqual(species.body.volumes);
});
test('wildshard build automatically imports a raw GLB marker into the ordinary species output', async () => {
  const scratch = resolve(import.meta.dirname, '../../../../tmp/codex-te2e'); mkdirSync(scratch, { recursive: true });
  const f = await fixture(), root = mkdtempSync(join(scratch, 'cc6d-'));
  try {
    const text = JSON.stringify(parseShardfile(f.source)); mkdirSync(join(root, 'assets'));
    for (const [hash, bytes] of f.assets) writeFileSync(join(root, 'assets', hash), bytes);
    writeFileSync(join(root, 'data.json'), text); writeFileSync(join(root, 'shard.config.ts'), "import input from './data.json' with {type:'json'};\nexport default input;\n");
    await buildProject(root, join(root, 'built'), { client: null });
    const built = validateOutputProduct(join(root, 'built'));
    expect(built.shard.rows.species[0]?.body?.volumes?.[0]).toMatchObject({ part: 'head', bone: 'head', radius: .1, multiplier: 2 });
    expect(built.assets.get(f.file)).toEqual(f.input.glb); expect(readFileSync(join(root, 'data.json'), 'utf8')).toBe(text);
    // A plain-JSON author edits the ordinary species section, then packs it.
    const plain = structuredClone(built.shard), body = plain.rows.species[0]?.body;
    if (body === undefined) throw new Error('Missing built body'); delete body.volumes;
    const section = built.index.sections.find(row => row.name === 'actors/species'), payload = new Map(outputSectionPayloads(plain)).get('actors/species');
    if (section === undefined || payload === undefined) throw new Error('Missing ordinary species section');
    writeFileSync(join(root, 'built', section.path), JSON.stringify(payload));
    const packed = settleHandwrittenCreatureLayers(join(root, 'built'), join(root, 'packed'));
    expect(packed.shard.rows.species[0]?.body?.volumes?.[0]).toMatchObject({ part: 'head', radius: .1, multiplier: 2 });
    expect(packed.assets.get(f.file)).toEqual(f.input.glb);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
