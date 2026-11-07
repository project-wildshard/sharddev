/// <reference types="node" />
import {nineCastBlobs} from './fixtures/nine-cast-blobs';
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { installBrowserScopeEnvironment } from '../src/client/engine/app/view/scopeEnvironment';
import { installScopeEnvironment, scopeEnvironment } from '../src/shared/engine/app/scopeEnvironment';
import { Box3, BufferAttribute as NativeBufferAttribute, BufferGeometry as NativeBufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { legacyDouble } from '../src/test/engine/FakeGame';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { AssetService } from '../src/client/engine/app/assets';
import { WorldRegistry } from '../src/client/engine/world/registry';
import { LivingBuildings } from '../src/client/game/shardfile/livingBuildings';
import { emptyBuildingLifeRows } from '@wildshard/format/buildings';
import { installWorldScenes } from '../src/client/game/shardfile/worldScenes';
import { constructionCheckpoint } from '../src/client/game/shardfile/constructionCheckpoint';
import { parseWorldScenes } from '@wildshard/format/worldScenes';
import type { ShardContext } from '../src/client/game/plugin/context';
import { emptyShardfile } from '../src/sharddev/author';
import * as runtimeProducts from '../src/client/game/shardfile/runtimeProduct';
import { recordSceneProfile } from '../src/client/game/shardfile/sceneProfile';
import { isDev, setDev } from '../src/client/engine/core/devMode';
import * as pacing from '../src/shared/engine/core/framePacing';
import * as work from '../src/shared/engine/core/workSlice';
// Late scene work now crosses the same controlled paint as the browser host.
const nativeScopeEnvironment = scopeEnvironment();
beforeEach(() => { installBrowserScopeEnvironment(); });
afterEach(() => { installScopeEnvironment(nativeScopeEnvironment); });

/** A product whose file names are their own URLs: these rows' sources and aliases are /-rooted public URLs (d9cf71547f). */
const identityProduct = { url: (name: string): string => name };

// A made-up second shard: two steps, cube variants, repeated groups and named handles.
const recipe = { scene: { version: 1, root: 'root', nodes: [{ kind: 'group', id: 'root', children: ['stone'] },
  { kind: 'mesh', id: 'stone', name: 'fixture-stone', geometry: 'rock', material: 'paint', missing: 'empty' }],
  materials: [{ kind: 'port', id: 'paint', source: 'paint' }] }, imports: [] };
const section = () => parseWorldScenes({ version: 1,
  libraries: [{ id: 'shapes', kind: 'owned', models: [{ id: 'stone', file: 'models/stone.glb' }] }],
  materials: [{ id: 'paint', kind: 'standard', properties: { color: 0x987654, roughness: 0.7 } }],
  steps: [{ id: 'harbour', variants: { standalone: 'scenes/open.json', cell: 'scenes/cell.json' },
    geometry: { rock: { library: 'shapes', model: 'stone' } }, materials: { paint: 'paint' },
    registry: [{ id: 'harbour-wall', name: 'Harbour wall', category: 'props', file: 'data/scenes.json', part: 'root',
      colliders: [{ kind: 'box', x: 1, y: 2, z: 3, hx: 1, hy: 1, hz: 1 }] }],
    publish: { collision: { kind: 'colliders', part: 'harbour-wall' }, at: { kind: 'vector', value: [1, 2, 3] }, height: { kind: 'number', value: 7 } } },
  { id: 'markers', scene: 'scenes/open.json', geometry: { rock: { library: 'shapes', model: 'stone' } }, materials: { paint: 'paint' },
    repeat: [{ id: 'east', position: [4, 0, 0] }, { id: 'west', position: [-4, 0, 0] }], publish: { stone: { kind: 'object', part: 'stone' } } }],
});

function triangle(name?: string): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, ...(name === undefined ? {} : { name, extras: { restGroups: [], restBox: [0, 0, 0, 1, 1, 0], restSphere: [0.5, 0.5, 0, 1] } }) }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] }));
  const padded = Math.ceil(json.length / 4) * 4, bytes = new Uint8Array(12 + 8 + padded + 8 + 36), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + padded); bytes.set(json, 20);
  header.setUint32(20 + padded, 36, true); header.setUint32(24 + padded, 0x004e4942, true);
  bytes.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), 28 + padded);
  return bytes;
}
function fixture(cell = false): ShardContext {
  const scope = new Scope('fixture-harbour'), registry = new WorldRegistry();
  const cellRecipe = { ...recipe, scene: { ...recipe.scene, nodes: recipe.scene.nodes.map(node => node.id === 'stone' ? { ...node, name: 'cell-stone' } : node) } };
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const files = new Map([['models/stone.glb', triangle()], ['scenes/open.json', encode(recipe)], ['scenes/cell.json', encode(cellRecipe)]]);
  const source = emptyShardfile({ slug: 'fixture-harbour', name: 'Harbour', author: 'Fixture', revision: 1, seed: 3 });
  const game = legacyDouble<ShardContext['game']>({});
  Object.assign(game, { camera: new PerspectiveCamera(), runtime: undefined, levelScope: undefined, renderer: undefined });
  const read = (name: string): Promise<Uint8Array> => { const value = files.get(name); return value === undefined ? Promise.reject(new Error('Missing fixture blob')) : Promise.resolve(value); };
  const product = createShardProduct({ slug: 'fixture-harbour', revision: 1, shardfile: source, sections: new Map(),
    files: new Map([...files.keys()].map(name => [name, { hash: name, url: name }])), read });
  // Retain the original fixture's named transport; individual cases extend it
  // with their own source files and refusal controls.
  Object.assign(product, { hasFile: (name: string) => files.has(name), url: (name: string) => name, file: read });
  return legacyDouble<ShardContext>({ scope, root: new Group(), app: legacyDouble<ShardContext['app']>({ registry, assets: new AssetService() }), game, cube: cell ? { half: 250 } : null,
    product });
}

test.each([true, false])('library timing names declared rows, replaces re-entry and skips public spans (Developer=%s)', async developer => {
  const previous = isDev(), names = ['scene.library:owned:shapes', 'scene.library:owned:spare', 'scene.library:whole:deferred']
    .map(step => `wildshard.prepare:fixture-harbour:${step}`), contexts: ShardContext[] = [];
  const rows = section();
  rows.libraries.push({ id: 'spare', kind: 'owned', models: [{ id: 'stone', file: 'models/stone.glb', attributes: {} }] },
    { id: 'deferred', kind: 'whole', load: 'explorer', models: [{ id: 'unused', part: 'unused', files: ['never-read.glb'] }] });
  const marker = rows.steps.find(step => step.id === 'markers');
  if (marker === undefined) throw new Error('Missing marker fixture');
  marker.geometry['rock'] = { library: 'spare', model: 'stone' };
  try {
    setDev(developer);
    for (let entry = 0; entry < 2; entry++) {
      const context = fixture(); contexts.push(context);
      const handles = await installWorldScenes(context, rows);
      expect(handles.object('markers.east.stone')).toBeInstanceOf(Mesh);
      for (const name of names) {
        const entries = performance.getEntriesByName(name);
        expect(entries).toHaveLength(developer ? 1 : 0);
        if (developer) expect(entries[0]?.duration).toBeGreaterThanOrEqual(0);
      }
      context.scope.dispose();
    }
  } finally { setDev(previous); for (const context of contexts) context.scope.dispose(); for (const name of names) performance.clearMeasures(name); }
});

test('library timing retains the failed library identity and original refusal', async () => {
  const previous = isDev(), context = fixture(), name = 'wildshard.prepare:fixture-harbour:scene.library:owned:shapes';
  const failure = new Error('Fixture decode read refused'), file = context.product.file.bind(context.product);
  vi.spyOn(context.product, 'file').mockImplementation(path => path === 'models/stone.glb' ? Promise.reject(failure) : file(path));
  try {
    setDev(true);
    await expect(installWorldScenes(context, section())).rejects.toBe(failure);
    expect(performance.getEntriesByName(name)).toHaveLength(1);
  } finally { setDev(previous); vi.restoreAllMocks(); context.scope.dispose(); performance.clearMeasures(name); }
});

test('world profile changes refuse before geometry intake and a fresh admission permits rebuilding', async () => {
  const context = fixture(), reads: string[] = [], file = context.product.file.bind(context.product);
  vi.spyOn(context.product, 'file').mockImplementation(name => { reads.push(name); return file(name); });
  try {
    recordSceneProfile(context.product.shardfile, ['scenes/other-profile.json']);
    await expect(installWorldScenes(context, section())).rejects.toThrow('World profile changed after memory admission');
    expect(reads).not.toContain('models/stone.glb');
    recordSceneProfile(context.product.shardfile, []);
    await installWorldScenes(context, section()); expect(reads).toContain('models/stone.glb');
  } finally { vi.restoreAllMocks(); context.scope.dispose(); }
});

test('resident worlds admit every frozen choice and load only requested specimen buffers', async () => {
  const { defineWorldSceneCatalogue } = await import('../src/client/game/models/worldSceneCatalogue');
  const { sharedModelContext } = await import('../src/client/engine/models/model');
  const { Rng } = await import('../src/shared/engine/core/rng');
  const { SkyRig } = await import('../src/client/engine/world/skyRig');
  const sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing specimen fixture sky');
  const context = fixture(), rows = section(), reads: string[] = [];
  Object.assign(context.game, { runtime: { world: { sky, game: context.game, registry: context.app.registry } } });
  const graph = (model: string) => ({ id: `specimen.${model}`, root: 'specimen.root', nodes: [{ id: 'shape', parent: 'specimen.root', kind: 'mesh',
    geometry: { library: 'shapes', model }, material: 'paint', sphere: [0, 0, 0, 2] }] });
  const catalogue = { product: 'fixture-harbour', models: [{ key: 'crate', id: 'fixture-harbour/crate', name: 'Crate', file: 'crate.json', category: 'props', pipeline: 'code',
    assembly: 'scene', defaults: { profile: 'a' }, variants: [{ id: 'b', label: 'B', params: { profile: 'b' } }],
    choices: ['a', 'b'].map(id => ({ id, params: { profile: id }, size: [1, 1, 1], draws: [], colliders: [], scene: { file: `scenes/${id}.json` } })) }] };
  const sectionRows = parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json', libraries: [{ id: 'shapes', kind: 'owned', models: [
    { id: 'stone', file: 'models/stone.glb' }, { id: 'a', file: 'models/a.glb' }, { id: 'b', file: 'models/b.glb' },
  ] }] });
  const extra = new Map([['models/catalogue.json', new TextEncoder().encode(JSON.stringify(catalogue))],
    ['scenes/a.json', new TextEncoder().encode(JSON.stringify(graph('a')))], ['scenes/b.json', new TextEncoder().encode(JSON.stringify(graph('b')))],
    ['models/a.glb', triangle()], ['models/b.glb', triangle()]]);
  const file = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => extra.has(name) || has(name));
  vi.spyOn(context.product, 'file').mockImplementation(name => { reads.push(name); return extra.has(name) ? Promise.resolve(extra.get(name) ?? new Uint8Array()) : file(name); });
  Object.assign(context.product, { section: () => sectionRows });
  vi.spyOn(runtimeProducts, 'loadFirstPartyProduct').mockResolvedValue(context.product);
  try {
    const handles = await installWorldScenes(context, sectionRows);
    expect(reads).toContain('scenes/a.json'); expect(reads).toContain('scenes/b.json');
    expect(reads).toContain('models/stone.glb'); expect(reads).not.toContain('models/a.glb'); expect(reads).not.toContain('models/b.glb');
    const models = defineWorldSceneCatalogue(catalogue), ctx = sharedModelContext(sky), material = handles.material('materials.paint');
    const a = models.model('crate').build(ctx, { profile: 'a' }, new Rng(1));
    const b = models.model('crate').build(ctx, { profile: 'b' }, new Rng(2));
    const mesh = (root: unknown): Mesh | undefined => {
      let value: Mesh | undefined;
      if (root instanceof Object3D) root.traverse(node => { if (node instanceof Mesh) value = node; });
      return value;
    };
    await vi.waitFor(() => { expect(mesh(a)?.geometry.getAttribute('position').count).toBe(3); expect(mesh(b)?.geometry.getAttribute('position').count).toBe(3); });
    expect(reads.filter(name => name === 'models/a.glb')).toHaveLength(1); expect(reads.filter(name => name === 'models/b.glb')).toHaveLength(1);
    expect(mesh(a)?.material).toBe(material); expect(mesh(b)?.material).toBe(material);
    const again = models.model('crate').build(ctx, { profile: 'a' }, new Rng(3));
    expect(mesh(again)?.geometry).not.toBe(mesh(a)?.geometry);
    expect(reads.filter(name => name === 'models/a.glb')).toHaveLength(1);
  } finally { vi.restoreAllMocks(); context.scope.dispose(); }
});

