import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { positionWorld, vec3 } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { animate, drift, flicker, pulse, rise, sway, uvScroll } from './author';
import { GraphMaterial, graph, graphInputs, noise } from '../materials';
import { lowerShard, SceneRefusalError } from './lower';
import { sceneShardfile } from './shardfile';

// SHARD-SOURCE AP10 to AP12: alpha cards, decals and transparency; sprites and points as camera-facing cards; declared
// motion. The shardfile back end writes them as plain material and lamp data (no author code at runtime).
const glow = new THREE.DataTexture(new Uint8Array(16 * 16 * 4).fill(255), 16, 16);
const scene = lowerShard({ slug: 'ap10', name: 'AP10' }, (world) => {
  world.part('wall', (part) => {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshStandardMaterial({ map: glow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9 }));
    const ivy = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1), new THREE.MeshStandardMaterial({ map: glow, alphaTest: 0.45, side: THREE.DoubleSide }));
    const fern = animate(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1), new THREE.MeshStandardMaterial({ map: glow, alphaTest: 0.4, side: THREE.DoubleSide })), sway({ rate: 0.6, amount: 0.08 }));
    const water = animate(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ map: glow })), uvScroll(0.05, 0));
    decal.position.set(1, 1, 0.4); fern.position.set(2, 0.5, 0); water.position.set(-2, 0, 0);
    part.add(decal, ivy, fern, water);
  });
  world.part('fire', (part) => {
    const fire = animate(new THREE.Group(), pulse({ rate: 1.4, amount: 0.12 }));
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.5, 1.3, 1.15), transparent: true, depthWrite: false, fog: false, alphaTest: 0.05 }));
    flame.center.set(0.5, 0.1); flame.scale.set(1.18, 1.9, 1);
    const light = new THREE.PointLight('#ff9a3a', 16, 12, 1.5); light.position.y = 0.7;
    fire.add(flame, light); animate(light, flicker({ rate: 1.1, amount: 0.08 }));
    fire.position.set(5, 1, -5); part.add(fire);
    const seats = new Float32Array([5, 1.4, -5, 5.1, 1.5, -5]);
    part.add(animate(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(seats, 3)), new THREE.PointsMaterial({ map: glow, color: new THREE.Color('#ffc060').multiplyScalar(3), size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), rise({ rate: 0.4, height: 2.6, spread: 0.5 })));
  });
  world.part('fireflies', (part) => {
    const seats = new Float32Array(30).map((_, i) => (i % 3 === 1 ? 1.2 : i * 0.4));
    part.add(animate(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(seats, 3)), new THREE.PointsMaterial({ map: glow, color: new THREE.Color('#ffd27a').multiplyScalar(2), size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), drift({ rate: 0.3, radius: 0.6 })));
  });
});
const { shard, assets } = sceneShardfile(scene);
const entries = Object.values(shard.look.materials) as Record<string, unknown>[];

test('a stencil decal is see-through and pulled off its wall; an ivy card is cut and two-sided (AP10)', () => {
  expect(entries).toContainEqual(expect.objectContaining({ family: 'pbr', blend: 'alpha', depthOffset: -2 }));
  expect(entries).toContainEqual(expect.objectContaining({ family: 'pbr', alphaCutoff: 0.45, doubleSided: true }));
  expect(entries.filter((e) => e['blend'] === 'alpha' && e['family'] === 'pbr')).toHaveLength(1);
});

test('a flame sprite and a spark cloud are emissive cards, one card draw each in their tile (AP11)', () => {
  const flame = entries.find((e) => e['card'] === true && e['blend'] === 'alpha'), sparks = entries.find((e) => e['card'] === true && (e['motion'] as { kind?: string } | undefined)?.kind === 'rise');
  expect(flame).toMatchObject({ family: 'emissive', fog: 0, motion: { kind: 'pulse', rate: 1.4, amount: 0.12 } });
  expect(flame?.['intensity']).toBeCloseTo(1.5);
  expect(sparks).toMatchObject({ family: 'emissive', blend: 'additive', motion: { kind: 'rise', rate: 0.4, height: 2.6, spread: 0.5 } });
  expect(sparks?.['intensity']).toBeCloseTo(3);
  // the fire's tile: its flame card and its sparks are one primitive each, and both carry their corners
  const tile = shard.props.tiles.find((t) => t.x === 4 && t.z === 3), bytes = tile === undefined ? undefined : assets.get(tile.file);
  expect(bytes).toBeDefined();
  const text = new TextDecoder().decode(bytes?.subarray(20, 20 + new DataView(bytes?.buffer ?? new ArrayBuffer(24), bytes?.byteOffset).getUint32(12, true)));
  expect(text.match(/"_CORNER"/gu)?.length).toBe(2);
  expect(parseGlb(bytes ?? new Uint8Array()).draws).toBe(2);
});

