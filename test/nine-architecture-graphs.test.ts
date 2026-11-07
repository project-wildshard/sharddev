import { graphFileRules } from '@wildshard/format/materials';
import { lowerMaterialGraphs } from '../src/sharddev/materialGraphFiles';
import { parseShardfile } from '../src/sdk/shardfile';
import product, { heldGraphFiles, heldProfile } from './fixtures/nine-product-inputs';
import { postRows } from '../src/shards/nine-dragon-stack/generators/postGraphs';
import { ScaledPostPass, prepareScaledPost } from '../src/client/game/looks/scaledPost';
import { postGraphLookOf } from '../src/client/game/looks/postGraphLook';
import { uniformsFrom } from '../src/client/game/plugin/shaderFamily';
import { Scope } from '../src/shared/engine/app/scope';
import { Events } from '../src/shared/engine/events/events';
import { App } from '../src/client/engine/app/app';
import type { ScaledPostRow } from '@wildshard/format/scaledPost';
import { postChainRows } from '../src/shards/nalati-grasslands/generators/postChain';
import { EffectComposer } from 'postprocessing';
import { afterAll, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { compileClassicGraph } from '../src/client/engine/render/graph/glslMaterial';
import { classicProgramText, type MacroValue } from './fixtures/classicProgramText';
import { GRAPH_ADMISSION_LIMITS, validateGraph, type GraphIr } from '@wildshard/format/materialGraph';
import { viewmodelGraphs } from '../src/shards/nine-dragon-stack/generators/viewmodelGraphs';
import { architectureGraphs, crowdGraph } from '../src/shards/nine-dragon-stack/generators/architectureGraphs';
import { kitKindFiles, kitKindGraphs } from '../src/shards/nine-dragon-stack/generators/kitKindGraphs';
import { crowdGraphFile } from '../src/shards/nine-dragon-stack/generators/crowdGraph';
import fog from '../src/shards/nine-dragon-stack/data/lookGraphs.json' with { type: 'json' };

import { lendUniforms as lendGrade } from '../src/client/game/shardfile/lentLooks';
import { NINE_FRAME_CHANNELS, NINE_FRAME_GROUP } from '../src/shards/nine-dragon-stack/generators/frameChannels';
import { installChannelPrograms } from '../src/shared/game/plugin/channelPrograms';
import { graphParamRoots } from '../src/client/game/looks/graphDaySky';
import sharedRows from '../src/shards/nine-dragon-stack/data/sharedUniforms.json' with { type: 'json' };
import paint from '../src/shards/nine-dragon-stack/data/paint.json' with { type: 'json' };
import light from '../src/shards/nine-dragon-stack/data/light.json' with { type: 'json' };


vi.stubGlobal('ImageBitmap', class ImageBitmap { readonly width = 0; });
afterAll(() => { vi.unstubAllGlobals(); });

function renderer(): THREE.WebGLRenderer {
  const result: unknown = Object.create(THREE.WebGLRenderer.prototype);
  if (!(result instanceof THREE.WebGLRenderer)) throw new Error('Missing renderer');
  const fields: Record<string, unknown> = {
    setNodesHandler: () => undefined, getDrawingBufferSize: (target: THREE.Vector2) => target.set(400, 800), getViewport: (target: THREE.Vector4) => target.set(0, 0, 400, 800),
    extensions: { has: () => false, get: () => null }, getContext: () => ({ getParameter: () => 65536 }), getRenderTarget: () => null,
    toneMapping: THREE.NoToneMapping, toneMappingExposure: 1, outputColorSpace: THREE.SRGBColorSpace,
    coordinateSystem: THREE.WebGLCoordinateSystem, info: { render: { frame: 0 } },
    debug: { checkShaderErrors: true, diagnostics: { keywords: false } }, properties: { get: () => ({}), has: () => false },
  };
  for (const [key, value] of Object.entries(fields)) Reflect.set(result, key, value);
  return result;
}

/**
 * A graph's classic program as one draw of it runs: its stages with three's chunks expanded under the macros three's prefix
 * sets for that draw (a fogged scene; an instanced mesh with colours; a skinned mesh) and the material's own defines.
 */
function build(graph: GraphIr, instanced: boolean, skinned = false): { vertex: string; fragment: string } {
  const fogGraph = compileClassicGraph(fog['nine-silk-fog'], { trustedBudget: true });
  const compiled = compileClassicGraph(graph, { trustedBudget: true, fog: () => { if (fogGraph.fog === null) throw new Error('Missing silk fog'); return fogGraph.fog; } });
  try {
    const own: Record<string, MacroValue> = {};
    for (const [name, value] of Object.entries(compiled.material.defines ?? {})) own[name] = typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? value : true;
    const defines: Record<string, MacroValue> = { ...own, USE_FOG: true };
    if (instanced) { defines['USE_INSTANCING'] = true; defines['USE_INSTANCING_COLOR'] = true; }
    if (skinned) defines['USE_SKINNING'] = true;
    return { vertex: classicProgramText(compiled.material.vertexShader, defines), fragment: classicProgramText(compiled.material.fragmentShader, defines) };
  } finally { compiled.material.dispose(); fogGraph.material.dispose(); }
}

const graphs = architectureGraphs();
test('held material files declare their admitted texture dependencies', () => {
  // the SDK lowers the inline graphs to files before admission (D74), so a file's fog names a file too
  const kinds = new Map(kitKindFiles().map(row => [row.file.hash, row.bytes])), crowd = crowdGraphFile(), lowered = lowerMaterialGraphs(product), built = parseShardfile(lowered.declaration);
  expect(graphFileRules(built, hash => heldGraphFiles.assets.get(hash) ?? lowered.assets.get(hash) ?? kinds.get(hash) ?? (hash === crowd.file.hash ? crowd.bytes : undefined))).toEqual([]);
});
/** the reads in `main` of a variable no enclosing block (nor both arms of an if / else in one) has assigned */
function undominatedReads(shader: string): string[] {
  const parent = new Map<number, number>(), arms = new Map<number, number>(), direct = new Map<number, Set<string>>(), stack = [0], bad = new Set<string>();
  let next = 1;
  const open = (): void => { parent.set(next, stack.at(-1) ?? 0); stack.push(next++); };
  const defined = (name: string, block: number): boolean => direct.get(block)?.has(name) === true
    || [...arms].some(([then, other]) => parent.get(then) === block && defined(name, then) && defined(name, other));
  for (const raw of shader.slice(shader.indexOf('void main()')).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('} else {')) { const then = stack.pop() ?? 0; open(); arms.set(then, stack.at(-1) ?? 0); continue; }
    for (let i = 0; i < line.split('}').length - 1; i++) stack.pop();
    const write = /^(?:(?:float|int|bool|vec[234])\s+)?(t\d+_\w+)\s*=\s*(.*);$/u.exec(line);
    for (const [name] of (write?.[2] ?? line).matchAll(/\bt\d+_\w+\b/gu)) {
      if ([...direct.values()].some(set => set.has(name)) && !stack.some(block => defined(name, block))) bad.add(name);
    }
    const assigned = write?.[1], block = stack.at(-1) ?? 0;
    if (assigned !== undefined) direct.set(block, new Set([...(direct.get(block) ?? []), assigned]));
    for (let i = 0; i < line.split('{').length - 1; i++) open();
  }
  return [...bad];
}