test('fictional prewelded copies borrow named parts and keep independent contacts and picking boxes', async () => {
  const { SkyRig } = await import('../src/client/engine/world/skyRig');
  const sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing fixture sky');
  const context = fixture(), rows = section();
  const library = rows.libraries.find(row => row.kind === 'owned');
  if (library?.kind !== 'owned' || library.models[0] === undefined) throw new Error('Missing fixture model');
  library.models[0].file = { phone: 'models/stone.glb', desktop: 'models/stone.glb' };
  const destination = new WorldRegistry();
  Object.assign(context.game, { runtime: { world: { sky, game: context.game, registry: destination } } });
  const catalogue = { product: 'fixture-harbour', models: [{ key: 'posts', id: 'fixture-harbour/posts', name: 'Posts', category: 'props', pipeline: 'code', file: 'posts.json', defaults: {},
    choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [{ kind: 'box', x: 0, y: 0, z: 0, hx: 99, hy: 99, hz: 99 }], draws: [{ id: 'post', library: 'shapes', model: 'stone', material: 'paint' }] }] }] };
  const row = { id: 'posts', model: 'posts', draw: 'merged', drawnInto: { part: 'markers.east.stone', boxes: [3, 0, 0, 5, 1, 1] },
    poses: [{ x: 4, y: 0, z: 0, params: { bakedWidth: 2 }, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1] }],
    colliders: [{ kind: 'box', x: 4, y: 0.5, z: 0.5, hx: 1, hy: 0.5, hz: 0.5 }], piece: { id: 'placed-posts' } };
  const file = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => name === 'models/catalogue.json' || has(name));
  vi.spyOn(context.product, 'file').mockImplementation(name => name === 'models/catalogue.json' ? Promise.resolve(new TextEncoder().encode(JSON.stringify(catalogue))) : file(name));
  try {
    const handles = await installWorldScenes(context, parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json', placements: [row,
      { id: 'live', model: 'posts', draw: 'single', poses: row.poses.map(pose => ({ ...pose, params: {} })), piece: { id: 'live-post', follows: 'copy', solidFloor: true, floors: [{ x: 4, z: 0, hw: 2, hd: 2, y: 3, profile: [[-2, 2, -1], [2, 1, 1]] }] } },
    ] }));
    const mesh = handles.object('markers.east.stone'), placed = await handles.place('posts');
    expect(placed.object).toBe(mesh); expect(placed.copyBox(0, new Box3())).toEqual(new Box3(new Vector3(3, 0, 0), new Vector3(5, 1, 1)));
    expect(placed.colliders).toEqual(row.colliders); expect(await handles.place('posts')).toBe(placed);
    expect(destination.pieces.filter(piece => piece.id === 'placed-posts')).toHaveLength(1);
    const moving = await handles.place('live');
    expect(destination.pieces.find(piece => piece.id === 'live-post')?.follows).toBe(moving.object);
    expect(destination.pieces.some(piece => piece.id === 'harbour-wall')).toBe(true);
    expect(context.app.registry.pieces).toHaveLength(0);
    expect(handles.floorAt('live', 4, 0)).toBe(3); expect(handles.floorAt('live', 40, 0)).toBeUndefined();
    await expect(installWorldScenes(fixture(), parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json', placements: [{ ...row, drawnInto: { ...row.drawnInto, boxes: [] } }] }))).rejects.toThrow();
  } finally { vi.restoreAllMocks(); context.scope.dispose(); }
});

test('fictional shard builds ordered, repeated, cube-selected rows and typed handles', async () => {
  const context = fixture(true), handles = await installWorldScenes(context, section());
  expect(handles.group('harbour.root')).toBeInstanceOf(Group);
  expect(handles.group('harbour.root').children[0]?.name).toBe('cell-stone');
  expect(handles.object('markers.east.stone')).toBeInstanceOf(Mesh);
  expect(handles.group('markers.east.root').position.toArray()).toEqual([4, 0, 0]);
  expect(handles.group('markers.west.root').position.toArray()).toEqual([-4, 0, 0]);
  expect(handles.vector('harbour.at').toArray()).toEqual([1, 2, 3]); expect(handles.number('harbour.height')).toBe(7);
  expect(handles.colliders('harbour.collision')).toEqual(context.app.registry.pieces[0]?.colliders);
  expect(context.app.registry.pieces.map(piece => piece.id)).toEqual(['harbour-wall']);
  expect(context.app.registry.pieces[0]?.colliders).toEqual([{ kind: 'box', x: 1, y: 2, z: 3, hx: 1, hy: 1, hz: 1 }]);
  expect(() => handles.mesh('harbour.height')).toThrow('Expected scene mesh'); context.scope.dispose();
});

test('resident owns one build across entries and frees owned geometry and materials', async () => {
  const context = fixture(), resident = new Scope('resident'), rows = { ...section(), cosmeticDraws: 976 };
  let draws = 0, drawsAtGeometry = 0;
  Object.defineProperty(context.app, 'rng', { value: { stream: (name: string) => {
    expect(name).toBe('cosmetic'); return { next: () => { draws++; return 0.5; } };
  } } });
  const file = context.product.file.bind(context.product);
  vi.spyOn(context.product, 'file').mockImplementation(name => {
    if (name === 'models/stone.glb') drawsAtGeometry = draws; return file(name);
  });
  const a = await installWorldScenes(context, rows, resident), b = await installWorldScenes(context, rows, resident);
  expect(draws).toBe(976); expect(drawsAtGeometry).toBe(976);
  expect(a).toBe(b);
  const mesh = a.group('harbour.root').children[0]; if (!(mesh instanceof Mesh)) throw new Error('Missing fixture mesh');
  const material: unknown = mesh.material; if (!(material instanceof MeshStandardMaterial)) throw new Error('Missing fixture material');
  const disposed = vi.fn(); material.addEventListener('dispose', () => { disposed(); });
  context.scope.dispose(); expect(disposed).not.toHaveBeenCalled();
  resident.dispose(); expect(disposed).toHaveBeenCalledOnce();
  expect(context.app.registry.pieces).toHaveLength(0);
});

test('admission rejects executable, duplicate, missing and crossed references before construction', async () => {
  expect(() => parseWorldScenes({ ...section(), callback: () => undefined })).toThrow();
  expect(() => parseWorldScenes({ ...section(), steps: [section().steps[0], section().steps[0]] })).toThrow();
  const context = fixture(), rows = section(), first = rows.steps[0]; if (first === undefined) throw new Error('Missing step');
  await expect(installWorldScenes(context, { ...rows, steps: [{ ...first, variants: { standalone: 'scenes/missing.json', cell: 'scenes/missing.json' } }] })).rejects.toThrow();
  await expect(installWorldScenes(context, { ...rows, steps: [{ ...first, geometry: { rock: { library: 'missing', model: 'stone' } } }] })).rejects.toThrow('Missing world scene model');
  expect(context.app.registry.pieces).toHaveLength(0);
  await expect(installWorldScenes(context, rows)).resolves.toBeDefined(); context.scope.dispose();
});


test('authored stairs retain their surface, native count and repeated world pose', async () => {
  const context = fixture(), rows = section(), first = rows.steps[0];
  if (first === undefined) throw new Error('Missing step');
  const stairs = { kind: 'treads' as const, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 2, z: 4 }, width: 2, count: 8, surface: 'wood' as const };
  const handles = await installWorldScenes(context, parseWorldScenes({ ...rows, steps: [{ ...first,
    repeat: [{ id: 'raised', position: [3, 1, 5] }],
    registry: [{ id: 'stairs', name: 'Stairs', category: 'props', file: 'data/stairs.json', part: 'root', colliders: [stairs], surface: 'wood', solidFloor: true }], publish: {},
  }] }));
  expect(handles.group('harbour.raised.root').position.toArray()).toEqual([3, 1, 5]);
  expect(context.app.registry.pieces[0]?.surface).toBe('wood');
  expect(context.app.registry.pieces[0]?.colliders).toEqual([{ ...stairs, from: { x: 3, y: 1, z: 5 }, to: { x: 3, y: 3, z: 9 } }]);
  expect(() => parseWorldScenes({ ...rows, steps: [{ ...first, registry: [{ ...first.registry[0], colliders: [{ ...stairs, count: 0 }] }] }] })).toThrow();
  context.scope.dispose();
});

