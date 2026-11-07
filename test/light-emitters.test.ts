// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { Color, DataTexture, Group, Matrix4, MeshStandardMaterial, PointLight, Vector3, Vector4 } from 'three';
import { LightEmitters } from '../src/client/engine/fx/lightEmitters';
import { Scope } from '../src/shared/engine/app/scope';
import { applyGround, updateGround } from '../src/client/engine/render/families/ground';
import { parseGroundLayer } from '@wildshard/format/materialFamilies';
import { parseLightEmitters } from '@wildshard/format/lightEmitters';
import { lightPoolRows } from '../src/shards/nine-dragon-stack/generators/lightVolumes';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { loadPostGraphLut, neutralLut } from '../src/client/game/looks/postGraphLook';
import SEALED from './fixtures/legacy-oracles/nine-light.json' with { type: 'json' };
import { SceneHandles } from '../src/client/game/shardfile/sceneHandles';
import { EmitterPresentation } from '../src/client/game/shardfile/lightEmitters';
import { sceneVectors } from '../src/client/game/shardfile/sceneInputs';
import { SIGNAL_EMITTERS } from '../src/shards/sunscar-dunes/generators/lightEmitters';
import POOL from '../src/shards/nine-dragon-stack/data/lightPools.json' with { type: 'json' };
import { parseWorldScenes } from '@wildshard/format/worldScenes';
import { lendWorldSceneTextures } from '../src/client/game/shardfile/worldSceneTextures';
import { plainWeaveBytes, silkWeaveBytes } from '../src/shards/nine-dragon-stack/generators/silkWeave';
import NINE_GRAPHS from '../src/shards/nine-dragon-stack/data/lookGraphs.json' with { type: 'json' };
import { validateGraph, type GraphRef } from '@wildshard/format/materialGraph';
import { compileClassicGraph } from '../src/client/engine/render/graph/glslMaterial';
import type { ShardContext } from '../src/client/game/plugin/context';

/** colours as linear [r, g, b], vectors as arrays: the frozen oracle's reading (fixtures/legacy-oracles/nine-light.json) */
const plain = (value: unknown): unknown => value instanceof Color ? [value.r, value.g, value.b] : value instanceof Vector3 || value instanceof Vector4 ? value.toArray()
  : Array.isArray(value) ? value.map(plain) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) : value;

test('Nine source order, linear colours and falloffs match its sealed volume inputs exactly', () => {
  const emitter = (w: number, h: number, power: number, spill: number) => ({ at: new Vector3(w, h, power), color: new Color(0xb47248), w, h, power, spill });
  const lanterns = [emitter(0.2, 0.4, 1, 0.3), emitter(0.75, 1, 2, 0.1)],
    shops = [emitter(1.5, 1, 1, 0.1), emitter(4, 2, 1, 0.9)], lamps = [emitter(0.34, 0.3, 1, 0.3)],
    signs = [emitter(1, 3, 2, 0.3), emitter(2, 1, 0.5, 0)],
    windows = [0, 0.8, 1.15].map(lit => ({ m: new Matrix4().makeRotationY(0.7).scale(new Vector3(1.2, 2.4, 1)).setPosition(3, 4, 5), win: new Vector4(0, lit, 0, 0), light: new Color(0xffaa55) }));
  const rows = lightPoolRows({ lanterns, ctxEmitters: [...shops, ...lamps], signs, windows }, POOL);
  expect(plain(new LightEmitters(rows).volume())).toEqual(SEALED.pools);
  const shared = { value: rows.map(() => new Vector4()) }, current = new LightEmitters(rows, shared);
  current.set('light.0', false); expect(shared.value[0]?.w).toBe(0);
  expect(plain(current.volume()[1])).toEqual(SEALED.pools[1]);
  expect(() => current.set('missing', true)).toThrow();
  expect(() => new LightEmitters([...rows, ...rows])).toThrow();
  const invalid = structuredClone(rows);
  for (const row of invalid) row.gain = Number.NaN;
  expect(() => new LightEmitters(invalid)).toThrow();
});

test('ground reads the owning emitter uniform through dusk updates without a copy or shader rebuild', () => {
  const uniform = { value: Array.from({ length: 4 }, () => new Vector4()) }, material = new MeshStandardMaterial();
  const rows = parseGroundLayer({ pools: { source: 'emitters', low: [1, 0.7, 0.3], high: [1, 0.4, 0.1], split: 0.5, radius: 10, gain: 0.17 } });
  applyGround(material, rows, () => { throw new Error('No textures'); }, id => {
    expect(id).toBe('emitters'); return uniform;
  });
  const readPools = (): unknown => {
    const values: unknown = material.userData['familyUniforms'];
    if (typeof values !== 'object' || values === null || !('famGPools' in values)) throw new Error('Missing pool uniform');
    return values.famGPools;
  };
  expect(readPools()).toBe(uniform);
  const before = material.customProgramCacheKey();
  uniform.value[0]?.set(1, 2, 3, 1); updateGround(material, { albedo: 0.7 });
  expect(readPools()).toBe(uniform);
  expect(material.customProgramCacheKey()).toBe(before); material.dispose();
  expect(() => applyGround(new MeshStandardMaterial(), rows, () => { throw new Error('No textures'); })).toThrow();
});

