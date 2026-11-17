// oxlint-disable-next-line import/no-nodejs-modules -- Native byte comparison checks complete geometry storage without per-element assertion overhead.
import { Buffer } from 'node:buffer';
// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import {fixtureJsonCheck} from './fixtures/productFile';
import * as v from 'valibot';
import { unzlibSync } from 'fflate';
import { BufferAttribute, BufferGeometry, Group, Matrix4, InstancedBufferGeometry, InterleavedBufferAttribute, LOD, Mesh, MeshBasicMaterial, Points, ShaderMaterial, Vector3, type Object3D } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { parseSceneBuffers } from '@wildshard/format/sceneBuffers';
import { admitSceneBuffers, createSceneBuffers } from '../src/client/game/shardfile/sceneBuffers';
import { skyMeadowScene } from '../src/shards/far-reach/generators/meadowScene';
import { bakeMeadowBlades } from '../src/shards/far-reach/generators/meadowBlades';
import { signalEmberBuffer, SIGNAL_EMBER_BLOBS } from '../src/shards/sunscar-dunes/generators/emberBuffers';
import { meadow } from './fixtures/sky-meadow-native';
import { createOwnedGeometry } from '../src/client/engine/models/ownedGeometry';
import { skyIsleProps } from '../src/shards/far-reach/generators/isleProps';
import { SKY_ISLAND_BLOBS, SKY_ISLAND_LIBRARY, SKY_ISLE_TILES } from '../src/shards/far-reach/generators/islandScenes';
import { scenePartSpecimen } from '../src/client/game/models/scenePartSpecimen';
import { drawSceneRows } from '../src/client/game/shardfile/sceneDraws';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import { emitNamedBlobs, nameBlob } from '../src/sharddev/blobs';
import { parseWorldScenes } from '@wildshard/format/worldScenes';
import { parseWorldScene } from '@wildshard/format/clientChannels';
import { bindWorldSceneParts, createWorldScene } from '../src/client/game/plugin/scene';
import { originalSkyScenes } from './fixtures/sky-scene-source';

const { blobs: SKY_SCENE_BLOBS, scenes: SKY_WORLD_SCENES } = await originalSkyScenes();

const plumbing = (blades: number) => ({ namespace: 'far', input: [], debug: [], knobs: [{ id: 'far.meadowBlades' as const, phone: blades, desktop: blades }] });
const raw = (attribute: BufferAttribute | InterleavedBufferAttribute): Uint8Array => {
  const array = attribute.array; return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
};
const mesh3 = (node: Object3D): node is Mesh => node instanceof Mesh;
const points3 = (node: Object3D | undefined): node is Points => node instanceof Points;
const drawMeshes = (root: Object3D): Mesh[] => { const result: Mesh[] = []; root.traverse(node => { if (mesh3(node)) result.push(node); }); return result; };

function inlineByteFixture(bytes: string, storage = 'u8') {
  return { version: 1, buffers: [{ id: 'positions', storage: 'f32', bytes: 'AAAAAAAAAAAAAAAA' }, { id: 'samples', storage, bytes }],
    attributes: [{ id: 'position', buffer: 'positions', size: 3 }, { id: 'sample', buffer: 'samples', size: 1 }],
    geometries: [{ id: 'g', attributes: { position: 'position', sample: 'sample' } }],
    draws: [{ id: 'd', draw: { kind: 'points', geometry: 'g' } }] };
}

function byteFixture(bytes:Uint8Array,storage='u8'){
  const positionFile='test/position.bin',sampleFile='test/samples.bin';
  return {row:{version:1,buffers:[{id:'positions',storage:'f32',file:positionFile,byteLength:12},{id:'samples',storage,file:sampleFile,byteLength:bytes.byteLength}],
    attributes:[{id:'position',buffer:'positions',size:3},{id:'sample',buffer:'samples',size:1}],
    geometries:[{id:'g',attributes:{position:'position',sample:'sample'}}],draws:[{id:'d',draw:{kind:'points',geometry:'g'}}]},
    files:new Map([[positionFile,new Uint8Array(12)],[sampleFile,bytes]])};
}