test('scene catalogue keeps fixed draws, authored floors and model collision ownership', async () => {
  const [{ defineWorldSceneCatalogue, bindWorldSceneModelSources }, { modelContext }, { Rng }, { BufferGeometry, BufferAttribute, MeshBasicMaterial }] = await Promise.all([
    import('../src/client/game/models/worldSceneCatalogue'), import('../src/client/engine/models/model'), import('../src/shared/engine/core/rng'), import('three'),
  ]);
  const owner = new Scope('scene-catalogue'), ctx = modelContext(null), registry = new WorldRegistry();
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  const material = new MeshBasicMaterial({ color: 0x7fd9ff });
  const catalogueRows = { product: 'fixture-port', models: [{ key: 'tower', id: 'fixture-port/tower', name: 'Tower', category: 'buildings', pipeline: 'code', file: 'models/fixture.ts', surface: 'stone', defaults: {}, choices: [{ id: 'world', params: {}, size: [2, 3, 4],
    draws: [{ id: 'wall', library: 'bakes', model: 'wall', material: 'glyph', castShadow: true, receiveShadow: true, renderOrder: 1 }],
    colliders: [{ kind: 'box', x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1, surface: 'stone' }],
    site: { origin: { x: 3, y: 4, z: 5 }, colliders: [], floors: [{ x: 0, z: 0, hw: 2, hd: 2, y: 1 }], anchors: { door: { x: 0, y: 1, z: 1, yaw: 0 } } },
  }] }] };
  const { parseWorldSceneModels } = await import('@wildshard/format/worldSceneModels');
  bindWorldSceneModelSources(ctx, 'fixture-port', { catalogue: parseWorldSceneModels(catalogueRows), geometries: new Map([[JSON.stringify(['bakes', 'wall']), geometry]]), materials: new Map([['glyph', material]]) }, owner);
  const catalogue = defineWorldSceneCatalogue(catalogueRows), model = catalogue.model('tower'), built = model.build(ctx, {}, new Rng(1));
  if (!(built instanceof Group)) throw new Error('Missing scene model group');
  const mesh = built.children[0]; if (!(mesh instanceof Mesh)) throw new Error('Missing scene model draw');
  const actualGeometry: unknown = mesh.geometry; if (!(actualGeometry instanceof BufferGeometry)) throw new Error('Missing owned scene geometry');
  const actualAttribute: unknown = actualGeometry.getAttribute('position'), sourceAttribute: unknown = geometry.getAttribute('position');
  if (!(actualAttribute instanceof BufferAttribute) || !(sourceAttribute instanceof BufferAttribute)) throw new Error('Missing scene vertex channel');
  expect(mesh.material).toBe(material); expect(actualGeometry).not.toBe(geometry); expect(actualAttribute.array).toEqual(sourceAttribute.array);
  expect([mesh.castShadow, mesh.receiveShadow, mesh.renderOrder]).toEqual([true, true, 1]);
  const site = catalogue.site('tower', 'world', ctx, registry);
  expect(site.floorHeightAt(3, 5)).toBe(5); expect(site.floorHeightAt(20, 20)).toBeUndefined();
  expect(site.anchors['door']).toEqual({ x: 3, y: 5, z: 6, yaw: 0 });
  expect(site.colliderDescs()).toEqual([{ kind: 'box', x: 3, y: 5, z: 5, hx: 1, hy: 1, hz: 1, surface: 'stone' }]);
  expect(() => model.build(ctx, { site: 'unbaked' }, new Rng(1))).toThrow('authored choice');
  expect(() => defineWorldSceneCatalogue({ ...catalogueRows, callback: () => undefined })).toThrow();
  owner.dispose(); expect(() => catalogue.material('glyph', ctx)).toThrow('Missing scene model material');
  geometry.dispose(); material.dispose(); registry.retire();
});

test.each([false, true])('cold demand-loaded Explorer cards await geometry and borrow resident surfaces: %s', async borrowed => {
  const [{ defineWorldSceneCatalogue, bindWorldSceneModelSources }, { modelContext }, { Rng }, { withOwner }, runtime, assets, { parseWorldSceneModels }] = await Promise.all([
    import('../src/client/game/models/worldSceneCatalogue'), import('../src/client/engine/models/model'), import('../src/shared/engine/core/rng'), import('../src/shared/engine/app/ownership'), import('../src/client/game/shardfile/runtimeProduct'), import('../src/client/engine/core/assets'), import('@wildshard/format/worldSceneModels'),
  ]);
  const context = fixture(), owner = new Scope('cold-catalogue'), ctx = modelContext(null), rows = section();
  const catalogueRows = { product: 'fixture-harbour', models: [{ key: 'cold', id: 'fixture-harbour/cold', load: 'demand', name: 'Cold model', category: 'props', pipeline: 'code', file: 'models/cold.ts', defaults: {}, choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'stone', library: 'shapes', model: 'stone', material: 'paint' }] }] }] };
  let supply: (bytes: Uint8Array) => void = () => { throw new Error('Missing geometry reader'); };
  const pending = new Promise<Uint8Array>(resolve => { supply = resolve; });
  const oldFile = context.product.file.bind(context.product);
  const file = vi.spyOn(context.product, 'file').mockImplementation(name => name === 'models/catalogue.json' ? Promise.resolve(new TextEncoder().encode(JSON.stringify(catalogueRows))) : name === 'models/stone.glb' ? pending : oldFile(name));
  Object.assign(context.product, { section: () => parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json',
    ...(borrowed ? { materials: [{ id: 'paint', kind: 'surface', scan: 'fixture_stone', properties: {} }] } : {}) }) });
  const product = vi.spyOn(runtime, 'loadFirstPartyProduct').mockResolvedValue(context.product);
  const scan = vi.spyOn(assets, 'loadPBR').mockRejectedValue(new Error('A borrowed surface must not upload again'));
  const material = new MeshStandardMaterial(), materialDisposed = vi.spyOn(material, 'dispose');
  if (borrowed) bindWorldSceneModelSources(ctx, 'fixture-harbour', { catalogue: parseWorldSceneModels(catalogueRows), geometries: new Map(), materials: new Map([['paint', material]]) }, context.scope);
  try {
    const catalogue = defineWorldSceneCatalogue(catalogueRows), built = withOwner(owner, () => catalogue.model('cold').build(ctx, {}, new Rng(1)));
    if (!(built instanceof Group)) throw new Error('Missing loading specimen');
    expect(built.children[0]).toBeInstanceOf(Mesh);
    await vi.waitFor(() => { expect(file).toHaveBeenCalledWith('models/stone.glb'); });
    expect(built.children[0]).toBeInstanceOf(Mesh);
    supply(triangle());
    await vi.waitFor(() => { expect(built.children[0]).toBeInstanceOf(Group); });
    expect(product).toHaveBeenCalledWith('fixture-harbour', expect.objectContaining({ name: 'scene-models/fixture-harbour' }));
    expect(product.mock.calls[0]?.[1]?.belongsTo(owner)).toBe(true);
    expect(file).toHaveBeenCalledWith('models/catalogue.json');
    const filled = built.children[0]; if (!(filled instanceof Group)) throw new Error('Missing filled specimen');
    expect(filled.children[0]).toBeInstanceOf(Mesh);
    // Cold view intake must never become resident state for the next card.
    if (borrowed) expect(catalogue.material('paint', ctx)).toBe(material);
    else expect(() => catalogue.material('paint', ctx)).toThrow('Missing scene model material');
    expect(scan).not.toHaveBeenCalled();
    const draw = filled.children[0]; if (!(draw instanceof Mesh)) throw new Error('Missing cold specimen draw');
    if (borrowed) expect(draw.material).toBe(material);
    const dispose = vi.spyOn(draw.geometry, 'dispose');
    owner.dispose(); expect(dispose).toHaveBeenCalledOnce(); expect(materialDisposed).not.toHaveBeenCalled();
    const again = new Scope('next-cold-card');
    try {
      const next = withOwner(again, () => catalogue.model('cold').build(ctx, {}, new Rng(1)));
      if (!(next instanceof Group)) throw new Error('Missing revisited specimen');
      await vi.waitFor(() => { expect(next.children[0]).toBeInstanceOf(Group); });
      expect(product).toHaveBeenCalledTimes(2);
    } finally { again.dispose(); }
  } finally { supply(triangle()); file.mockRestore(); product.mockRestore(); scan.mockRestore(); owner.dispose(); context.scope.dispose(); material.dispose(); }
});

test.each(['unplaced', 'placed', 'direct', 'shared'] as const)('demand catalogue intake retains actual %s requirements', async mode => {
  const { parseWorldSceneModels } = await import('@wildshard/format/worldSceneModels');
  const context = fixture(), rows = section();
  const optional = { key: 'optional', id: 'fixture-harbour/optional', load: 'demand', name: 'Optional', category: 'props', pipeline: 'code', file: 'optional.ts', defaults: {},
    choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'spare', library: 'optional', model: 'spare', material: 'paint' }] }] };
  const { load: _load, ...required } = optional;
  const catalogue = { product: 'fixture-harbour', models: [optional, ...mode === 'shared' ? [{ ...required, key: 'required', id: 'fixture-harbour/required' }] : []] };
  const oldFile = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  const file = vi.spyOn(context.product, 'file').mockImplementation(name => name === 'models/catalogue.json'
    ? Promise.resolve(new TextEncoder().encode(JSON.stringify(catalogue))) : name === 'models/spare.glb' ? Promise.resolve(triangle()) : oldFile(name));
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => ['models/catalogue.json', 'models/spare.glb'].includes(name) || has(name));
  const first = rows.steps[0]; if (first === undefined) throw new Error('Missing direct step');
  try {
    await installWorldScenes(context, parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json',
      libraries: [...rows.libraries, { id: 'optional', kind: 'owned', models: [{ id: 'spare', file: 'models/spare.glb' }] }],
      ...(mode === 'placed' ? { placements: [{ id: 'real-placement', model: 'optional', draw: 'single', poses: [{ x: 0, y: 0, z: 0, yxz: { yaw: 0, scale: 1 } }] }] } : {}),
      ...(mode === 'direct' ? { steps: [{ ...first, geometry: { rock: { library: 'optional', model: 'spare' } } }] } : {}),
    }));
    expect(file.mock.calls.filter(([name]) => name === 'models/spare.glb')).toHaveLength(mode === 'unplaced' ? 0 : 1);
    expect(() => parseWorldSceneModels({ ...catalogue, models: [{ ...catalogue.models[0], load: 'later-maybe' }] })).toThrow();
  } finally { context.scope.dispose(); }
});

test('trail scene collider rows retain the native decoder output exactly', async () => {
  const [{ readColliderRows }, { driftwoodTrailRows }] = await Promise.all([
    import('../src/client/engine/models/colliders'), import('../src/shards/driftwood-isle/generators/fixedFacts'),
  ]);
  const trail = driftwoodTrailRows();
  const context = fixture(), rows = section(), first = rows.steps[0];
  if (first === undefined) throw new Error('Missing first step');
  await installWorldScenes(context, parseWorldScenes({ ...rows, steps: [{ ...first, registry: [{ id: 'trail', name: 'Trail', file: 'trail.json', category: 'props', part: 'root', colliders: trail.worldColliders }], publish: {} }] }));
  const want = readColliderRows(trail.worldColliders, { kinds: ['box', 'treads'], surfaces: [] });
  expect(context.app.registry.pieces[0]?.colliders).toEqual(want);
  expect(JSON.stringify(context.app.registry.pieces[0]?.colliders)).toBe(JSON.stringify(want));
  context.scope.dispose();
});