test('every Nine graph value is assigned on every path that reads it, in its own stage', () => {
  // NR16 (D204's sibling): the kit's ink is a chain of branched selects, `lines = select(kind == k, max(lines', ink),
  // lines')`; each lines' was assigned inside its costly arm, so every other kind read it unassigned and the kit drew no ink.
  // A shared operand builds before the branch, but never across a varying (the lantern's instance transform is the vertex's)
  const looks = Object.entries(fog).filter(([id]) => id !== 'nine-silk-fog' && id !== 'nine-portal-sparks').map(([id, graph]): [string, GraphIr] => {
    const checked = validateGraph(graph, { trustedBudget: true }); if (!checked.ok) throw new Error(`${id}: ${checked.errors.join('; ')}`); return [id, checked.graph];
  });
  for (const [id, graph] of [...Object.entries(graphs), ...looks]) {
    const fragment = build(graph, true).fragment;
    expect(undominatedReads(fragment), id).toEqual([]);
    expect(fragment.slice(fragment.indexOf('void main()')), id).not.toContain('instanceMatrix');
  }
});

test('each existing material fits both caps and compiles its real instance channels', () => {
  for (const [id, graph] of Object.entries(graphs)) {
    expect(validateGraph(graph, { trustedBudget: true }).ok, id).toBe(true);
    expect(Object.keys(graph.nodes).length, id).toBeLessThanOrEqual(4096);
    expect(new TextEncoder().encode(JSON.stringify(graph)).length, id).toBeLessThanOrEqual(GRAPH_ADMISSION_LIMITS.bytes);
    const shaders = build(graph, true);
    expect(shaders.vertex, id).toContain('instanceMatrix');
    expect(shaders.vertex, id).toContain('instanceColor');
    expect(shaders.fragment, id).toContain('sampler3D');
    expect(shaders.fragment, id).not.toContain('NaN');
    expect(shaders.fragment.slice(shaders.fragment.indexOf('void main()')), id).not.toContain('linearToOutputTexel');
    if (id === 'nine-architecture-cut') expect(shaders.fragment).toContain('discard');
  }
});