test('scene decoding retains every byte, padding length and typed storage bit', () => {
  const all = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==';
  const cases = [
    { storage: 'u8', text: '', bytes: new Uint8Array() },
    { storage: 'u8', text: 'AA==', bytes: new Uint8Array([0]) },
    { storage: 'u8', text: 'AAE=', bytes: new Uint8Array([0, 1]) },
    { storage: 'u8', text: 'AAEC', bytes: new Uint8Array([0, 1, 2]) },
    { storage: 'u8', text: all, bytes: Uint8Array.from({ length: 256 }, (_, i) => i) },
    { storage: 'u8', text: all.slice(0, -4).repeat(64), bytes: Uint8Array.from({ length: 255 * 64 }, (_, i) => i % 255) },
    { storage: 'u16', text: 'AAABAP8AAAH//zQS', bytes: new Uint8Array(new Uint16Array([0, 1, 255, 256, 65535, 0x1234]).buffer) },
    { storage: 'f32', text: 'AAAAAAAAAIAAAIA/AACAvwEAAAA=', bytes: new Uint8Array(new Float32Array([0, -0, 1, -1, 2 ** -149]).buffer) },
  ];
  const material = new MeshBasicMaterial();
  try {
    for (const row of cases) {
      const scope = new Scope('scene-byte-parity');
      try {
        const predecessor=Buffer.from(row.text,'base64');
        expect(Buffer.compare(predecessor,row.bytes)).toBe(0);
        const {row:input,files} = byteFixture(predecessor, row.storage);
        expect(() => admitSceneBuffers(input,files)).not.toThrow();
        const group = createSceneBuffers(input, material, scope,undefined,undefined,files), points = group.children[0];
        if (!points3(points)) throw new Error('Missing decoded Points');
        expect(Buffer.compare(raw(points.geometry.getAttribute('sample')), row.bytes)).toBe(0);
      } finally { scope.dispose(); }
    }
  } finally { material.dispose(); }
});

test('scene decode keeps malformed, misaligned and nonfinite storage refused', () => {
  for (const text of ['AAA', 'AA?=', 'AAé=', 'A=AA', 'AA\n=']) {
    expect(() => admitSceneBuffers(inlineByteFixture(text))).toThrow('Scene buffers require named binary files');
  }
  for (const storage of ['u16', 'f32']) {
    const {row,files}=byteFixture(new Uint8Array([0]),storage);expect(() => admitSceneBuffers(row,files)).toThrow('Misaligned scene buffer storage');
  }
  const {row,files}=byteFixture(new Uint8Array(new Float32Array([Infinity]).buffer),'f32');
  expect(() => admitSceneBuffers(row,files)).toThrow('Nonfinite scene buffer');
});

test('Sky native meadow retains every byte, shared attribute, count, LOD and transform', () => {
  const files = new Map<string, Uint8Array>();
  const row = skyMeadowScene((id, bytes) => { files.set(id, bytes); return { file: id, byteOffset: 0 }; }), bytes = unzlibSync(bakeMeadowBlades()), material = new MeshBasicMaterial();
  for (const blades of [1600, 3199, 3200, 4000]) {
    const scope = new Scope('buffer-parity'), native = meadow(bytes, material, blades), candidate = createSceneBuffers(row, material, scope, plumbing(blades), undefined, files);
    try {
      expect(candidate.name).toBe(native.group.name); expect(candidate.children.length).toBe(native.group.children.length);
      const originals = drawMeshes(native.group), copies = drawMeshes(candidate);
      expect(copies.length).toBe(originals.length);
      const sharing = new Map<object, object>();
      for (const [index, original] of originals.entries()) {
        const copy = copies[index]; if (copy === undefined) throw new Error('Missing meadow draw');
        expect(copy.geometry).toBeInstanceOf(InstancedBufferGeometry);
        if (!(copy.geometry instanceof InstancedBufferGeometry) || !(original.geometry instanceof InstancedBufferGeometry)) throw new Error('Missing native instance geometry');
        expect(copy.geometry.instanceCount).toBe(original.geometry.instanceCount);
        expect(copy.position.toArray()).toEqual(original.position.toArray());
        expect(copy.geometry.boundingSphere).toEqual(original.geometry.boundingSphere);
        expect(Buffer.compare(raw(copy.geometry.index ?? new BufferAttribute(new Uint8Array(), 1)), raw(original.geometry.index ?? new BufferAttribute(new Uint8Array(), 1)))).toBe(0);
        for (const name of Object.keys(original.geometry.attributes)) {
          const a = original.geometry.getAttribute(name), b = copy.geometry.getAttribute(name);
          expect(b.constructor).toBe(a.constructor); expect(b.itemSize).toBe(a.itemSize); expect(b.normalized).toBe(a.normalized); expect(Buffer.compare(raw(b), raw(a))).toBe(0);
          const source = a instanceof InterleavedBufferAttribute ? a.data : a, target = b instanceof InterleavedBufferAttribute ? b.data : b;
          if (sharing.has(source)) expect(target).toBe(sharing.get(source)); else sharing.set(source, target);
          if (a instanceof InterleavedBufferAttribute && b instanceof InterleavedBufferAttribute) { expect(b.offset).toBe(a.offset); expect(b.data.stride).toBe(a.data.stride); }
        }
      }
      for (const [index, original] of native.group.children.entries()) {
        const copy = candidate.children[index]; if (!(copy instanceof LOD) || !(original instanceof LOD)) throw new Error('Missing native LOD');
        expect(copy.position.toArray()).toEqual(original.position.toArray()); expect(copy.levels.map(level => level.distance)).toEqual(original.levels.map(level => level.distance));
        for (const distance of [0, 13.99, 14, 30.99, 31, 40]) {
          const a = copy.getObjectForDistance(distance), b = original.getObjectForDistance(distance);
          if (a === null || b === null) throw new Error('Missing native LOD band');
          expect(a.type).toBe(b.type);
        }
      }
    } finally { scope.dispose(); native.dispose(); }
  }
  material.dispose();
});