test('resident catalogue loans reach later world placements through the shared sky context', async () => {
  const [{ defineWorldSceneCatalogue }, { sharedModelContext }, { Rng }, { SkyRig }] = await Promise.all([
    import('../src/client/game/models/worldSceneCatalogue'), import('../src/client/engine/models/model'), import('../src/shared/engine/core/rng'), import('../src/client/engine/world/skyRig'),
  ]);
  const sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing fixture sky');
  const context = fixture(), rows = section(); Object.assign(context.game, { runtime: { world: { sky } } });
  const data = { product: 'fixture-harbour', models: [{ key: 'tower', id: 'fixture-harbour/tower', name: 'Tower', category: 'buildings', pipeline: 'code', file: 'models/tower.ts', defaults: {}, choices: [{ id: 'world', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'wall', library: 'shapes', model: 'stone', material: 'paint' }] }] }] };
  const file = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => name === 'models/catalogue.json' || has(name));
  vi.spyOn(context.product, 'file').mockImplementation(name => name === 'models/catalogue.json' ? Promise.resolve(new TextEncoder().encode(JSON.stringify(data))) : file(name));
  try {
    await installWorldScenes(context, parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json' }));
    const catalogue = defineWorldSceneCatalogue(data), built = catalogue.model('tower').build(sharedModelContext(sky), {}, new Rng(1));
    if (!(built instanceof Group)) throw new Error('Missing resident model');
    expect(built.children[0]).toBeInstanceOf(Mesh); // No loading placeholder group.
    expect(catalogue.material('paint', sharedModelContext(sky))).toBe(built.children[0] instanceof Mesh ? built.children[0].material : null);
  } finally { vi.restoreAllMocks(); context.scope.dispose(); }
});

test.each(['individual', 'page'] as const)('authored raw LODs and deferred %s placements retain their native model contract', async mode => {
  const [{ defineWorldSceneCatalogue }, { sharedModelContext }, { Rng }, { SkyRig }, { parseWorldSceneModels }] = await Promise.all([
    import('../src/client/game/models/worldSceneCatalogue'), import('../src/client/engine/models/model'), import('../src/shared/engine/core/rng'), import('../src/client/engine/world/skyRig'), import('@wildshard/format/worldSceneModels'),
  ]);
  const sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing fixture sky');
  const context = fixture(), rows = section();
  Object.assign(context.game, { renderer: null, runtime: { world: { sky, game: context.game, registry: context.app.registry } } });
  const draw = { id: 'face', library: 'shapes', model: 'stone', material: 'paint', castShadow: true, sphere: [0, 0, 0, 3] };
  const data = { product: 'fixture-harbour', models: [{ key: 'marker', id: 'fixture-harbour/marker', name: 'Marker', category: 'props', pipeline: 'blender', file: 'markers.json', defaults: {}, assembly: 'parts',
    choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [draw], lods: [{ from: 20, draws: [{ ...draw, castShadow: false }] }] }] }] };
  const placement = { id: 'markers.placed', model: 'marker', draw: 'single', cull: { far: { phone: 25, desktop: 35 }, minAngular: { phone: 0.004, desktop: 0.0012 } },
    poses: [{ x: 7, y: 0, z: 9, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 0, 9, 1] }], piece: { id: 'marker-copy' },
    colliders: [{ kind: 'box', hx: 1, hy: 1, hz: 1, x: 7, y: 1, z: 9 }],
  };
  let pageRows: unknown[] = [placement];
  let placementFileReads = 0;
  const file = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => ['models/catalogue.json', 'scenes/placement.json'].includes(name) || has(name));
  vi.spyOn(context.product, 'file').mockImplementation(name => {
    if (name === 'scenes/placement.json') placementFileReads++;
    return name === 'models/catalogue.json' || name === 'scenes/placement.json'
      ? Promise.resolve(new TextEncoder().encode(JSON.stringify(name === 'models/catalogue.json' ? data : mode === 'page' ? { version: 1, rows: pageRows } : placement))) : file(name);
  });
  try {
    if (mode === 'page') {
      const checked = { ...rows, catalogue: 'models/catalogue.json', placements: [{ id: 'markers.placed', file: 'scenes/placement.json', member: 0 }] };
      await expect(installWorldScenes(context, parseWorldScenes({ ...checked, placements: [{ ...checked.placements[0], id: 'foreign' }] }))).rejects.toThrow('identity differs');
      await expect(installWorldScenes(context, parseWorldScenes({ ...checked, placements: [{ ...checked.placements[0], member: 1 }] }))).rejects.toThrow('member differs');
      pageRows = [{ ...placement, tier: 'desktop' }];
      await expect(installWorldScenes(context, parseWorldScenes(checked))).rejects.toThrow('member differs');
      pageRows = [placement, { ...placement, id: 'unselected', poses: [{ x: 0, y: 0, z: 0, matrix: [1] }] }];
      await expect(installWorldScenes(context, parseWorldScenes(checked))).rejects.toThrow();
      expect(context.app.registry.pieces).toHaveLength(0);
      pageRows = [placement, { ...placement, id: 'markers.other', piece: { id: 'marker-other-copy' } }];
    }
    const beforeReads = placementFileReads;
    const handles = await installWorldScenes(context, parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json', placements: [
      { id: 'markers.placed', file: 'scenes/placement.json', ...(mode === 'page' ? { member: 0 } : {}) },
      ...(mode === 'page' ? [{ id: 'markers.other', file: 'scenes/placement.json', member: 1 }] : []),
    ] }));
    expect(placementFileReads - beforeReads).toBe(1);
    if (mode === 'page') expect(handles.has('markers.other')).toBe(true);
    expect(handles.has('markers.placed')).toBe(true);
    expect(handles.has('markers.placed.root')).toBe(false);
    const catalogue = defineWorldSceneCatalogue(data), model = catalogue.model('marker'), ctx = sharedModelContext(sky);
    const near = model.build(ctx, {}, new Rng(1)), far = model.lods?.[0]?.build(ctx, {}, new Rng(1));
    if (near instanceof Object3D) throw new Error('Expected native raw parts');
    expect(near[0]?.geometry.boundingSphere?.radius).toBe(3);
    expect(near[0]?.castShadow).toBe(true); expect(far?.[0]?.castShadow).toBe(false);
    expect(far?.[0]?.geometry).toBe(near[0]?.geometry);
    expect(model.lods?.[0]?.from).toBe(20);
    const placed = await handles.place('markers.placed');
    expect(await handles.place('markers.placed')).toBe(placed);
    expect(handles.object('markers.placed.root')).toBe(placed.object);
    expect(handles.colliders('markers.placed.colliders')).toEqual([{ kind: 'box', x: 7, y: 1, z: 9, hx: 1, hy: 1, hz: 1 }]);
    expect(Object.keys(placed.colliders[0] ?? {})).toEqual(['kind', 'hx', 'hy', 'hz', 'x', 'y', 'z']);
    expect(context.app.registry.pieces.filter(piece => piece.id === 'marker-copy')).toHaveLength(1);
    expect(() => parseWorldSceneModels({ ...data, models: [{ ...data.models[0], choices: [{ ...data.models[0]?.choices[0], lods: [{ from: 20, draws: [] }, { from: 10, draws: [] }] }] }] })).toThrow();
    expect(() => parseWorldScenes({ ...rows, placements: [{ id: 'bad', model: 'marker', draw: 'single', poses: [{ x: 0, y: 0, z: 0, matrix: [1] }] }] })).toThrow();
    const { parseWorldScenePlacement } = await import('@wildshard/format/worldScenePlacement');
    expect(() => parseWorldScenePlacement({ ...placement, poses: [{ ...placement.poses[0], params: { callback: () => 1 } }] })).toThrow('plain JSON');
    expect(() => parseWorldScenePlacement({ ...placement, colliders: [{ callback: () => 1 }] })).toThrow('plain JSON');
  } finally { vi.restoreAllMocks(); context.scope.dispose(); }
});

test.each(['material', 'object'] as const)('source PBR %s intake shares original maps and owns retirement', async mode => {
  const [{ worldSceneSourceMaterial }, rig, { SkyRig }, { Texture, BufferGeometry }, { GLTFLoader }] = await Promise.all([
    import('../src/client/game/shardfile/worldSceneMaterials'), import('../src/client/engine/anim/rig'), import('../src/client/engine/world/skyRig'), import('three'), import('three/examples/jsm/loaders/GLTFLoader.js'),
  ]);
  const { SceneHandles } = await import('../src/client/game/shardfile/sceneHandles');
  const handles = new SceneHandles();
  const owner = new Scope('pbr-source-fixture'), sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing fixture sky');
  const setup = vi.fn(); Object.defineProperty(sky, 'setupMaterial', { value: setup });
  const texture = new Texture(), material = new MeshStandardMaterial({ map: texture, normalMap: texture, roughnessMap: texture, aoMap: texture });
  const geometry = new BufferGeometry(), scene = new Group(); scene.add(new Mesh(geometry, material));
  const disposed = vi.fn(), released = vi.fn(); material.addEventListener('dispose', () => { disposed(); }); geometry.addEventListener('dispose', () => { released(); });
  const file = await new GLTFLoader().parseAsync(Uint8Array.from(triangle()).buffer, '');
  file.scene.clear(); file.scene.add(...scene.children);
  const loader = vi.spyOn(rig, 'loadRigFile').mockResolvedValue(file);
  const rows = parseWorldScenes({ version: 1, libraries: [], materials: [{ id: 'pbr', kind: 'source', url: '/fixture.glb', ...(mode === 'object' ? { publishObject: 'fixture-source' } : {}), aliases: { '/fixture.glb': '/material-only.glb' }, anisotropy: 4, envMapIntensity: 0.8 }], steps: [] });
  const row = rows.materials[0]; if (row?.kind !== 'source') throw new Error('Missing material fixture');
  try {
    expect(await worldSceneSourceMaterial(row, sky, identityProduct, owner, handles)).toBe(material);
    expect(await worldSceneSourceMaterial(row, sky, identityProduct, owner, handles)).toBe(material);
    expect(loader).toHaveBeenCalledTimes(1); expect(loader).toHaveBeenCalledWith('/fixture.glb', row.aliases);
    expect(setup).toHaveBeenCalledWith(material); expect(texture.anisotropy).toBe(4); expect(material.envMapIntensity).toBe(0.8);
    if (mode === 'object') {
      const root = handles.object('fixture-source'); expect(root).toBe(file.scene);
      const mesh = root.children[0]; if (!(mesh instanceof Mesh)) throw new Error('Missing retained source mesh');
      expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material); expect(released).not.toHaveBeenCalled();
    } else expect(released).toHaveBeenCalledOnce();
    owner.dispose(); expect(disposed).toHaveBeenCalledOnce(); expect(released).toHaveBeenCalledOnce(); expect(handles.has('fixture-source')).toBe(false);
  } finally { loader.mockRestore(); owner.dispose(); }
});