test('the merged shell also compiles without instance attributes', () => {
  const graph = graphs['nine-facade'];
  if (graph === undefined) throw new Error('Missing facade graph');
  const shaders = build(graph, false);
  expect(shaders.vertex).not.toContain('instanceMatrix');
  expect(shaders.vertex).not.toContain('instanceColor');
});

test('the kit reads its walker dye channel even when the first mesh built lacks it', () => {
  // EP8: one kit program serves every mesh; built first for a mesh without aDye, the plain attribute compiled to a
  // constant 0 and every dyed umbrella drew its base walker's dark cloth x the dye. The channel's default keeps it read.
  for (const id of ['nine-architecture', 'nine-architecture-cut']) {
    const graph = graphs[id]; if (graph === undefined) throw new Error(`Missing ${id}`);
    expect(build(graph, true).vertex, id).toMatch(/\baDye\b/u);
  }
});

test('volume sampling refuses wrong coordinates, dimensions and lent textures', () => {
  const graph: GraphIr = { version: 1, kind: 'material', model: 'unlit', params: { volume: { type: 'texture', role: 'lent', value: 'volume' } }, nodes: { sample: { op: 'texture3D', in: [[0.5, 0.5, 0.5]], param: 'volume' }, colour: { op: 'swizzle', in: ['sample'], mask: 'xyz' } }, stages: { surface: { colour: 'colour' } } };
  const compiled = compileClassicGraph(graph), volume = new THREE.Data3DTexture(new Uint8Array([1, 2, 3, 255]), 1, 1, 1);
  expect(() => compiled.setTexture('volume', volume)).not.toThrow();
  expect(() => compiled.setTexture('volume', new THREE.Texture())).toThrow('3D texture');
  expect(validateGraph({ ...graph, nodes: { ...graph.nodes, sample: { op: 'texture3D', in: [[0.5, 0.5]], param: 'volume' } } }).ok).toBe(false);
  expect(validateGraph({ ...graph, nodes: { ...graph.nodes, two: { op: 'texture', in: [[0.5, 0.5]], param: 'volume' }, sum: { op: 'add', in: ['sample', 'two'] }, colour: { op: 'swizzle', in: ['sum'], mask: 'xyz' } } }).ok).toBe(false);
  volume.dispose(); compiled.material.dispose();
});

test('held toon and hull graphs compile rigid and skinned without adding draws', () => {
  for (const [id, graph] of Object.entries(viewmodelGraphs(heldProfile))) {
    expect(Object.keys(graph.nodes).length, id).toBeLessThanOrEqual(4096);
    expect(new TextEncoder().encode(JSON.stringify(graph)).length, id).toBeLessThanOrEqual(64000);
    expect(graph.stages.outline, id).toBeUndefined();
    for (const skinned of [false, true]) {
      let shader: ReturnType<typeof build>;
      try { shader = build(graph, false, skinned); } catch (cause) { throw new Error(`${id} skinned=${skinned}`, { cause }); }
      expect(shader.fragment.slice(shader.fragment.indexOf('void main()')), id).not.toContain('linearToOutputTexel');
      expect(shader.vertex.includes('skinWeight'), id).toBe(skinned);
      if (id === 'nine-vm-body' && skinned) expect(shader.vertex).toContain('aNs');
      if (id.includes('cloth')) expect(shader.vertex).toContain('aCloth');
      if (id === 'nine-vm-hull') expect(shader.vertex).toContain('aHullN');
    }
  }
});


