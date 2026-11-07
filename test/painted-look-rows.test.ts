import { parse } from 'valibot';
import { expect, test } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { Terrain } from '../src/client/engine/world/Terrain';
import type { PainterField } from '../src/client/engine/render/look';
import { productPaintedLook } from '../src/client/game/looks/paintedLook';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import { colourGraphFunction, materialColourGraph } from '../src/client/engine/render/graph/colourFunction';
import { applyPaintedTerrain } from '../src/client/engine/render/families/paintedTerrain';
import { parsePaintedTerrain } from '@wildshard/format/materialFamilies';
import rocColour from '../src/shards/far-reach/data/rocSlate.json' with { type: 'json' };
import oliveColour from '../src/shards/nalati-grasslands/data/oliveColour.json' with { type: 'json' };
import { InstancedBufferAttribute, MeshStandardMaterial, PlaneGeometry, ShaderChunk, Texture } from 'three';
import { instancedQuad } from '../src/client/engine/render/instancedGeometry';
import { PaintedNumbersSchema, parsePaintedLook } from '@wildshard/format/paintedLook';
import { skyPaintedPresentation, SKY_PAINTED_GRAPHS } from '../src/shards/far-reach/generators/paintedLook';
import { signalPaintedPresentation } from '../src/shards/sunscar-dunes/generators/paintedLook';
import { LAST_LIGHT_SUN } from '../src/shards/sunscar-dunes/generators/rows/lightLook';
import { paintedLookFromRow, painterLightGlsl, painterLightPatch } from '../src/client/engine/render/dataLook';
import { SKY_PAINTED } from '../src/shards/far-reach/generators/rows/skyPaintedLook';

const signal = parsePaintedLook(signalPaintedPresentation());
// The authored golden-hour rows as the product reads them: page light, the day clock and the haze sky.
const sky = { look: { ...SKY_PAINTED.look, lightScope: 'page', clock: SKY_PAINTED.day, sky: { kind: 'haze', row: SKY_PAINTED.haze } } };

test('both authored looks admit their clock, sky and light without changing values', () => {
  for (const rows of [signal.look, sky.look]) {
    const admitted = parse(PaintedNumbersSchema, rows);
    expect(admitted).toEqual(rows);
    expect(() => parse(PaintedNumbersSchema, { ...rows, sun: { ...rows.sun, intensity: Number.NaN } })).toThrow();
    expect(() => parse(PaintedNumbersSchema, { ...rows, clock: { ...rows.clock, units: 'seconds' } })).toThrow();
  }
  expect(() => parse(PaintedNumbersSchema, { ...signal.look, light: { ...signal.look.light, rim: [1, 2] } })).toThrow();
});

test('a stateful look refuses missing dusk and binds the real live state', () => {
  const row = parse(PaintedNumbersSchema, signal.look), load = (): Promise<null> => Promise.resolve(null);
  expect(() => paintedLookFromRow(row, { load })).toThrow('live state');
  const state = { value: 0.86 }, look = paintedLookFromRow(row, { load, state });
  expect(look.backdrop).toBeTypeOf('function');
  expect(look.lighting).toBeUndefined();
  look.dispose?.();
});

test('page lighting installs the identical painter shader used by scoped materials', () => {
  const light = parse(PaintedNumbersSchema, sky.look).light, before = ShaderChunk.lights_fragment_end;
  try {
    painterLightPatch(null, light, sky.look.sun.dir);
    expect(ShaderChunk.lights_fragment_end).toBe(before + painterLightGlsl(light, sky.look.sun.dir));
  } finally { ShaderChunk.lights_fragment_end = before; }
});

// GLSL parity (Sky Reach): a graph program includes three's lights chunk, but its lighting stage carries its own painted
// light, as the node graph did; the page's painter light must not land on it a second time
test('the painter light leaves graph programs (WS_GRAPH) to their own lighting', () => {
  const light = parse(PaintedNumbersSchema, sky.look).light;
  expect(painterLightGlsl(light, sky.look.sun.dir)).toContain(`#if !defined( ${light.optOut} ) && !defined( WS_GRAPH )`);
});

test('product presentation retains both original look rows and all dressing resources', () => {
  const presentation = skyPaintedPresentation(), dusk = parsePaintedLook(signalPaintedPresentation());
  expect(presentation.look).toEqual(sky.look);
  expect(dusk.look).toEqual(signal.look);
  expect(dusk.materialSun).toEqual(LAST_LIGHT_SUN);
  expect(dusk.materialOptOut).toBe('sunscarNoRim');
  expect(dusk.state).toBe('dusk');
  expect(dusk.terrain).toBe('declared');
  const draws = presentation.dressing?.draws;
  expect(draws?.map(draw => draw.name)).toEqual(['far.sun-glow', 'far.painted-maelstrom', 'far.painted-sea', 'far.painted-sea.upper', 'far.cumulus']);
  expect(draws?.map(draw => draw.order)).toEqual([-4, -6, -7, -6, -5]);
  for (const id of [...Object.values(presentation.dome?.graph ?? {}), ...(draws?.map(draw => draw.graph) ?? [])]) {
    expect(SKY_PAINTED_GRAPHS[id]?.family).toBe('graph');
  }
  expect(() => parsePaintedLook({ ...dusk, state: undefined })).toThrow();
  expect(() => parsePaintedLook({ ...presentation, images: {} })).toThrow();
  expect(() => parsePaintedLook({ ...presentation, build: () => undefined })).toThrow();
});