test('Signal current ember Points retain native golden-ratio float32 bytes and disposal', () => {
  const file = signalEmberBuffer(260, 'fire.embers'), blob = SIGNAL_EMBER_BLOBS.find(value => value.file.name === file);
  if (blob === undefined) throw new Error('Missing ember data');
  const scope = new Scope('ember-buffer'), material = new MeshBasicMaterial();
  const files = new Map(SIGNAL_EMBER_BLOBS.flatMap(row => row.file.name === undefined ? [] : [[row.file.name, row.bytes]]));
  const group = createSceneBuffers(JSON.parse(new TextDecoder().decode(blob.bytes)), material, scope, undefined, undefined, files);
  const points = group.children[0]; if (!points3(points)) throw new Error('Missing current ember Points');
  const index = new Float32Array(260), seed = new Float32Array(260);
  for (let i = 0; i < 260; i++) { index[i] = i; seed[i] = (i * 0.618034) % 1; }
  expect(points.name).toBe('fire.embers'); expect(points.frustumCulled).toBe(false);
  expect(points.geometry.getAttribute('aIndex').array).toEqual(index); expect(points.geometry.getAttribute('aSeed').array).toEqual(seed);
  expect(points.geometry.getAttribute('position').array).toEqual(new Float32Array(780));
  const dispose = vi.spyOn(points.geometry, 'dispose'); scope.dispose(); expect(dispose).toHaveBeenCalledTimes(1); material.dispose();
});

test('Sky moving islets publish the original painted mesh identities for motion', () => {
  const step = SKY_WORLD_SCENES.steps.find(row => row.id === 'moving-islets');
  const blob = SKY_SCENE_BLOBS.find(row => row.file.name === step?.scene);
  if (step === undefined || blob === undefined) throw new Error('Missing actual moving-islet scene');
  const recipe = parseWorldScene(JSON.parse(new TextDecoder().decode(blob.bytes)));
  const geometry = new BufferGeometry(), paint = new ShaderMaterial();
  const ports = new Map(recipe.scene.materials.flatMap(row => row.kind === 'port' ? [[row.source, paint] as const] : []));
  const made = createWorldScene(recipe, { geometry: () => geometry, materials: ports,
    model: () => { throw new Error('Unexpected islet model import'); }, baked: () => { throw new Error('Unexpected islet bake import'); } });
  try {
    const kinds = Object.fromEntries(Object.entries(step.publish).map(([id, row]) => [id, row.kind]));
    const bound = bindWorldSceneParts(made, kinds, step.publish);
    const painted = recipe.scene.nodes.filter(row => row.kind === 'mesh' && row.material === 'isle-paint');
    expect(painted).toHaveLength(4);
    for (const row of painted) {
      const original = made.parts.get(row.id);
      expect(original).toBeInstanceOf(Mesh);
      expect(bound[row.id]).toBe(original);
    }
  } finally { made.dispose(); paint.dispose(); geometry.dispose(); }
});