test('scaled post graphs retain the existing draws, target scales and sampler bounds', () => {
  const rows = postRows();
  expect([rows.bleed.draws.length, rows.reflect.draws.length, rows.haze.draws.length]).toEqual([5, 2, 2]);
  for (const row of Object.values(rows)) for (const program of Object.values(row.programs)) {
    expect(program.graph.budget?.nodes).toBeLessThanOrEqual(4096);
    expect(new TextEncoder().encode(JSON.stringify(program.graph)).length).toBeLessThanOrEqual(64000);
    const shader = build(program.graph, false);
    expect(shader.fragment).not.toContain('NaN');
  }
});

test('a second shard fixture drives resized post targets and skips gated outputs', async () => {
  const render = renderer();
  await prepareScaledPost(render);
  const scene = new THREE.WebGLRenderTarget(800, 1600), camera = new THREE.PerspectiveCamera();
  const fixture: ScaledPostRow = { name: 'FixturePost', programs: { copy: { graph: { version: 1, kind: 'post', nodes: { uv: { op: 'screenUV' }, colour: { op: 'texture', in: ['uv'], param: 'source' }, rgb: { op: 'swizzle', in: ['colour'], mask: 'xyz' } }, params: { source: { type: 'texture', role: 'lent', value: 'source' } }, stages: { post: { colour: 'rgb', alpha: .4 } } } } },
    targets: { small: { name: 'Fixture.small', of: 'input', scale: .5, filter: 'linear' }, quarter: { name: 'Fixture.quarter', of: 'small', scale: .5, filter: 'nearest' } },
    draws: [{ program: 'copy', to: 'small', textures: { source: 'input' } }, { program: 'copy', to: 'quarter', textures: { source: 'small' } }], settings: { gain: 1 }, when: 'gain', outputs: { final: 'quarter' }, drawnOnly: true };
  const pass = new ScaledPostPass(fixture, { renderer: render, camera }), draws: [number, number][] = [];
  Reflect.set(render, 'setRenderTarget', (target: THREE.WebGLRenderTarget) => { draws.push([target.width, target.height]); });
  Reflect.set(render, 'render', () => undefined);
  try {
    pass.setSize(800, 1600); pass.render(render, scene);
    expect(draws).toEqual([[400, 800], [200, 400]]);
    expect(pass.output('final')?.image).toMatchObject({ width: 200, height: 400 });
    pass.set({ gain: 0 }); pass.render(render, scene); expect(pass.output('final')).toBeNull();
    pass.set({ gain: 1 }); pass.setSize(400, 800); draws.length = 0; pass.render(render, scene);
    expect(draws).toEqual([[200, 400], [100, 200]]);
    expect(() => new ScaledPostPass({ ...fixture, targets: { bad: { name: 'cycle', of: 'bad', scale: .5, filter: 'linear' } } }, { renderer: render, camera })).toThrow('target');
  } finally { pass.dispose(); scene.dispose(); }
});


test('the base body, every held body mesh (and every hull) is one graph shape, its channels chosen by parameters', () => {
  // EP7: heldRigGraphs rewrote a missing COLOR_0 / _AFACE into constants, so each channel set compiled its own program
  const shapes = new Map<string, Set<string>>();
  for (const [id, graph] of Object.entries(viewmodelGraphs(heldProfile)).filter(([key]) => key.startsWith('nine-vm-rig-') || key === 'nine-vm-body')) {
    const params = graph.params ?? {}, kind = params['uHullK'] === undefined ? 'body' : 'hull';
    const shape = JSON.stringify({ ...graph, params: Object.fromEntries(Object.entries(params).map(([name, row]) => [name, row.type])) });
    shapes.set(kind, (shapes.get(kind) ?? new Set()).add(shape));
    expect(validateGraph(graph, { trustedBudget: true }).ok, id).toBe(true);
  }
  expect([...shapes.values()].map(set => set.size)).toEqual([...shapes.keys()].map(() => 1));
});