test('instanced fields retain the original shared quad and exact attribute storage', () => {
  const quad = new PlaneGeometry(2, 2), attribute = new InstancedBufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 3);
  const field = instancedQuad(quad, { aAt: attribute });
  expect(field.index).toBe(quad.index);
  expect(field.getAttribute('position')).toBe(quad.getAttribute('position'));
  expect(field.getAttribute('uv')).toBe(quad.getAttribute('uv'));
  expect(field.getAttribute('aAt')).toBe(attribute);
  expect(field.instanceCount).toBe(2);
  field.dispose(); quad.dispose();
});

test('declared terrain waits for native ground without building an engine slab', async () => {
  const product = createShardProduct({ slug: 'sunscar-dunes', revision: 1,
    shardfile: emptyShardfile({ slug: 'sunscar-dunes', name: 'Signal', author: 'Fixture', revision: 1, seed: 1 }),
    sections: new Map([['look/painted', parsePaintedLook(signalPaintedPresentation())]]), files: new Map(),
    read: () => Promise.reject(new Error('No assets needed for declared terrain')) });
  const look = await productPaintedLook(product), terrain = new Terrain(), scope = new Scope('declared-terrain');
  let release: (() => void) | undefined, readyCalls = 0, finished = false;
  const ready = new Promise<boolean>(resolve => { release = () => { resolve(true); }; });
  const unused = (): never => { throw new Error('Declared ground must not rebuild terrain'); };
  const field: PainterField = { ready: () => { readyCalls++; return ready; }, heightAt: unused, normalAt: unused, trails: unused, trailDistance: unused };
  try {
    if (look.terrainPainter === undefined) throw new Error('Missing declared terrain policy');
    const build = look.terrainPainter.build(terrain, field, scope).then(() => { finished = true; return undefined; });
    await Promise.resolve();
    expect(readyCalls).toBe(1); expect(finished).toBe(false); expect(terrain.group.children).toHaveLength(0);
    if (release === undefined) throw new Error('Missing readiness signal');
    release(); await build;
    expect(finished).toBe(true); expect(terrain.group.children).toHaveLength(0);
    expect(() => terrain.mesh).toThrow('no terrain mesh');
  } finally { scope.dispose(); look.dispose?.(); }
});

// Frozen previous sources prove the graph conversion leaves programs intact.
test('pure colour graphs lower to the exact previous programs for two shards', () => {
  expect(colourGraphFunction(rocColour)).toBe('vec3 farSlate(vec3 c){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); float gold = (1.0 - smoothstep(0.06, 0.12, c.b / max(c.r, 1e-3))) * smoothstep(0.2, 0.3, c.r); float brown = clamp((c.r - c.b) / max(c.r, 1e-3) * 1.6 - 0.3, 0.0, 1.0) * (1.0 - smoothstep(0.55, 0.75, c.g / max(c.r, 1e-3))) * (1.0 - gold); return mix(c, vec3(0.085, 0.09, 0.11) + vec3(l) * vec3(0.82, 0.9, 1.05) * 1.1, brown * 0.95); }\n');
  expect(colourGraphFunction(oliveColour)).toBe('\nvec3 famTOlive( vec3 c ) {\n  float gr = smoothstep( 0.02, 0.45, ( c.g - max( c.r, c.b ) ) / max( c.g, 1e-3 ) );\n  vec3 olive = vec3( c.r * 1.12, mix( c.g, c.r * 1.2, 0.68 ), c.b * 0.7 ) * 1.3;\n  return mix( c, olive, gr );\n}\n');
  expect(() => colourGraphFunction({ ...rocColour, name: 'shader;code' })).toThrow();
  expect(() => colourGraphFunction({ ...rocColour, graph: { ...rocColour.graph, nodes: { normal: { op: 'normalWorld' } }, stages: { surface: { colour: 'normal' } } }, locals: [] })).toThrow();
});

test('the live painted-terrain shader stays exact when its colour comes from product data', () => {
  const params = parsePaintedTerrain({ maps: { base: 'paint', track: 'paint', gravel: 'paint', rock: 'paint', snow: 'paint' },
    metres: { base: 2, track: 2, gravel: 2, rock: 2, snow: 2 }, means: { base: [1, 1, 1], rock: [1, 1, 1] },
    snow: { line: 100, high: [40, 80] }, wet: [-5, -10] });
  const texture = new Texture(), before = new MeshStandardMaterial(), after = new MeshStandardMaterial();
  const shader = () => ({ uniforms: {}, vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <lights_fragment_begin>' });
  try {
    applyPaintedTerrain(before, params, { paint: texture }); applyPaintedTerrain(after, params, { paint: texture });
    materialColourGraph(after, 'terrain.colour', oliveColour, true);
    const original = shader(), declared = shader();
    Reflect.apply(before.onBeforeCompile.bind(before), before, [original, undefined]);
    Reflect.apply(after.onBeforeCompile.bind(after), after, [declared, undefined]);
    expect(declared).toEqual(original);
    const missing = shader();
    const material = new MeshStandardMaterial();
    try {
      materialColourGraph(material, 'missing.colour', oliveColour, true);
      expect(() => { Reflect.apply(material.onBeforeCompile.bind(material), material, [missing, undefined]); }).toThrow('Missing colour function');
    } finally { material.dispose(); }
  } finally { before.dispose(); after.dispose(); texture.dispose(); }
});