test('motion is plain data: lamp flicker, card pulse, drift and rise, sway with its channel, uv scroll (AP12)', () => {
  const lamps = shard.look.light?.lamps ?? [];
  expect(lamps[0]?.flicker).toEqual({ rate: 1.1, amount: 0.08 });
  expect(entries).toContainEqual(expect.objectContaining({ family: 'emissive', card: true, motion: { kind: 'drift', rate: 0.3, radius: 0.6 } }));
  expect(entries).toContainEqual(expect.objectContaining({ family: 'pbr', sway: { rate: 0.6, direction: [0.8, 0.6] } }));
  expect(entries).toContainEqual(expect.objectContaining({ family: 'pbr', uvScroll: [0.05, 0] }));
  // the look is data: JSON in, the same JSON out, no function anywhere
  const text = JSON.stringify(shard.look);
  expect(JSON.parse(text) as unknown).toEqual(shard.look);
  const swaying = [...assets.values()].map((b) => new TextDecoder().decode(b.subarray(20, 20 + new DataView(b.buffer, b.byteOffset).getUint32(12, true)))).filter((t) => t.includes('"_SWAY"'));
  expect(swaying).toHaveLength(1);
});

test('a motion that does not fit what it moves is refused by path', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.part('rock', (part) => { part.add(animate(new THREE.Mesh(new THREE.BoxGeometry()), pulse({ rate: 1, amount: 0.1 }))); }); }))
    .toThrow(SceneRefusalError);
});

test('a TSL material and a TSL post pass compile to graph rows; raw GLSL is refused with the fix (AP13)', () => {
  const tsl = lowerShard({ slug: 'ap13', name: 'AP13' }, (world) => {
    world.part('rock', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), new GraphMaterial(graph({ surface: { colour: vec3(0.8, 0.4, 0.2).mul(graphInputs.vertexColour) } })))); });
    world.post({ passes: [graph({ kind: 'post', post: { colour: graphInputs.sceneColour.xyz.mul(0.9) } })] });
  });
  const { shard: built } = sceneShardfile(tsl);
  expect(Object.values(built.look.materials)).toContainEqual(expect.objectContaining({ family: 'graph', graph: expect.objectContaining({ kind: 'material' }) }));
  expect(built.look.post).toEqual([{ graph: expect.objectContaining({ kind: 'post' }) }]);
  const glsl = new THREE.MeshStandardMaterial();
  glsl.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor.r = 1.0;'); };
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.part('patched', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), glsl)); }); }))
    .toThrow(/patched\/Mesh 0: its onBeforeCompile patches GLSL.*TSL/su);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.part('raw', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.RawShaderMaterial())); }); }))
    .toThrow(/raw\/Mesh 0: a RawShaderMaterial is raw GLSL.*GraphMaterial/su);
});

test('a three.js node material compiles its TSL slots through graph() (AP13)', () => {
  const stone = new MeshStandardNodeMaterial({ roughness: 0.8 });
  stone.colorNode = vec3(0.5, 0.45, 0.4).mul(noise(positionWorld.xz.mul(3)).mul(0.3).add(0.7));
  const lowered = lowerShard({ slug: 'n', name: 'n' }, (world) => { world.part('rock', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), stone)); }); });
  const entry = Object.values(sceneShardfile(lowered).shard.look.materials)[0] as { family: string; graph: { nodes: Record<string, { op: string }>; stages: { surface?: Record<string, unknown> } } };
  expect(entry.family).toBe('graph');
  expect(Object.values(entry.graph.nodes).map((n) => n.op)).toContain('noise');
  expect(entry.graph.stages.surface).toMatchObject({ roughness: 0.8 });
  const moved = new MeshStandardNodeMaterial(); moved.positionNode = positionWorld;
  expect(() => lowerShard({ slug: 'n', name: 'n' }, (world) => { world.part('m', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), moved)); }); })).toThrow(/positionNode has no graph stage/u);
});