test('held draw rows compile aliased GLB buffers and ribbon channels', () => {
  for (const [id, graph] of Object.entries(viewmodelGraphs(heldProfile)).filter(([key]) => key.startsWith('nine-vm-rig-') || key === 'nine-vm-edge' || key === 'nine-vm-trail')) {
    expect(validateGraph(graph, { trustedBudget: true }).ok, id).toBe(true);
    const shaders = build(graph, false, id.startsWith('nine-vm-rig-'));
    expect(shaders.fragment, id).not.toContain('NaN');
    if (id.startsWith('nine-vm-rig-')) expect(shaders.vertex + shaders.fragment, id).toContain('aMat');
    if (id === 'nine-vm-trail') expect(shaders.vertex, id).toContain('aAge');
    if (id === 'nine-vm-edge') expect(shaders.vertex, id).toContain('aTan');
  }
});


test('Nalati grades on the post-graph look: scene pass, desktop bloom side, the grade graph and its display', async () => {
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene(), render = renderer(), rows = postChainRows();
  await prepareScaledPost(render);
  const grade = rows.postGraph.passes['grade']?.programs['grade']?.graph;
  if (grade === undefined) throw new Error('Missing grade graph');
  expect(validateGraph(grade, { trustedBudget: true }).ok).toBe(true);
  expect(build(grade, false).fragment).not.toContain('NaN');
  const levelScope = new Scope('nalati-grade');
  lendGrade(levelScope, 'nalati-grade', uniformsFrom(rows.uniforms));
  const look = postGraphLookOf('nalati-grasslands', rows.postGraph);
  if (look.mode !== 'replace') throw new Error('Nalati composes its own chain');
  const app: unknown = Object.create(App.prototype);
  if (!(app instanceof App)) throw new Error('Missing app');
  Reflect.set(app, 'events', new Events());
  const chain = (tier: 'phone' | 'desktop'): string[] => look.compose({ app, scope: levelScope, debug: { expose: () => undefined }, renderer: render, scene, camera, composer: new EffectComposer(), tier }).chain.map(pass => pass.name);
  try {
    // G924: no event fades the displayed frame, so the grade draws straight to the screen (no copy pass)
    expect(chain('desktop')).toEqual(['RenderPass', 'PostGraphBloom', 'PostGraphInputs', 'GradeV2Graph']);
    expect(chain('phone')).toEqual(['RenderPass', 'PostGraphInputs', 'GradeV2Graph']);
    expect(look.cell?.replaces).toBe('chain');
    // the grid cell carries the same chain, its desktop bloom included
    const cell = (tier: 'phone' | 'desktop'): string[] => (look.cell?.build({ root: new THREE.Group(), camera, renderer: render, tier, scope: levelScope }).passes ?? []).map(pass => pass.name);
    expect(cell('desktop')).toEqual(['PostGraphPoseView', 'PostGraphBloom', 'PostGraphInputs', 'GradeV2Graph']);
    expect(cell('phone')).toEqual(['PostGraphPoseView', 'PostGraphInputs', 'GradeV2Graph']);
  } finally { levelScope.dispose(); }
});

