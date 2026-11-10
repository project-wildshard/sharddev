// CI21 (J232): the SDK authoring half of engine's thirteen lift-pending graph
// tests. Engine keeps the compile/runtime half against literal GraphIr; the
// SDK's own promise lives here: graph() and its op helpers emit exactly that
// IR, format admits it, and authoring refusals stay refusals. Each case names
// the engine file it came from.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the authored lossless texture's numerical channels.
import { zstdDecompressSync } from 'node:zlib';
import { attribute, varying, vec2, vec3, vec4 } from 'three/tsl';
import { expect, test } from 'vitest';
import { validateGraph, type GraphIr, type GraphNode } from '@wildshard/format/materialGraph';
import { parseKtx2 } from '@wildshard/format/ktx2Cost';
import { GraphMaterial, gerstnerNormal, graph, graphInputs, instanceTransform, windGustAt } from '../src/sharddev/materials';
import { bakeRawColourTexture } from '../src/sharddev/bake/texture';
import { writeImagePixels } from '../src/sharddev/bake/image';

// Engine test/graph-day-toon.test.ts and graph-optional-attribute.test.ts
// compile these literal IRs; the SDK must still author them byte for byte.
const TOON_IR: GraphIr = { version: 1, kind: 'material', nodes: {}, stages: { surface: { colour: [0.4, 0.5, 0.6] } }, model: 'toon' };
const OPTIONAL_IR: GraphIr = { version: 1, kind: 'material',
  nodes: { n0: { op: 'attribute', default: [0, 0], name: 'aSway', type: 'vec2' }, n1: { op: 'combine', in: ['n0', 0] } },
  stages: { 'vertex.offset': { offset: 'n1', shadow: true }, surface: { colour: [1, 1, 1] } }, model: 'unlit' };

test('graph-budget: an SDK GraphMaterial keeps the declared larger budget', () => {
  const nodes: Record<string, GraphNode> = { colour: { op: 'const', value: [0.3, 0.6, 0.2] } };
  for (let index = 0; index < 200; index++) nodes[`row${index}`] = { op: 'add', in: [index === 0 ? 'colour' : `row${index - 1}`, 0.001] };
  const ir: GraphIr = { version: 1, kind: 'material', model: 'unlit', budget: { nodes: 256, samplers: 4, instructions: 1024 }, nodes, stages: { surface: { colour: 'row199' } } };
  const authored = new GraphMaterial(ir);
  try { expect(authored.graph.budget).toEqual(ir.budget); } finally { authored.dispose(); }
});

test('graph-day-toon: the SDK toon graph is the IR engine draws', () => {
  const authored = graph({ model: 'toon', surface: { colour: [0.4, 0.5, 0.6] } });
  expect(authored).toEqual(TOON_IR);
  expect(validateGraph(authored).ok).toBe(true);
});

test('graph-optional-attribute: declared attribute defaults reach the IR; a non-finite default refuses', () => {
  const authored = graph({ model: 'unlit', attributeDefaults: { aSway: [0, 0] },
    vertex: { offset: vec3(attribute('aSway', 'vec2'), 0), shadow: true }, surface: { colour: vec3(1) } });
  expect(authored).toEqual(OPTIONAL_IR);
  expect(validateGraph(authored).ok).toBe(true);
  expect(() => graph({ attributeDefaults: { aSway: [0, Infinity] }, surface: { colour: vec3(attribute('aSway', 'vec2'), 0) } })).toThrow();
});

test('graph-flat-varying: a flat varying authored from TSL keeps its qualifier; linear refuses', () => {
  const authored = graph({ model: 'unlit', surface: { colour: varying(attribute('aDirection', 'vec3')).setInterpolation('flat') } });
  expect(Object.values(authored.nodes).some(n => n.op === 'varying' && n.interpolation === 'flat')).toBe(true);
  expect(() => graph({ surface: { colour: varying(attribute('aDirection', 'vec3')).setInterpolation('linear') } })).toThrow('interpolation');
});

test('graph-fog-inputs: the atmosphere and ramp inputs author their own ops', () => {
  const authored = graph({ model: 'unlit', surface: { colour: graphInputs.atmosphereSunColour.add(graphInputs.atmosphereSunDirection).add(graphInputs.fogZenithColour).add(graphInputs.fogColour) } });
  expect(Object.values(authored.nodes).map(n => n.op)).toEqual(expect.arrayContaining(['atmosphereSunColour', 'atmosphereSunDirection', 'fogZenithColour', 'fogColour']));
});

test('graph-foliage-normal: flipBackfaceNormals passes through authoring', () => {
  expect(graph({ doubleSided: true, flipBackfaceNormals: false, surface: { colour: vec3(1) } }).flipBackfaceNormals).toBe(false);
});

test('graph-instance-transform: instanceTransform authors its op', () => {
  expect(graph({ model: 'unlit', vertex: { offset: instanceTransform(vec4(0, 1, 0, 0)).xyz }, surface: { colour: [1, 1, 1] } }).nodes)
    .toMatchObject({ n0: { op: 'instanceTransform' } });
});

test('graph-shadow-depth: a shadow-casting vertex offset keeps shadow:true', () => {
  expect(graph({ model: 'unlit', vertex: { offset: vec3(0, 1, 0), shadow: true }, surface: { colour: vec3(1) } }).stages['vertex.offset']?.shadow).toBe(true);
});

test('graph-shadow-offset: a receiver shadow offset authors its stage', () => {
  expect(graph({ model: 'standard', shadow: { offset: vec3(0, 0.1, 0) }, surface: { colour: vec3(1) } }).stages['shadow.offset']).toBeDefined();
});

test('graph-toon-caustics: toonCaustics:false passes through authoring', () => {
  expect(graph({ model: 'toon', toonCaustics: false, surface: { colour: vec3(1) } }).toonCaustics).toBe(false);
});

test('graph-wave-normal: the SDK gerstnerNormal op is admitted', () => {
  expect(validateGraph(graph({ model: 'unlit', surface: { colour: gerstnerNormal(vec2(0), 1, 1) } })).ok).toBe(true);
});

test('graph-wind: the SDK windGustAt op is admitted', () => {
  expect(validateGraph(graph({ model: 'unlit', surface: { colour: [1, 1, 1], alpha: windGustAt(vec2(1, 2)) } })).ok).toBe(true);
});

test('graph-data-texture: a linear raw texture bakes lossless numerical channels', async () => {
  const raster = { width: 2, height: 1, pixels: new Uint8ClampedArray([32, 88, 0, 255, 210, 19, 0, 255]) };
  const wire = await bakeRawColourTexture(await writeImagePixels(raster), { colourSpace: 'linear' });
  const view = new DataView(wire.buffer, wire.byteOffset, wire.byteLength);
  // VK_FORMAT_R8G8B8A8_UNORM (37, not the sRGB format) with Zstandard supercompression
  expect(view.getUint32(12, true)).toBe(37); expect(wire[118]).toBe(1);
  expect(parseKtx2(wire).gpu).toBeLessThan(100);
  const offset = Number(view.getBigUint64(80, true)), length = Number(view.getBigUint64(88, true));
  const decoded = zstdDecompressSync(wire.subarray(offset, offset + length));
  expect((decoded[0] ?? -1) / 255).toBeCloseTo((raster.pixels[0] ?? 0) / 255);
  expect((decoded[5] ?? -1) / 255).toBeCloseTo((raster.pixels[5] ?? 0) / 255);
});