test('deferred source slots decode at their named placement', async () => {
  const [sources, { SkyRig }] = await Promise.all([import('../src/client/game/shardfile/worldSceneMaterials'), import('../src/client/engine/world/skyRig')]);
  const sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing fixture sky');
  const context = fixture(), rejected = fixture(), retired = fixture(), material = new MeshStandardMaterial(), rows = section();
  Object.assign(context.game, { renderer: null, runtime: { world: { sky, game: context.game, registry: context.app.registry } } });
  const data = { product: 'fixture-harbour', models: [{ key: 'marker', id: 'fixture-harbour/deferred', name: 'Marker', category: 'props', pipeline: 'blender', file: 'markers.json', defaults: {}, assembly: 'parts',
    choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'face', library: 'shapes', model: 'stone', material: 'paint' }] }] }] };
  const source = { id: 'paint', kind: 'source', load: 'placement', url: '/fixture.glb' };
  const declaration = { ...rows, catalogue: 'models/catalogue.json', materials: [source], placements: [{ id: 'markers.placed', model: 'marker', draw: 'single', poses: [{ x: 0, y: 0, z: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] }], steps: [] };
  const file = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => name === 'models/catalogue.json' || has(name));
  vi.spyOn(context.product, 'file').mockImplementation(name => name === 'models/catalogue.json' ? Promise.resolve(new TextEncoder().encode(JSON.stringify(data))) : file(name));
  const load = vi.spyOn(sources, 'worldSceneSourceMaterial').mockResolvedValue(material);
  try {
    const handles = await installWorldScenes(context, parseWorldScenes(declaration));
    expect(load).not.toHaveBeenCalled();
    await handles.place('markers.placed'); await handles.place('markers.placed');
    expect(load).toHaveBeenCalledOnce();
    await expect(installWorldScenes(rejected, parseWorldScenes({ ...rows, materials: [source] }))).rejects.toThrow('Deferred source material');
    Object.assign(retired.game, { renderer: null, runtime: { world: { sky, game: retired.game, registry: retired.app.registry } } });
    const retiredFile = retired.product.file.bind(retired.product), retiredHas = retired.product.hasFile.bind(retired.product);
    vi.spyOn(retired.product, 'hasFile').mockImplementation(name => name === 'models/catalogue.json' || retiredHas(name));
    vi.spyOn(retired.product, 'file').mockImplementation(name => name === 'models/catalogue.json' ? Promise.resolve(new TextEncoder().encode(JSON.stringify(data))) : retiredFile(name));
    const stale = await installWorldScenes(retired, parseWorldScenes(declaration));
    let complete: (value: MeshStandardMaterial) => void = () => { throw new Error('Missing deferred source initializer'); };
    const decode = new Promise<MeshStandardMaterial>(resolve => { complete = resolve; });
    load.mockReturnValueOnce(decode);
    const placing = stale.place('markers.placed');
    retired.scope.dispose(); complete(material);
    await expect(placing).rejects.toThrow('Scene placement owner is disposed');
    expect(retired.app.registry.pieces).toHaveLength(0);
  } finally { vi.restoreAllMocks(); context.scope.dispose(); rejected.scope.dispose(); retired.scope.dispose(); material.dispose(); }
});

test('building presentation borrows the installed Z2 namespace', async () => {
  const context = fixture(), handles = await installWorldScenes(context, section());
  const mesh = handles.group('harbour.root').children[0];
  if (!(mesh instanceof Mesh)) throw new Error('Missing fixture scene mesh');
  expect(handles.material('materials.paint')).toBe(mesh.material);
  const life = new LivingBuildings(handles, { wheel: 0, door: { seconds: 1, angle: 1 }, fire: [0, 1], lamp: [0, 1], glass: [0, 1], flicker: { depth: 0, waves: [] }, swing: { z: [], x: [0, 0] } });
  const rows = emptyBuildingLifeRows();
  rows.colors.push({ material: 'materials.paint', color: [0.2, 0.4, 0.6], offset: 1, gain: 0, pulse: [0, 0], waves: [], night: [0, 0] });
  life.add(rows); life.update(0);
  expect(handles.standard('materials.paint').color.toArray()).toEqual([0.2, 0.4, 0.6]);
  expect(handles.point({ point: 'harbour.at', offset: [1, 0, -1] }, new Vector3()).toArray()).toEqual([2, 2, 2]);
  expect(() => handles.publish('harbour.root', new Group())).toThrow('Duplicate');
  expect(() => handles.material('harbour.root')).toThrow('Expected scene material');
  context.scope.dispose();
});

test('inactive tier sources are skipped before blob admission and decoding', async () => {
  const { TIER } = await import('../src/client/engine/core/tier');
  const context = fixture(), rows = section(), library = rows.libraries[0];
  if (library?.kind !== 'owned') throw new Error('Missing owned fixture library');
  const tier = TIER === 'phone' ? 'desktop' : 'phone';
  library.models.push({ id: 'inactive', file: 'models/not-shipped.glb', tier, attributes: {} });
  try {
    const handles = await installWorldScenes(context, rows);
    expect(handles.group('harbour.root')).toBeInstanceOf(Group);
  } finally { context.scope.dispose(); }
});


test('native scalar observations gate original contacts without adding a second body', async () => {
  const context = fixture(), rows = section(), step = rows.steps[0];
  if (step?.registry[0] === undefined) throw new Error('Missing contact fixture');
  step.publish['enabled'] = { kind: 'number', value: 0 };
  step.registry[0] = { ...step.registry[0], active: 'harbour.enabled' };
  try {
    const handles = await installWorldScenes(context, rows);
    const piece = context.app.registry.pieces.find(row => row.id === 'harbour-wall');
    if (piece?.active === undefined) throw new Error('Missing original contact predicate');
    expect(piece.active()).toBe(false);
    const contacts = piece.colliders;
    handles.setNumber('harbour.enabled', 1);
    expect(piece.active()).toBe(true);
    expect(piece.colliders).toBe(contacts);
    expect(context.app.registry.pieces.filter(row => row.id === 'harbour-wall')).toHaveLength(1);
    handles.setNumber('harbour.enabled', 0);
    expect(piece.active()).toBe(false);
    expect(() => handles.setNumber('harbour.enabled', Number.NaN)).toThrow('finite');
    expect(() => handles.setNumber('harbour.at', 1)).toThrow('Expected scene number');
  } finally { context.scope.dispose(); }
});

test('retired residents reuse decoder storage with fresh roots, materials and collision owners', async () => {
  const first = fixture(), next = fixture(), assets = first.app.assets;
  Object.assign(next.app, { assets });
  const read = vi.spyOn(next.product, 'file');
  try {
    const a = await installWorldScenes(first, section());
    const original = a.group('harbour.root').children[0];
    if (!(original instanceof Mesh)) throw new Error('Missing first scene draw');
    const originalGeometry: unknown = original.geometry;
    if (!(originalGeometry instanceof NativeBufferGeometry)) throw new Error('Missing first geometry');
    const originalPosition: unknown = originalGeometry.getAttribute('position');
    if (!(originalPosition instanceof NativeBufferAttribute)) throw new Error('Missing first position');
    originalPosition.setX(0, 99);
    first.scope.dispose();
    expect(first.app.registry.pieces).toHaveLength(0);
    expect(assets.retained().map(entry => entry.refs)).toEqual([0]);
    const b = await installWorldScenes(next, section());
    const replacement = b.group('harbour.root').children[0];
    if (!(replacement instanceof Mesh)) throw new Error('Missing next scene draw');
    expect(read.mock.calls.map(([file]) => file)).not.toContain('models/stone.glb');
    expect(b.group('harbour.root')).not.toBe(a.group('harbour.root'));
    expect(replacement.geometry).not.toBe(original.geometry);
    expect(replacement.material).not.toBe(original.material);
    const replacementGeometry: unknown = replacement.geometry;
    if (!(replacementGeometry instanceof NativeBufferGeometry)) throw new Error('Missing next geometry');
    const replacementPosition: unknown = replacementGeometry.getAttribute('position');
    if (!(replacementPosition instanceof NativeBufferAttribute)) throw new Error('Missing next position');
    expect(replacementPosition.getX(0)).toBe(0);
    expect(next.app.registry.pieces).toHaveLength(1);
    next.scope.dispose(); expect(next.app.registry.pieces).toHaveLength(0);
  } finally {
    first.scope.dispose(); next.scope.dispose();
    for (const entry of assets.retained()) assets.evictCached(entry.key);
    read.mockRestore();
  }
});

test.each(['harbour.at', 'markers.east.enabled', 'absent'])('collision scalar %s refuses before scene mutation', async active => {
  const context = { ...fixture(), root: new Group() }, rows = section(), step = rows.steps[0], later = rows.steps[1];
  if (step === undefined || later === undefined || step.registry[0] === undefined) throw new Error('Missing contact fixture');
  step.registry[0].active = active;
  later.publish['enabled'] = { kind: 'number', value: 1 };
  try {
    await expect(installWorldScenes(context, rows)).rejects.toThrow('published scalar');
    expect(context.root.children).toHaveLength(0);
    expect(context.app.registry.pieces).toHaveLength(0);
    expect(() => parseWorldScenes({ ...rows, steps: [{ ...step, registry: [{ ...step.registry[0], mode: 'board' }] }] })).toThrow();
  } finally { context.scope.dispose(); }
});

test('a cold card reads a pool part from its declared file only, exactly as the resident pool decodes it', async () => {
  const [{ defineWorldSceneCatalogue, bindWorldSceneModelSources }, { modelContext }, { Rng }, { withOwner }, { parseWorldSceneModels }, { worldScenePool }, { CAST_SOURCES }] = await Promise.all([
    import('../src/client/game/models/worldSceneCatalogue'), import('../src/client/engine/models/model'), import('../src/shared/engine/core/rng'), import('../src/shared/engine/app/ownership'),
    import('@wildshard/format/worldSceneModels'), import('../src/client/game/shardfile/scenePools'), import('../src/shards/nine-dragon-stack/generators/castSources'),
  ]);
  const context = fixture(), owner = new Scope('pool-card'), ctx = modelContext(null), base = section();
  // Nine's real cast pool holding the lion: its files, parts and channel rules, served from its shipped blobs
  const pool = CAST_SOURCES.find(row => row.files.some(entry => entry.parts.includes('lion')));
  if (pool === undefined) throw new Error('Missing the lion cast pool');
  const blobs = new Map((await nineCastBlobs()).map(row => [row.file.name, row.bytes]));
  const rows = parseWorldScenes({ ...base, libraries: [...base.libraries, pool], catalogue: 'models/catalogue.json' });
  const catalogueRows = { product: 'fixture-harbour', models: [{ key: 'lion', id: 'fixture-harbour/lion', name: 'Lion', category: 'props', pipeline: 'trellis', file: 'casts.json', defaults: {},
    assembly: 'parts', choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'main', library: pool.id, model: 'lion', material: 'paint' }] }] }] };
  const oldFile = context.product.file.bind(context.product);
  const file = vi.spyOn(context.product, 'file').mockImplementation(name => { const blob = blobs.get(name);
    return name === 'models/catalogue.json' ? Promise.resolve(new TextEncoder().encode(JSON.stringify(catalogueRows))) : blob === undefined ? oldFile(name) : Promise.resolve(blob); });
  Object.assign(context.product, { section: () => rows });
  const product = vi.spyOn(runtimeProducts, 'loadFirstPartyProduct').mockResolvedValue(context.product);
  const material = new MeshStandardMaterial();
  bindWorldSceneModelSources(ctx, 'fixture-harbour', { catalogue: parseWorldSceneModels(catalogueRows), geometries: new Map(), materials: new Map([['paint', material]]) }, context.scope);
  const libraryRow = rows.libraries.find(row => row.kind === 'pool');
  if (libraryRow?.kind !== 'pool') throw new Error('Missing fixture pool');
  const resident = worldScenePool(context.product, libraryRow); await resident.preload();
  try {
    const catalogue = defineWorldSceneCatalogue(catalogueRows), built = withOwner(owner, () => catalogue.model('lion').build(ctx, {}, new Rng(1)));
    if (!(built instanceof Group)) throw new Error('Missing loading specimen');
    await vi.waitFor(() => { expect(built.children[0]).toBeInstanceOf(Group); });
    const filled = built.children[0], draw = filled?.children[0];
    if (!(draw instanceof Mesh)) throw new Error('Missing cold pool draw');
    const cold: unknown = draw.geometry, warm: NativeBufferGeometry | null = resident.geometry('lion');
    if (!(cold instanceof NativeBufferGeometry) || warm === null) throw new Error('Missing pool geometry');
    // the serialised channels, index, groups and bounds of both decodes
    expect(cold.toJSON().data).toEqual(warm.toJSON().data);
    // only the lion's own file of its pool was read for the card (the resident decode above read them all)
    const lionFile = pool.files.find(entry => entry.parts.includes('lion'))?.file;
    const casts = file.mock.calls.map(([name]) => name).filter(name => name.startsWith('geometry/casts/'));
    expect(casts.filter(name => name !== lionFile)).toHaveLength(pool.files.length - 1); expect(casts.filter(name => name === lionFile)).toHaveLength(2);
    const dispose = vi.spyOn(cold, 'dispose'); owner.dispose(); expect(dispose).toHaveBeenCalledOnce();
    const again = new Scope('pool-card-again');
    try {
      const next = withOwner(again, () => catalogue.model('lion').build(ctx, {}, new Rng(1)));
      if (!(next instanceof Group)) throw new Error('Missing revisited pool card');
      await vi.waitFor(() => { expect(next.children[0]).toBeInstanceOf(Group); });
    } finally { again.dispose(); }
    warm.dispose();
  } finally { file.mockRestore(); product.mockRestore(); owner.dispose(); context.scope.dispose(); material.dispose(); }
});

