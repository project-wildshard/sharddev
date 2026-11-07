// oxlint-disable-next-line import/no-nodejs-modules -- Own and remove the isolated painter fixture.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Confine the fixture beneath the repository's tmp directory.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Bind direct RGBA to the existing dimension-prefixed map stamp.
import { createHash } from 'node:crypto';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { MapAssembly } from '../scripts/map-geometry.mjs';
import { paintDataMap, rasterDataMap } from '../scripts/bake-data-maps.mjs';
import { clientSceneGlb } from '../src/sharddev/bake/glb';
import { hashImmutableBytes } from '../src/sdk/immutable';

// No scene or pack file is published. The normal painter must read both from
// this invocation's owned values, and keep file admission strict otherwise.
test('owned scene/pack bytes paint without files while undeclared fallback refuses', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'map-owned-')), dir = resolve(root, 'src/shards/fixture');
  const assembly = new MapAssembly(), geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 4, 0, 0, 4, 20, 20, 4, 0], 3));
  assembly.add('floor', geometry);
  try {
    mkdirSync(resolve(dir, 'look'), { recursive: true });
    const settings = { why: 'owned scene fixture', inputs: [],
      style: { kind: 'ground', void: 'transparent', classes: [{ match: '#737373', fill: '#cccccc' }] },
      painter: { version: 1, scenes: {
        packs: [{ file: 'scene.bin', rows: { file: 'scene.json', path: ['pack'] }, names: ['names'], deflated: true }],
        recipes: [{ file: 'scene.json', path: ['scene'] }],
      } } };
    writeFileSync(resolve(dir, 'look/map.json'), JSON.stringify(settings));
    const encoded = assembly.encode(), sources = new Map([['scene.json', encoded.json], ['scene.bin', encoded.binary]]);
    const need = (name: string): Uint8Array => {
      const bytes = sources.get(name); if (bytes === undefined) throw new Error(`Missing owned input ${name}`); return bytes;
    };
    const readers = { input: need, bytes: need, json: (name: string): unknown => JSON.parse(new TextDecoder().decode(need(name))) };
    const direct = await rasterDataMap(settings, readers);
    const pixelsHash = hashImmutableBytes(direct.pixels);
    expect(existsSync(resolve(root, 'public/assets/fixture/map/top.webp'))).toBe(false);
    expect(direct.pixels.length).toBe(1000 * 1000 * 4);
    const again = await rasterDataMap(settings, readers);
    expect(again.pixels === direct.pixels).toBe(false);
    direct.pixels.fill(0); direct.raster.height.fill(0);
    expect(hashImmutableBytes(again.pixels)).toBe(pixelsHash);
    const result = await paintDataMap(root, 'fixture', { sources });
    expect(result.stamp.pixelHash).toBe(createHash('sha256').update('map-rgba8/1\u00001000x1000\u0000').update(again.pixels).digest('hex'));
    expect(result.raster.triangles).toBe(1);
    expect(result.raster.height.some(height => height === 4 * 65536)).toBe(true);
    const image = readFileSync(resolve(root, 'public/assets/fixture/map/top.webp'));
    const repeated = await paintDataMap(root, 'fixture', { sources });
    expect(readFileSync(resolve(root, 'public/assets/fixture/map/top.webp'))).toEqual(image);
    expect(repeated.stamp.pixelHash).toBe(result.stamp.pixelHash);
    await expect(paintDataMap(root, 'fixture', { sources: new Map([['scene.json', encoded.json]]) }))
      .rejects.toThrow('undeclared map input scene.bin');
    await expect(paintDataMap(root, 'fixture')).rejects.toThrow('undeclared map input scene.json');
  } finally { geometry.dispose(); rmSync(root, { recursive: true, force: true }); }
});