test('emitter switches restore exact pool and ember state and retain the original flicker waves', () => {
  const rows = parseLightEmitters({ version: 1, input: 'firelights', clock: 'firetime', rows: [{
    id: 'beacon', parent: 'flame', at: { point: 'at' }, pool: { slot: 0, gain: 1 }, initially: false, draws: [],
    emissive: { collection: 'embers', gain: 1.1 },
    light: { part: 'light', at: { point: 'at' }, colour: 0xff8a3a, gain: 14, distance: 40, decay: 1.6, shared: false, waves: [[13, 0, 0.06], [29, 1.3, 0.04]] },
  }] });
  const scope = new Scope('emitters'), handles = new SceneHandles(), root = new Group(), flame = new Group(), light = new PointLight(), embers = new MeshStandardMaterial();
  handles.publish('flame', flame); handles.publish('light', light); handles.publish('at', new Vector3(2, 3, 4)); handles.publishMaterials('embers', [embers]);
  const ctx = { root, product: { slug: 'fixture-emitter' } } as ShardContext;
  const host = new EmitterPresentation(rows, handles, ctx, scope, new Map());
  expect(flame.visible).toBe(false); expect(embers.emissiveIntensity).toBe(0);
  host.set('beacon', true); expect(embers.emissiveIntensity).toBe(1.1);
  expect(sceneVectors('fixture-emitter', 'firelights', 4).value[0]?.toArray()).toEqual([2, 3, 4, 1]);
  host.step(10, new Vector3()); expect(light.intensity).toBe(14 * (1 + Math.sin(130) * 0.06 + Math.sin(291.3) * 0.04));
  host.set('beacon', false); host.step(11, new Vector3()); expect(light.intensity).toBe(0);
  scope.dispose(); embers.dispose();
  expect(() => parseLightEmitters({ ...rows, rows: [...rows.rows, ...rows.rows] })).toThrow();
});

test('Signal generator admits every original fire graph and keeps the four pool slots in order', () => {
  const pools = SIGNAL_EMITTERS.rows.filter(row => row.pool !== undefined).sort((a, b) => (a.pool?.slot ?? 0) - (b.pool?.slot ?? 0));
  expect(pools.map(row => [row.id, row.pool?.slot, row.pool?.gain])).toEqual([
    ['brazier.0', 0, 1], ['brazier.1', 1, 1], ['brazier.2', 2, 1], ['caravan.pool', 3, 0.22],
  ]);
  expect([...new Set(SIGNAL_EMITTERS.rows.flatMap(row => row.draws.map(draw => draw.material)))].sort()).toEqual([
    'fire-embers', 'fire-flame', 'fire-glow', 'fire-lamp-glow', 'fire-pool', 'fire-smoke', 'fire-wisp',
  ]);
  expect(SIGNAL_EMITTERS.rows.filter(row => !row.initially).map(row => row.id)).toEqual(['signal', 'brazier.0', 'brazier.1', 'brazier.2']);
  const shared = SIGNAL_EMITTERS.rows.find(row => row.light?.shared === true);
  if (shared?.light === undefined) throw new Error('Missing declared shared lamp');
  expect(() => parseLightEmitters({ ...SIGNAL_EMITTERS, rows: [{ ...shared, light: { ...shared.light, decay: 1 } }] })).toThrow();
});


test('Nine uses the engine LUT with the sealed bytes and sampler', async () => {
  // the post-graph look reads the identity grade, mixed in by 0, until the learned LUT loads
  const identity = neutralLut(), a = identity.image.data;
  if (!(a instanceof Uint8Array)) throw new Error('Missing identity LUT');
  expect(hashImmutableBytes(a)).toBe(SEALED.identityLut.hash);
  expect(SEALED.identityLut.amount).toBe(0);
  identity.dispose();
  const bytes = Uint8Array.from({ length: 33 ** 3 * 4 }, (_, i) => i & 255);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(bytes)));
  try {
    const actual = await loadPostGraphLut('/grade.bin', 'nine-grade'), data = actual.image.data;
    if (!(data instanceof Uint8Array)) throw new Error('Missing LUT bytes');
    expect(hashImmutableBytes(data)).toBe(SEALED.loadedLut.hash);
    for (const field of ['type', 'format', 'colorSpace', 'minFilter', 'magFilter', 'wrapS', 'wrapT', 'wrapR', 'unpackAlignment'] as const) expect(actual[field]).toBe(SEALED.loadedLut[field]);
    expect([actual.image.width, actual.image.height, actual.image.depth]).toEqual([33, 33, 33]);
    actual.dispose();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
    await expect(loadPostGraphLut('/missing.bin', 'nine-grade')).rejects.toThrow('Missing post-graph LUT');
  } finally { vi.unstubAllGlobals(); }
});