test('a cold pool card under a retiring cell reads nothing more and publishes no geometry once its preload returns', async () => {
  const [{ defineWorldSceneCatalogue, bindWorldSceneModelSources }, { modelContext }, { Rng }, { withOwner }, { parseWorldSceneModels }, { CAST_SOURCES }] = await Promise.all([
    import('../src/client/game/models/worldSceneCatalogue'), import('../src/client/engine/models/model'), import('../src/shared/engine/core/rng'), import('../src/shared/engine/app/ownership'),
    import('@wildshard/format/worldSceneModels'), import('../src/shards/nine-dragon-stack/generators/castSources'),
  ]);
  const context = fixture(), cell = new Scope('cell'), owner = cell.child('pool-card'), ctx = modelContext(null), base = section();
  const pool = CAST_SOURCES.find(row => row.files.some(entry => entry.parts.includes('lion')));
  const lionFile = pool?.files.find(entry => entry.parts.includes('lion'))?.file;
  if (pool === undefined || typeof lionFile !== 'string') throw new Error('Missing the lion cast pool');
  const blobs = new Map((await nineCastBlobs()).map(row => [row.file.name, row.bytes]));
  const rows = parseWorldScenes({ ...base, libraries: [...base.libraries, pool], catalogue: 'models/catalogue.json' });
  const catalogueRows = { product: 'fixture-harbour', models: [{ key: 'lion', id: 'fixture-harbour/lion', name: 'Lion', category: 'props', pipeline: 'trellis', file: 'casts.json', defaults: {},
    assembly: 'parts', choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [{ id: 'main', library: pool.id, model: 'lion', material: 'paint' }] }] }] };
  // the lion's pool file arrives only after its cell starts retiring
  let release = (): void => undefined;
  const held = new Promise<void>(resolve => { release = resolve; }), reads: string[] = [], oldFile = context.product.file.bind(context.product);
  const file = vi.spyOn(context.product, 'file').mockImplementation(async name => {
    reads.push(name);
    if (name === 'models/catalogue.json') return new TextEncoder().encode(JSON.stringify(catalogueRows));
    if (name === lionFile) await held;
    return blobs.get(name) ?? oldFile(name);
  });
  Object.assign(context.product, { section: () => rows });
  const product = vi.spyOn(runtimeProducts, 'loadFirstPartyProduct').mockResolvedValue(context.product);
  const material = new MeshStandardMaterial();
  bindWorldSceneModelSources(ctx, 'fixture-harbour', { catalogue: parseWorldSceneModels(catalogueRows), geometries: new Map(), materials: new Map([['paint', material]]) }, context.scope);
  try {
    const built = withOwner(owner, () => defineWorldSceneCatalogue(catalogueRows).model('lion').build(ctx, {}, new Rng(1)));
    if (!(built instanceof Group)) throw new Error('Missing loading specimen');
    await vi.waitFor(() => { expect(reads).toContain(lionFile); });
    cell.onDispose(() => undefined);
    const steps = cell.disposeSteps(); steps.next();
    expect(owner.disposing).toBe(true);
    const before = reads.length;
    release();
    await new Promise<void>(resolve => { setTimeout(resolve, 50); });
    expect(reads).toHaveLength(before); expect(built.children.some(child => child instanceof Group)).toBe(false);
    for (let step = steps.next(); step.done !== true; step = steps.next()) { /* finish the retirement */ }
    expect(built.children.some(child => child instanceof Group)).toBe(false);
  } finally { file.mockRestore(); product.mockRestore(); cell.dispose(); context.scope.dispose(); material.dispose(); }
});