test('cold Explorer preparation admits buffered effects and refuses missing files', async () => {
  const file = signalEmberBuffer(260, 'fire.embers'), blob = SIGNAL_EMBER_BLOBS.find(value => value.file.name === file);
  if (blob === undefined) throw new Error('Missing ember source');
  const recipe = { scene: { version: 1, root: 'root', nodes: [{ id: 'root', kind: 'group', children: [] }], materials: [] }, imports: [] };
  const scenes = parseWorldScenes({ version: 1, libraries: [], materials: [], steps: [{ id: 'fire', scene: 'scene.json' }] });
  const product = (include: boolean) => {
    const data = emitNamedBlobs([nameBlob('scene.json', 'json', new TextEncoder().encode(JSON.stringify(recipe))), ...(include ? SIGNAL_EMBER_BLOBS.filter(row => row === blob || blob.file.dependencies.includes(row.file.hash)) : [])]);
    const admitted=createShardProduct({ slug: 'fixture-cold-effects', revision: 1,
      shardfile: emptyShardfile({ slug: 'fixture-cold-effects', name: 'Cold effects', author: 'Fixture', revision: 1, seed: 1 }),
      sections: new Map([['world/scenes', scenes]]),
      files: new Map(data.files.flatMap(row => row.name === undefined ? [] : [[row.name, { ...row, url: row.hash }]])), jsonCheck: fixtureJsonCheck,
      read: hash => { const bytes = data.assets.get(hash); if (bytes === undefined) throw new Error('Missing fixture bytes'); return Promise.resolve(bytes); } });
    // This synthetic recipe isolates the Explorer host. Its buffered effects
    // keep real registered ingestion; the recipe keeps its native consumer parse.
    const named=admitted.json.bind(admitted);
    vi.spyOn(admitted,'json').mockImplementation(async name=>{
      if(name!=='scene.json')return named(name);
      const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await admitted.file(name)));return value;
    });
    return admitted;
  };
  const draws = [{ kind: 'buffered' as const, file, material: 'paint', scale: 1, y: 0 }];
  const row = { part: 'fire.root', step: 'fire', definition: { model: { id: 'fixture/fire', name: 'Fire', file: 'scene.json', category: 'props' as const, pipeline: 'code' as const }, builder: 'fire' }, effects: [{ part: 'root', draws }] };
  const admitted = product(true), model = scenePartSpecimen(admitted, row);
  await model.prepare?.();
  const scope = new Scope('cold-effects'), root = new Group(), material = new MeshBasicMaterial();
  try { drawSceneRows(admitted, draws, root, scope, new Map([['paint', material]])); expect(root.children[0]?.children[0]).toBeInstanceOf(Points); }
  finally { scope.dispose(); material.dispose(); }
  await expect(scenePartSpecimen(product(false), row).prepare?.()).rejects.toThrow('Missing scene draw buffer file');
});

test('static islands draw from their baked props tiles in their own frame; only the islets stay owned GLBs', async () => {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const native = skyIsleProps(), nodes = new Map<string, { files: string[]; mesh: Mesh }>();
  for (const row of native.props.tiles) {
    // Exact island models read only L0 partitions; L1 proxies never carry original assembly ordinals.
    if (row.lod !== 0) continue;
    const bytes = native.assets.get(row.file); if (bytes === undefined) throw new Error('Missing original island tile');
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    gltf.scene.traverse(node => { if (!mesh3(node)) return; const id = v.parse(v.object({ id: v.string() }), node.userData['wholePartition']).id;
      const known = nodes.get(id); if (known === undefined) nodes.set(id, { files: [row.file], mesh: node }); else known.files.push(row.file); });
  }
  try {
    expect(nodes.size).toBe(12); expect(SKY_ISLE_TILES.models).toHaveLength(12);
    expect(SKY_ISLE_TILES.load).toBe('explorer');
    for (const model of SKY_ISLE_TILES.models) {
      const node = nodes.get(model.part); if (node === undefined) throw new Error(`Missing baked island ${model.part}`);
      expect([...model.files].sort()).toEqual([...new Set(node.files)].sort());
      expect(model.matrix.slice(12, 15)).toEqual(new Matrix4().fromArray(v.parse(v.array(v.number()), node.mesh.userData['matrix64'])).elements.slice(12, 15).map(value => 0 - value));
      expect(SKY_ISLAND_LIBRARY.models.some(row => row.id === model.id)).toBe(false);
    }
    const fall = SKY_ISLAND_BLOBS.find(row => row.file.name === 'world/geometry/fall.glb');
    if (fall === undefined) throw new Error('Missing waterfall geometry');
    const owned = createOwnedGeometry('fall'); await owned.load(fall.bytes); const geometry = owned.take();
    expect(geometry.index).toBeNull(); geometry.dispose();
  } finally {
    for (const { mesh } of nodes.values()) { mesh.geometry.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); }
  }
});

test('buffer admission refuses crossed ids, malformed storage and executable rows', () => {
  const file='test/base.bin',shortFile='test/short.bin',files=new Map([[file,new Uint8Array(12)],[shortFile,new Uint8Array(1)]]);
  const base = { version: 1, buffers: [{ id: 'x', storage: 'f32', file,byteLength:12 }], attributes: [{ id: 'a', buffer: 'x', size: 3 }], geometries: [{ id: 'g', attributes: { position: 'a' } }], draws: [{ id: 'd', draw: { kind: 'points', geometry: 'g' } }] };
  expect(() => admitSceneBuffers(base,files)).not.toThrow();
  expect(() => parseSceneBuffers({ ...base, draws: [{ id: 'd', draw: { kind: 'mesh', geometry: 'absent' } }] })).toThrow();
  expect(() => admitSceneBuffers({ ...base, buffers: [{ id: 'x', storage: 'f32', file:shortFile,byteLength:1 }] },files)).toThrow('Misaligned');
  expect(() => parseSceneBuffers({ ...base, update: () => new Vector3() })).toThrow();
});