test('the look channel rows give each lent look its shared params every frame, the facade washes and the silk weave', () => {
  // the live shared rows as the world makes them (a number, a vector, a colour, a vector or colour array)
  const bag: Record<string, THREE.IUniform> = {};
  for (const [name, row] of Object.entries({ ...sharedRows, ...paint.uniforms, ...light.volume, ...light.haloUniforms, bandDepth: 1 })) {
    const value: unknown = typeof row === 'number' ? row : 'rgb' in row ? new THREE.Color(row.rgb) : 'v4s' in row ? row.v4s.map(([x, y, z, w]) => new THREE.Vector4(x, y, z, w))
      : 'rgbs' in row ? row.rgbs.map(hex => new THREE.Color(hex)) : 'v2' in row ? new THREE.Vector2(row.v2[0], row.v2[1])
      : 'v3' in row ? new THREE.Vector3(row.v3[0], row.v3[1], row.v3[2]) : 'v4' in row ? new THREE.Vector4(row.v4[0], row.v4[1], row.v4[2], row.v4[3]) : null;
    bag[name] = { value };
  }
  const shade = new THREE.Color(), linePx = { value: 2.1 };
  bag['uShade'] = { value: shade }; bag['uLinePx'] = linePx;
  const looks = [...new Set(NINE_FRAME_CHANNELS.flatMap(program => program.numeric?.outputs.map(out => out.target) ?? []))].filter(target => target !== 'bag');
  const lent = graphParamRoots(NINE_FRAME_CHANNELS, NINE_FRAME_GROUP, looks), own = graphParamRoots(NINE_FRAME_CHANNELS, NINE_FRAME_GROUP, ['bag']);
  const view = { eyeX: 1, eyeY: 130, eyeZ: 2, near: 0.1, p00: 1.5, p11: 2, rootX: 10, rootY: 0, rootZ: -4 };
  const lane = installChannelPrograms(NINE_FRAME_CHANNELS, NINE_FRAME_GROUP, new Map<string, unknown>([['view', view], ['uniforms', bag], ...lent.roots, ...own.roots]));
  const writes = new Map<string, number | readonly number[]>();
  const frame = (): void => {
    lane.evaluate({ time: 5, delta: 0.016, values: {} });
    lent.push({ setParam: (id, name, value) => { writes.set(`${id}:${name}`, typeof value === 'number' ? value : [...value]); } });
  };
  frame();
  const close = (key: string, to: readonly number[]): void => {
    const got = writes.get(key), parts = typeof got === 'object' ? got : [];
    expect(parts.length, key).toBe(to.length);
    to.forEach((part, i) => { expect(parts[i], key).toBeCloseTo(part, 6); });
  };
  close('nine-facade:uFacadeWash', new THREE.Color(0xe0e3ef).toArray());
  close('nine-windows:uSky', new THREE.Color(0xbcc4d2).toArray());
  close('nine-halo:rootAt', [10, 0, -4]);
  const depths = [...writes].filter(([key]) => key.endsWith(':bandDepth'));
  expect(depths.length).toBeGreaterThan(0);
  for (const [key, value] of depths) expect(value, key).toBeCloseTo(1, 6);
  shade.setRGB(0.8, 0.9, 1); linePx.value = 3; frame();
  close('nine-architecture:uShade', [0.8, 0.9, 1]);
  close('nine-crowd-table:uShade', [0.8, 0.9, 1]);
  // Paired tables get the same live frame values as ordinary kit casts.
  const pairedParams = crowdGraph().params ?? {};
  for (const [key, value] of writes) if (key.startsWith('nine-architecture:')) {
    const param = key.slice('nine-architecture:'.length);
    if (param in pairedParams) expect(writes.get(`nine-crowd-table:${param}`), param).toEqual(value);
  }
  expect(writes.get('nine-facade:uLinePx')).toBe(3);
  // each write is a param its own look declares (the fog's colour only the silk fog's)
  for (const key of writes.keys()) {
    const [id = '', param = ''] = key.split(':'), entry: unknown = product.look.materials[id];
    // the kit's split-kind graphs ship as files (kitKindGraphs.ts)
    const graph: unknown = typeof entry === 'object' && entry !== null ? kitKindGraphs()[id] ?? (id === 'nine-crowd-table' ? crowdGraph() : Reflect.get(entry, 'graph')) : null;
    const params: unknown = typeof graph === 'object' && graph !== null ? Reflect.get(graph, 'params') : null;
    expect(typeof params === 'object' && params !== null ? Object.keys(params) : [], key).toContain(param);
  }
  expect([...writes.keys()]).toContain('nine-silk-fog:fogBaseCol');
  expect([...writes.keys()]).not.toContain('nine-streaks:fogBaseCol');
  expect(writes.has('nine-architecture:uLpMax')).toBe(false);
});