function placementReads(holdCatalogue = false) {
  const context = fixture(), started: number[] = [], geometry: string[] = [];
  const rows = section(), encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const draw = { id: 'face', library: 'shapes', model: 'stone', material: 'paint', sphere: [0, 0, 0, 3] };
  const catalogue = { product: 'fixture-harbour', models: [{ key: 'marker', id: 'fixture-harbour/marker', name: 'Marker', category: 'props', pipeline: 'code', file: 'markers.json', defaults: {}, assembly: 'parts',
    choices: [{ id: 'only', params: {}, size: [1, 1, 1], colliders: [], draws: [draw] }] }] };
  const pending = Array.from({ length: 5 }, () => {
    let resolveRead: ((bytes: Uint8Array) => void) | undefined, rejectRead: ((reason: Error) => void) | undefined;
    const promise = new Promise<Uint8Array>((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
    return { promise, release: (index: number, id = `marker-${index}`) => {
      if (resolveRead === undefined) throw new Error('Missing placement resolver');
      resolveRead(encode({ id, model: 'marker', draw: 'single', poses: [] }));
    }, fail: (error: Error) => { if (rejectRead === undefined) throw new Error('Missing placement rejecter'); rejectRead(error); } };
  });
  const file = context.product.file.bind(context.product), has = context.product.hasFile.bind(context.product);
  let catalogueReady: (bytes: Uint8Array) => void = () => undefined;
  const catalogueRead = new Promise<Uint8Array>(resolve => { catalogueReady = resolve; }), metadata: string[] = [];
  vi.spyOn(context.product, 'hasFile').mockImplementation(name => name === 'models/catalogue.json' || /^scenes\/p[0-4]\.json$/u.test(name) || has(name));
  vi.spyOn(context.product, 'file').mockImplementation(name => {
    metadata.push(name);
    if (name === 'models/catalogue.json') return holdCatalogue ? catalogueRead : Promise.resolve(encode(catalogue));
    const match = /^scenes\/p([0-4])\.json$/u.exec(name);
    if (match !== null) {
      const index = Number(match[1]), read = pending[index];
      if (read === undefined) throw new Error('Missing placement read'); started.push(index); return read.promise;
    }
    if (name.endsWith('.glb')) geometry.push(name); return file(name);
  });
  const input = parseWorldScenes({ ...rows, catalogue: 'models/catalogue.json', placements: pending.map((_, index) => ({ id: `marker-${index}`, file: `scenes/p${index}.json` })) });
  return { context, started, geometry, pending, input, metadata, releaseCatalogue: () => { catalogueReady(encode(catalogue)); } };
}

test('catalogue, recipes and placements share the upfront read pool while the catalogue is held', async () => {
  const f = placementReads(true);
  try {
    const installing = installWorldScenes(f.context, f.input);
    await vi.waitFor(() => { expect(f.started).toEqual([0, 1, 2, 3, 4]); });
    expect(f.metadata).toContain('scenes/open.json'); expect(f.metadata).toContain('scenes/cell.json');
    expect(f.geometry).toEqual([]);
    for (let index = 0; index < 5; index++) f.pending[index]?.release(index);
    f.releaseCatalogue(); await installing;
    expect(f.metadata.filter(file => file === 'scenes/open.json')).toHaveLength(1);
  } finally { f.releaseCatalogue(); vi.restoreAllMocks(); f.context.scope.dispose(); }
});

test('placement reads overlap up front and retain original scene construction', async () => {
  const f = placementReads();
  try {
    const installing = installWorldScenes(f.context, f.input);
    await vi.waitFor(() => { expect(f.started).toEqual([0, 1, 2, 3, 4]); });
    for (const index of [3, 2, 1]) f.pending[index]?.release(index);
    await Promise.resolve(); expect(f.started).toHaveLength(5); expect(f.geometry).toEqual([]);
    f.pending[0]?.release(0);
    await vi.waitFor(() => { expect(f.started).toEqual([0, 1, 2, 3, 4]); });
    f.pending[4]?.release(4);
    const handles = await installing;
    expect(f.geometry).toEqual(['models/stone.glb']);
    expect(handles.group('harbour.root').children[0]?.name).toBe('fixture-stone');
    expect(handles.number('harbour.height')).toBe(7);
    expect(handles.colliders('harbour.collision')).toHaveLength(1);
  } finally { vi.restoreAllMocks(); f.context.scope.dispose(); }
});

test('speculative reads drain and retain the earlier authored parse refusal before geometry', async () => {
  const f = placementReads(); let ended = false;
  try {
    const installing = installWorldScenes(f.context, f.input);
    const refusal = (async () => { try { await installing; return undefined; } catch (error) { return error; } finally { ended = true; } })();
    await vi.waitFor(() => { expect(f.started).toHaveLength(5); });
    f.pending[1]?.fail(new Error('later transport failed')); f.pending[0]?.release(0, 'wrong-id');
    await Promise.resolve(); expect(ended).toBe(false); expect(f.geometry).toEqual([]);
    f.pending[2]?.release(2); f.pending[3]?.release(3); f.pending[4]?.release(4);
    expect(await refusal).toEqual(new Error('Scene placement blob identity differs'));
    expect(f.started).toEqual([0, 1, 2, 3, 4]); expect(f.geometry).toEqual([]);
  } finally { vi.restoreAllMocks(); f.context.scope.dispose(); }
});

test.each(['disposed', 'disposing'] as const)('placement reads do not allocate after a %s resident finishes held metadata reads', async state => {
  const f = placementReads();
  try {
    const installing = installWorldScenes(f.context, f.input), refusal = (async () => { try { await installing; return undefined; } catch (error) { return error; } })();
    await vi.waitFor(() => { expect(f.started).toHaveLength(5); });
    const steps = f.context.scope.disposeSteps();
    if (state === 'disposed') { Array.from(steps); }
    else { steps.next(); expect(f.context.scope.disposing).toBe(true); }
    for (let index = 0; index < 5; index++) f.pending[index]?.release(index);
    expect(await refusal).toEqual(new Error('Scene placement owner is disposed'));
    expect(f.started).toEqual([0, 1, 2, 3, 4]); expect(f.geometry).toEqual([]);
  } finally { vi.restoreAllMocks(); f.context.scope.dispose(); }
});


test('independent pool publications retain native geometry and retire on the supplied scene owner', async () => {
  const context = fixture(), bytes = triangle('tile'), reads: string[] = [];
  const { TIER } = await import('../src/client/engine/core/tier');
  vi.spyOn(context.product, 'hasFile').mockReturnValue(true);
  vi.spyOn(context.product, 'file').mockImplementation(name => { reads.push(name); return Promise.resolve(bytes); });
  const rows = parseWorldScenes({ version: 1, materials: [], steps: [], libraries: [
    { id: 'tiles', kind: 'pool', publish: 'terrain', files: [
      { file: 'inactive.glb', tier: TIER === 'phone' ? 'desktop' : 'phone', parts: ['unused'] }, { file: 'tile.glb', tier: TIER, parts: ['tile'] },
    ] },
  ] });
  const { worldScenesForTier } = await import('@wildshard/format/worldScenes');
  const handles = await installWorldScenes(context, worldScenesForTier(rows, TIER));
  const geometry = handles.geometry('terrain.tile'), disposed = vi.spyOn(geometry, 'dispose');
  expect(reads).toEqual(['tile.glb']); expect(geometry.getAttribute('position').count).toBe(3);
  expect(Array.from(geometry.getAttribute('position').array)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  expect(geometry.boundingBox?.max.toArray()).toEqual([1, 1, 0]);
  context.scope.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
});


test('a resident pool held across ancestor retirement publishes no native geometry', async () => {
  const context = fixture(), resident = context.scope.child('retained.scene'), bytes = triangle('tile');
  let release: (value: Uint8Array) => void = () => undefined, started: () => void = () => undefined;
  const held = new Promise<Uint8Array>(resolve => { release = resolve; }), reading = new Promise<void>(resolve => { started = resolve; });
  vi.spyOn(context.product, 'hasFile').mockReturnValue(true);
  vi.spyOn(context.product, 'file').mockImplementation(() => { started(); return held; });
  const { SceneHandles } = await import('../src/client/game/shardfile/sceneHandles');
  const publish = vi.spyOn(SceneHandles.prototype, 'publish');
  const rows = parseWorldScenes({ version: 1, materials: [], steps: [], libraries: [{ id: 'tiles', kind: 'pool', publish: 'terrain', files: [{ file: 'tile.glb', parts: ['tile'] }] }] });
  const pending = installWorldScenes(context, rows, resident); await reading;
  context.scope.onDisposeSteps(function* retirementSlices() { yield; yield; });
  const retiring = context.scope.disposeSteps(); retiring.next();
  expect(resident.disposed).toBe(false); expect(resident.disposing).toBe(true);
  release(bytes); await expect(pending).rejects.toThrow('scene owner is retired');
  expect(publish).not.toHaveBeenCalled();
  while (retiring.next().done !== true) { /* complete the original native owner's retirement */ }
});

test('file-backed scene specimens prepare exact bytes before publishing resident resources',async()=>{
  const {entryDeckSpecimen,entryDeckFiles}=await import('../src/shards/driftwood-isle/generators/entryDeckSpecimen');
  const specimen=await import('../src/client/game/models/specimenCatalogue'),{SkyRig}=await import('../src/client/engine/world/skyRig');
  for(const truncated of [false,true]){
    const context=fixture(),sky:unknown=Object.create(SkyRig.prototype);if(!(sky instanceof SkyRig))throw new Error('Missing fixture sky');
    Object.assign(context.game,{runtime:{world:{sky}}});
    const raw=entryDeckFiles(),extra=new Map(raw.map(row=>[row.name,truncated?row.bytes.subarray(4):row.bytes]));
    const catalogue='models/deck-catalogue.json';extra.set(catalogue,new TextEncoder().encode(JSON.stringify({product:'fixture-harbour',models:[]})));
    const file=context.product.file.bind(context.product),has=context.product.hasFile.bind(context.product);
    vi.spyOn(context.product,'hasFile').mockImplementation(name=>extra.has(name)||has(name));
    vi.spyOn(context.product,'file').mockImplementation(name=>extra.has(name)?Promise.resolve(extra.get(name)??new Uint8Array()):file(name));
    const define=vi.spyOn(specimen,'defineSpecimenCatalogue');
    try{
      const rows=parseWorldScenes({...section(),catalogue,specimens:[entryDeckSpecimen()],placements:[{id:'deck',model:'entryDeck',draw:'single',poses:[{x:0,y:0,z:0,yxz:{yaw:0,scale:1}}]}]});
      if(truncated){await expect(installWorldScenes(context,rows)).rejects.toThrow('byte count');expect(define).not.toHaveBeenCalled();expect(context.app.registry.pieces).toEqual([]);}
      else{const handles=await installWorldScenes(context,rows);expect(handles.placementModel('deck')).toBe('driftwood-isle/entry-deck');expect(define).toHaveBeenCalledTimes(1);expect(define.mock.calls[0]?.[3]).toEqual(new Map(raw.map(row=>[row.name,row.bytes])));}
    }finally{vi.restoreAllMocks();context.scope.dispose();}
  }
});

test('late material hints require unique finite declared texture sources', () => {
  const rows = { ...section(), materials: [{ id: 'paint', kind: 'source', url: '/original.glb' }], steps: [] };
  expect(parseWorldScenes({ ...rows, lateMaterials: [{ id: 'paint', at: [10, -20] }] }).lateMaterials).toEqual([{ id: 'paint', at: [10, -20] }]);
  expect(() => parseWorldScenes({ ...rows, lateMaterials: [{ id: 'missing', at: [10, -20] }] })).toThrow();
  expect(() => parseWorldScenes({ ...rows, lateMaterials: [{ id: 'paint', at: [10, -20] }, { id: 'paint', at: [20, 30] }] })).toThrow();
  expect(() => parseWorldScenes({ ...rows, lateMaterials: [{ id: 'paint', at: [Infinity, -20] }] })).toThrow();
  expect(() => parseWorldScenes({ ...rows, materials: [{ id: 'paint', kind: 'basic', properties: {} }], lateMaterials: [{ id: 'paint', at: [10, -20] }] })).toThrow();
});

test.each(['late','played','published','retired','hinted','hinted-played','hinted-retired','hinted-living'] as const)('source maps shared with a cold specimen respect %s draw ownership',async mode=>{
  const [sources,{SkyRig},{reachControl}]=await Promise.all([import('../src/client/game/shardfile/worldSceneMaterials'),import('../src/client/engine/world/skyRig'),import('../src/client/engine/boot/prefetch')]);
  const sky:unknown=Object.create(SkyRig.prototype);if(!(sky instanceof SkyRig))throw new Error('Missing late material sky');
  const ctx=fixture(),level=ctx.scope.child('control'),material=new MeshStandardMaterial();
  Object.assign(ctx.game,{levelScope:level,runtime:{world:{sky,game:ctx.game,registry:ctx.app.registry,player:{position:new Vector3()}}}});
  const graph={id:'specimen.shape',root:'specimen.root',nodes:[{id:'shape',parent:'specimen.root',kind:'mesh',geometry:{library:'shapes',model:'stone'},material:'paint',sphere:[0,0,0,2]}]};
  const late={...graph,id:'late.draw',root:'late.root',nodes:graph.nodes.map(node=>({...node,parent:'late.root'}))};
  const catalogue={product:'fixture-harbour',models:[{key:'shape',id:'fixture-harbour/shape',name:'Shape',file:'shape.json',category:'props',pipeline:'code',assembly:'scene',defaults:{},
    choices:[{id:'only',params:{},size:[1,1,1],draws:[],colliders:[],scene:{file:'scenes/specimen.json'}}]}]};
  const declarations:readonly(readonly[string,unknown])[]=[['models/catalogue.json',catalogue],['scenes/specimen.json',graph],['scenes/late.json',late]];
  const extra=new Map(declarations.map(([name,value])=>[name,new TextEncoder().encode(JSON.stringify(value))] as const));
  const file=ctx.product.file.bind(ctx.product),has=ctx.product.hasFile.bind(ctx.product);
  vi.spyOn(ctx.product,'file').mockImplementation(name=>extra.has(name)?Promise.resolve(extra.get(name)??new Uint8Array()):file(name));
  vi.spyOn(ctx.product,'hasFile').mockImplementation(name=>extra.has(name)||has(name));
  const load=vi.spyOn(sources,'worldSceneSourceMaterial').mockResolvedValue(material);
  try{
    const rows=parseWorldScenes({...section(),catalogue:'models/catalogue.json',materials:[{id:'paint',kind:'source',load:'placement',url:'/original.glb',...(mode==='published'||mode.startsWith('hinted')?{publishObject:'source.shape'}:{})}],steps:[],
      ...(mode.startsWith('hinted')?{lateMaterials:[{id:'paint',at:[100,100]}]}:{}),
      welds:[{id:'late.draw',file:'scenes/late.json',...(mode==='played'||mode==='hinted-played'?{}:{late:{at:[100,100]}})}]});
    const handles=await installWorldScenes(ctx,rows);
    expect(load).toHaveBeenCalledTimes(mode==='played'||mode==='published'||mode==='hinted-played'?1:0);
    if(mode==='retired'||mode==='hinted-retired'){ctx.scope.dispose();reachControl(level);expect(load).not.toHaveBeenCalled();return;}
    const published=handles.published('late.draw');
    const living=mode==='hinted-living'?published.then(()=>handles.afterControl('living:fixture',{x:100,z:100},['paint'],async()=>{await handles.published('materials.paint');expect(handles.material('materials.paint')).toBe(material);})):undefined;
    reachControl(level);await published;await living;
    expect(load).toHaveBeenCalledOnce();expect(handles.has('late.draw')).toBe(true);
  }finally{ctx.scope.dispose();material.dispose();vi.restoreAllMocks();}
});

test.each(['late','resident','played','placed','alternate-placement','immediate','mapped','retired'] as const)('late surface scans preserve %s material consumers',async mode=>{
  const [surfaces,{SkyRig},{reachControl},{buildTier}]=await Promise.all([import('../src/client/game/shardfile/worldSceneSurface'),import('../src/client/engine/world/skyRig'),import('../src/client/engine/boot/prefetch'),import('../src/client/engine/core/tier')]);
  const sky:unknown=Object.create(SkyRig.prototype);if(!(sky instanceof SkyRig))throw new Error('Missing late surface sky');
  const ctx=fixture(),level=ctx.scope.child('control'),material=new MeshStandardMaterial();
  Object.assign(ctx.game,{levelScope:level,runtime:{world:{sky,game:ctx.game,registry:ctx.app.registry,player:{position:new Vector3()}}}});
  const graph={id:'specimen.shape',root:'specimen.root',nodes:[{id:'shape',parent:'specimen.root',kind:'mesh',geometry:{library:'shapes',model:'stone'},material:'paint',sphere:[0,0,0,2]}]};
  const late={...graph,id:'late.draw',root:'late.root',nodes:graph.nodes.map(node=>({...node,parent:'late.root'}))};
  const catalogue={product:'fixture-harbour',models:[{key:'shape',id:'fixture-harbour/shape',name:'Shape',file:'shape.json',category:'props',pipeline:'code',assembly:'scene',defaults:{},
    choices:[{id:'only',params:{},size:[1,1,1],draws:[],colliders:[],scene:{file:'scenes/specimen.json'}}]}]};
  const declarations:readonly(readonly[string,unknown])[]=[['models/catalogue.json',catalogue],['scenes/specimen.json',graph],['scenes/late.json',late],
    ['scenes/alternate.json',{...late,placements:['placed.shape']}]];
  const extra=new Map(declarations.map(([name,value])=>[name,new TextEncoder().encode(JSON.stringify(value))] as const));
  const file=ctx.product.file.bind(ctx.product),has=ctx.product.hasFile.bind(ctx.product);
  vi.spyOn(ctx.product,'file').mockImplementation(name=>extra.has(name)?Promise.resolve(extra.get(name)??new Uint8Array()):file(name));
  vi.spyOn(ctx.product,'hasFile').mockImplementation(name=>extra.has(name)||has(name));
  const load=vi.spyOn(surfaces,'worldSceneSurfaceMaterial').mockResolvedValue(material);
  const prepare=vi.spyOn(surfaces,'prepareWorldSceneSurfaces').mockResolvedValue(undefined);
  try{
    const base=section(),input={...base,catalogue:'models/catalogue.json',materials:[{id:'paint',kind:'surface',scan:'fixture-scan',properties:{},...(mode==='resident'?{}:{load:'placement'})},
      ...(mode==='mapped'?[{id:'copied',kind:'mapped',material:{kind:'standard',properties:{},source:{material:'paint',maps:['map']}}}]:[])],
      steps:mode==='immediate'?base.steps:[],placements:mode==='placed'||mode==='alternate-placement'?[{id:'placed.shape',model:'shape',draw:'single',poses:[{x:0,y:0,z:0,yxz:{yaw:0,scale:1}}]}]:[],
      welds:[{id:'late.draw',file:mode==='alternate-placement'?{phone:buildTier()==='phone'?'scenes/late.json':'scenes/alternate.json',desktop:buildTier()==='desktop'?'scenes/late.json':'scenes/alternate.json'}:'scenes/late.json',...(mode==='played'?{}:{late:{at:[100,100]}})}]};
    if(mode==='mapped'){
      expect(()=>parseWorldScenes(input)).toThrow('Mapped scene materials map an earlier resident source');
      expect(load).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();return;
    }
    const rows=parseWorldScenes(input);
    const handles=await installWorldScenes(ctx,rows),early=mode!=='late'&&mode!=='retired'&&mode!=='alternate-placement';
    expect(load).toHaveBeenCalledTimes(early?1:0);
    expect(prepare).toHaveBeenCalledTimes(early?1:0);
    if(early)expect(prepare.mock.calls[0]?.[0].map(row=>row.id)).toEqual(['paint']);
    if(mode==='retired'){ctx.scope.dispose();reachControl(level);expect(load).not.toHaveBeenCalled();return;}
    const published=handles.published('late.draw');reachControl(level);await published;
    expect(load).toHaveBeenCalledOnce();expect(handles.has('late.draw')).toBe(true);
  }finally{ctx.scope.dispose();material.dispose();vi.restoreAllMocks();}
});


test.each([false, true])('a completed owned read uses its current budget (live=%s)', async live => {
  const context = fixture(), read = context.product.file.bind(context.product), nativeSlice = work.workSlice, nativeYield = work.buildYield;
  const yielded: (Scope | undefined)[] = []; let at = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => at);
  const presenting = vi.spyOn(pacing, 'presenting').mockReturnValue(true);
  vi.spyOn(pacing, 'buildHeld').mockReturnValue(true);
  vi.spyOn(pacing, 'frameBudgetSpent').mockReturnValue(false);
  // Loading now shares its completion checkpoint; Node's local slice and
  // the browser checkpoint must still report the same one real pause.
  vi.spyOn(work, 'buildYield').mockImplementation((owner, budget) => {
    yielded.push(owner); return nativeYield(owner, budget);
  });
  vi.spyOn(work, 'workSlice').mockImplementation((budget, owner) => {
    const slice = nativeSlice(budget, owner);
    return { ...slice, yield: () => { yielded.push(owner); return slice.yield(); } };
  });
  vi.spyOn(context.product, 'file').mockImplementation(async name => {
    const bytes = await read(name);
    if (name === 'models/stone.glb') at = 100; // Waiting crossed the old local slice.
    return bytes;
  });
  try {
    // Start the shared loading slice at its real phase boundary. A network
    // completion alone no longer creates a fresh private loading clock.
    expect(constructionCheckpoint(context.scope)).toBeUndefined();
    presenting.mockReturnValue(live);
    expect(constructionCheckpoint(context.scope)).toBeUndefined();
    const handles = await installWorldScenes(context, section());
    const stone = handles.object('markers.east.stone');
    expect(stone).toBeInstanceOf(Mesh);
    if (!(stone instanceof Mesh)) throw new Error('Missing admitted stone');
    const geometry: unknown = stone.geometry;
    if (!(geometry instanceof NativeBufferGeometry)) throw new Error('Missing admitted stone geometry');
    const position: unknown = geometry.getAttribute('position');
    if (!(position instanceof NativeBufferAttribute)) throw new Error('Missing admitted stone position');
    expect([...position.array]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(yielded).toHaveLength(live ? 0 : 1);
    expect(context.app.assets.retained().every(entry => entry.refs === 0)).toBe(true);
  } finally { context.scope.dispose(); vi.restoreAllMocks(); }
});

test('a spent owned-model completion preserves refusal and drains its leases', async () => {
  const context = fixture(), failure = new Error('original model completion refusal');
  vi.spyOn(pacing, 'presenting').mockReturnValue(true);
  vi.spyOn(pacing, 'buildHeld').mockReturnValue(true);
  // Spend at real model adoption, after the decoder and asset lease exist.
  // Byte arrival is earlier: parser pacing also checks the shared budget.
  vi.spyOn(pacing, 'frameBudgetSpent').mockImplementation(() => context.app.assets.retained().some(entry => entry.refs > 0));
  const registered = vi.spyOn(context.app.assets, 'register');
  const pause = vi.spyOn(work, 'buildYield').mockRejectedValue(failure);
  try {
    await expect(installWorldScenes(context, section())).rejects.toBe(failure);
    expect(pause).toHaveBeenCalledOnce();
    expect(registered).toHaveBeenCalledOnce();
    expect(registered.mock.calls[0]?.[1]).toBeInstanceOf(NativeBufferGeometry);
    expect(context.app.assets.retained().length).toBeGreaterThan(0);
    expect(context.app.assets.retained().every(entry => entry.refs === 0)).toBe(true);
  } finally { context.scope.dispose(); vi.restoreAllMocks(); }
});


test('retiring during an owned-model completion prevents scene publication', async () => {
  const context = fixture();
  vi.spyOn(pacing, 'presenting').mockReturnValue(true);
  vi.spyOn(pacing, 'buildHeld').mockReturnValue(true);
  // Spend at real model adoption, after the decoder and asset lease exist.
  // Byte arrival is earlier: parser pacing also checks the shared budget.
  vi.spyOn(pacing, 'frameBudgetSpent').mockImplementation(() => context.app.assets.retained().some(entry => entry.refs > 0));
  const registered = vi.spyOn(context.app.assets, 'register');
  const pause = vi.spyOn(work, 'buildYield').mockImplementation(owner => { owner.dispose(); return Promise.resolve(); });
  try {
    await expect(installWorldScenes(context, section())).rejects.toThrow('scope has closed');
    expect(pause).toHaveBeenCalledOnce();
    expect(registered).toHaveBeenCalledOnce();
    expect(registered.mock.calls[0]?.[1]).toBeInstanceOf(NativeBufferGeometry);
    expect(context.app.assets.retained().length).toBeGreaterThan(0);
    expect(context.app.assets.retained().every(entry => entry.refs === 0)).toBe(true);
    expect(context.app.registry.pieces).toHaveLength(0);
  } finally { context.scope.dispose(); vi.restoreAllMocks(); }
});

// Slab rows store content hashes, whereas other scene imports store logical blob names.
// Both authorities must be checked before a world allocates geometry.
test.each(['declared-glb', 'undeclared', 'wrong-kind'] as const)('world scenes require declared slab imports: %s', async kind => {
  const context = fixture(), hash = 'a'.repeat(64), rows = section();
  context.product.shardfile.files.push({ hash, kind: kind === 'wrong-kind' ? 'binary' : 'glb', compressed: 12, decoded: 12,
    gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: false });
  if (kind === 'undeclared') context.product.shardfile.files.pop();
  rows.libraries.push({ id: 'fine', kind: 'whole', load: 'refine', models: [{ id: 'fabric', part: 'fabric', files: [hash] }] },
    { id: 'slabs', kind: 'slabs', of: 'fine', keys: [{ id: 'k0', node: 'fabric', material: 'paint', castShadow: false, receiveShadow: false,
      renderOrder: 0, layers: 1, frustumCulled: true, visible: true, sources: ['fabric'] }],
    tiles: [{ tile: 0, files: [{ file: hash, chunks: [{ key: 'k0', bytes: 12, geometricError: 0, box: [0, 0, 0, 1, 1, 1], sphere: [0, 0, 0, 2] }] }] }] });
  context.product.shardfile.props = { version: 1, family: 'fixture', tiles: [], panels: [], models: [], far: null, colliders: [], textures: [] };
  const read = vi.spyOn(context.product, 'file');
  try {
    expect(context.product.hasFile(hash)).toBe(false); // A content hash is never a logical file name.
    if (kind === 'declared-glb') {
      const handles = await installWorldScenes(context, rows);
      expect(handles.object('markers.east.stone')).toBeInstanceOf(Mesh);
      expect(read.mock.calls.every(([name]) => context.product.hasFile(name))).toBe(true);
    } else {
      await expect(installWorldScenes(context, rows)).rejects.toThrow(`Missing world scene slab: ${hash}`);
      expect(read.mock.calls.every(([name]) => ['scenes/open.json', 'scenes/cell.json'].includes(name))).toBe(true);
    }
    expect(read.mock.calls.some(([name]) => name === hash)).toBe(false);
  } finally { context.scope.dispose(); vi.restoreAllMocks(); }
});