test('direct raster keeps painter, empty geometry and whole-library refusals', async () => {
  const style = { kind: 'ground', classes: [{ match: '#737373', fill: '#cccccc' }] };
  const readers = { input: (): Uint8Array => { throw new Error('Undeclared source'); },
    bytes: () => new Uint8Array(), json: () => ({ props: { wholeLibrary: {} } }) };
  await expect(rasterDataMap({ painter: { version: 2 }, style }, readers, { label: 'fixture' }))
    .rejects.toThrow('fixture: missing data map painter declaration');
  await expect(rasterDataMap({ painter: { version: 1 }, style }, readers, { label: 'fixture' }))
    .rejects.toThrow('fixture: data map is empty');
  await expect(rasterDataMap({ painter: { version: 1, props: ['props'] }, style }, readers, { label: 'fixture' }))
    .rejects.toThrow('fixture: whole-library props need an explicit map assembly');
});

test('owned baked GLBs preserve selectors and placements without a physical file handoff', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'map-owned-bake-')), dir = resolve(root, 'src/shards/fixture');
  const geometry = new BufferGeometry(), material = new MeshStandardMaterial({ color: 0x737373 });
  geometry.setAttribute('position', new Float32BufferAttribute([0, 4, 0, 0, 4, 20, 20, 4, 0], 3));
  const group = new Group(); group.name = 'bake';
  const kept = new Mesh(geometry, material), omitted = new Mesh(geometry, material);
  kept.name = 'kept'; omitted.name = 'omitted'; omitted.position.y = 10; group.add(kept, omitted);
  try {
    const encoded = clientSceneGlb(group, new Map([[material, 'grey']])), text = new TextEncoder();
    const recipe = { scene: { root: 'root', nodes: [
      { kind: 'group', id: 'root', children: ['left', 'right', 'pooled'] },
      { kind: 'object', id: 'left', source: 'selected', position: [-20, 0, 0] },
      { kind: 'object', id: 'right', source: 'selected', position: [20, 0, 0] },
      { kind: 'mesh', id: 'pooled', geometry: 'kept', position: [0, 0, 40] },
    ], materials: [] }, imports: [{ id: 'selected', kind: 'baked', piece: 'fixture', only: { warm: true } }] };
    const sources = new Map([
      ['scene.json', text.encode(JSON.stringify(recipe))],
      ['bake.json', text.encode(JSON.stringify({ kinds: [{ name: 'kept', warm: true }, { name: 'omitted', warm: false }] }))],
      ['bakes/fixture.glb', encoded.glb],
    ]);
    const settings = { why: 'owned baked source fixture', inputs: [],
      style: { kind: 'ground', void: 'transparent', classes: [{ match: '#737373', fill: '#cccccc' }] },
      painter: { version: 1, scenes: { pools: ['bakes/fixture.glb'], bakes: [{ piece: 'fixture', rows: { file: 'bake.json', path: [] }, directory: 'bakes' }],
        recipes: [{ file: 'scene.json', path: [] }] } } };
    mkdirSync(resolve(dir, 'look'), { recursive: true });
    const settingPath = resolve(dir, 'look/map.json'); writeFileSync(settingPath, JSON.stringify(settings));
    const owned = await paintDataMap(root, 'fixture', { sources });
    expect(owned.raster.triangles).toBe(3);
    expect(owned.raster.height.reduce((highest, value) => Math.max(highest, value), -Infinity)).toBe(4 * 65536);
    const image = readFileSync(resolve(root, 'public/assets/fixture/map/top.webp'));
    await expect(paintDataMap(root, 'fixture', { sources: new Map(Array.from(sources).filter(([name]) => !name.endsWith('.glb'))) }))
      .rejects.toThrow('undeclared map input bakes/fixture.glb');
    mkdirSync(resolve(dir, 'bakes'), { recursive: true });
    for (const [name, bytes] of sources) writeFileSync(resolve(dir, name), bytes);
    writeFileSync(settingPath, JSON.stringify({ ...settings, inputs: Array.from(sources.keys()) }));
    const physical = await paintDataMap(root, 'fixture');
    expect(physical.raster.triangles).toBe(owned.raster.triangles);
    expect(physical.stamp.pixelHash).toBe(owned.stamp.pixelHash);
    expect(readFileSync(resolve(root, 'public/assets/fixture/map/top.webp'))).toEqual(image);
  } finally { geometry.dispose(); material.dispose(); rmSync(root, { recursive: true, force: true }); }
});