test('Nine weave bakes retain every texel and the sealed samplers as lent rasters', async () => {
  const owner = new Scope('nine-weaves'), handles = new SceneHandles();
  const raster = (name: string, size: readonly [number, number] = [256, 256]) => parseWorldScenes({ version: 1, libraries: [], materials: [], steps: [],
    lent: [{ kind: 'raster', file: `${name}.r8`, size, format: 'r8', wrap: 'repeat', magnify: 'nearest', mipmaps: true, label: name, publish: name }] }).lent;
  try {
    for (const [name, original, bytes] of [['silk', SEALED.silkWeave, silkWeaveBytes()], ['plain', SEALED.plainWeave, plainWeaveBytes()]] as const) {
      await lendWorldSceneTextures(raster(name), owner, { file: () => Promise.resolve(bytes), url: file => file }, handles, undefined, 'standalone');
      const restored = handles.texture(name);
      if (!(restored instanceof DataTexture) || !(restored.image.data instanceof Uint8Array)) throw new Error('Missing weave bytes');
      expect(hashImmutableBytes(restored.image.data)).toBe(original.hash);
      for (const key of ['format', 'type', 'colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps'] as const) expect(restored[key]).toBe(original[key]);
    }
    await expect(lendWorldSceneTextures(raster('short'), owner, { file: () => Promise.resolve(new Uint8Array(1)), url: file => file }, handles, undefined, 'standalone')).rejects.toThrow('size differs');
  } finally { owner.dispose(); }
});

test('Nine canopy graphs retain vertex fog and fit both catalogue caps', () => {
  for (const id of ['nine-canopy-cards', 'nine-canopy-depth', 'nine-canopy-inner'] as const) {
    const checked = validateGraph(NINE_GRAPHS[id], { trustedBudget: true });
    if (!checked.ok) throw new Error(checked.errors.join('\n'));
    const graph = checked.graph;
    expect(checked.cost.nodes).toBeLessThanOrEqual(4096);
    expect(new TextEncoder().encode(JSON.stringify(graph)).byteLength).toBeLessThanOrEqual(64_000);
    expect(graph.effectState?.fog).toBe(false);
    expect(graph.stages.surface?.targetAlpha).toBeDefined();
    const compiled = compileClassicGraph(graph, { trustedBudget: true });
    if (id === 'nine-canopy-cards') {
      const texture = new DataTexture(new Uint8Array(4), 1, 1);
      compiled.setTexture('atlas', texture); compiled.setParam('atlasSize', [1024, 1024]); texture.dispose();
    }
    if (id !== 'nine-canopy-depth') {
      compiled.setParam('rootAt', [1, 2, 3]); compiled.setParam('lightDir', [0, 1, 0]);
      expect(Object.values(graph.nodes).some(node => node.op === 'varying' && node.in?.some(ref => typeof ref === 'string' && graph.nodes[ref]?.op === 'combine'))).toBe(true);
    }
    compiled.material.dispose();
  }
});

test('canopy mip coverage matches log2 across float32 minification', () => {
  const checked = validateGraph(NINE_GRAPHS['nine-canopy-cards'], { trustedBudget: true });
  if (!checked.ok) throw new Error(checked.errors.join('\n'));
  const graph = checked.graph;
  const coverage = Object.values(graph.nodes).find(node => node.op === 'fwidth')?.in?.[0];
  if (coverage === undefined) throw new Error('Missing mip coverage');
  const f = Math.fround;
  for (const x of [0, 1e-8, 0.9, 1, 1.0001, 1.5, 1.9999, 2, 3, 8, 255, 1024, 2 ** 32, 2 ** 64, 1e32]) {
    const evalScalar = (ref: GraphRef): number => {
      if (typeof ref === 'number') return f(ref);
      if (typeof ref !== 'string') throw new Error('Expected scalar coverage input');
      const node = graph.nodes[ref];
      if (node === undefined) throw new Error(`Missing coverage node ${ref}`);
      // Feed the measured squared UV derivative; tx.a = 1 isolates its multiplier.
      if (node.op === 'dot') return f(x);
      if (node.op === 'swizzle' && node.mask === 'w') return 1;
      const [a = 0, b = 0, c = 0] = (node.in ?? []).map(evalScalar);
      switch (node.op) {
        case 'add': return f(a + b);
        case 'sub': return f(a - b);
        case 'mul': return f(a * b);
        case 'div': return f(a / b);
        case 'max': return f(Math.max(a, b));
        case 'pow': return f(a ** b);
        case 'step': return b < a ? 0 : 1;
        case 'gte': return a >= b ? 1 : 0;
        case 'select': return a === 0 ? c : b;
        default: throw new Error(`Unexpected coverage op ${node.op}`);
      }
    };
    expect(Math.abs(evalScalar(coverage) - (1 + 0.125 * Math.log2(Math.max(f(x), 1))))).toBeLessThan(2e-6);
  }
});
