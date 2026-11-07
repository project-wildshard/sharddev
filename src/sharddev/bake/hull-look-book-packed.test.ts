import { zlibSync } from 'fflate';
import { afterAll, expect, test, vi } from 'vitest';
import { Rng } from '@wildshard/engine/core/rng';
import { HullLookBook } from '@wildshard/engine/game/looks/speciesBook';
import { Bone, BufferGeometry, MeshBasicMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';
import type { Animal } from '@wildshard/engine/entities/AnimalView';
import type { AnimalDims } from '@wildshard/engine/entities/species/registry';
import { creaturePoseRows, numericChannelPrograms } from '../clientChannels';

// G600 L8 / G602: the hull book's packed looks (Nalati's species book folds into it): compact bodies, coat rows, a
// painterly material and post-pose programmes, from rows only
afterAll(() => { vi.unstubAllGlobals(); });
const file = `/assets/test/compact-${'b'.repeat(64)}.bin`;
const compactBody = { file, bytes: 36, attrs: [['position', 'f32', 3, false]],
  skeletons: [{ bones: [{ name: 'body', parent: null, pos: [0, 0, 0] }], dims: { bodyY: .5, bodyHalfLen: .5, bodyRadius: .2, headRadius: .1, legLen: .3, halfWidth: .2, feet: [[0, 0]], capsuleAxis: 'y' } }],
  rows: [{ kind: 'stone', variant: 'plain', skeleton: 0, fur: [], hard: [[3, 0, 0, [], 'u16']], eye: [] }] };
const book = () => new HullLookBook({ slug: 'fixture', compactBody, definitions: {}, rows: [] });
const look = { id: 'look.stone', species: 'species.stone', kind: 'stone', skeleton: 'stone.v1', sockets: ['body'], clips: [] };

test('compact bodies expand and a packed look carries its coat rows, material and stance', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(zlibSync(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer))))));
  const hull = book();
  const looks = hull.packedLooks({ poses: {}, rows: [{ ...look, family: 'stone', variants: { mossy: { body: 'plain', tint: { base: [0.2, 0.4, 0.2] }, traits: { cracks: 2 } } },
    material: { family: 'painterly', rim: 0.3, bands: 4 }, stance: { grazeNeck: 0.1, gallopTail: 0.2 }, gait: { trot: 3, gallop: 7 } }] });
  const stone = looks.get('stone');
  expect(stone.variants).toEqual({ mossy: { tint: { base: [0.2, 0.4, 0.2] }, traits: { cracks: 2 } } });
  expect(stone.pose).toEqual({ grazeNeck: 0.1, gallopTail: 0.2 }); expect(stone.gait).toEqual({ trot: 3, gallop: 7 });
  expect(typeof stone.material).toBe('function'); expect(stone.skin).toBeUndefined();
  await hull.packed.preload();
  const built = stone.build({ id: 'mossy', label: 'Mossy', weight: 1, rarity: 'common', scale: [1, 1] }, new Rng(1));
  expect(built.hardParts[0]?.getAttribute('position').getX(1)).toBe(1);
});

test('a post-pose naming no programme, or an unknown programme, refuses', () => {
  const hull = book();
  expect(() => hull.packedLooks({ poses: {}, rows: [{ ...look, family: 'stone', variants: { plain: 'plain' }, postPose: { alive: 'absent' } }] })).toThrow('Missing species pose programme');
  const looks = hull.packedLooks({ poses: {}, rows: [{ ...look, family: 'stone', variants: { plain: 'plain' } }] });
  expect(() => { looks.pose('absent', {} as Parameters<typeof looks.pose>[1]); }).toThrow('Missing species pose programme');
  expect(() => hull.packedLooks({ poses: {}, rows: [{ ...look, family: 'stone', material: { family: 'lowpoly', rim: 0, bands: 0 } }] })).toThrow();
});

test("a packed look's frame programme wears its attachments once read, one mesh per animal, from the book's product", async () => {
  const glow = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangle = new Int32Array([0, 1, 1]), bytes = new Uint8Array(glow.byteLength + triangle.byteLength);
  bytes.set(new Uint8Array(glow.buffer)); bytes.set(new Uint8Array(triangle.buffer), glow.byteLength);
  const read: string[] = [], files = { file: (name: string) => { read.push(name); return Promise.resolve(bytes); } };
  const geometry = { attrs: [['position', 'f32', 3, false]], count: 3, index: 'u32', indexCount: 3, box: false };
  const still = creaturePoseRows({ group: 'creature.pose', states: [], programs: numericChannelPrograms('still.pose', 'creature.pose', [
    { target: 'joint.body', path: ['rotation', 'x'], expr: b => b.constant(0.25) }]) });
  const row = { ...look, family: 'stone', variants: { plain: 'plain' }, animate: 'still', attachments: [{ name: 'stone-glow', file: 'glow.bin', colour: [1, 0.5, 0.1], geometry }] };
  const worn = new HullLookBook({ slug: 'fixture', compactBody, definitions: {}, rows: [] }, files);
  const stone = worn.packedLooks({ poses: { still }, rows: [row] }).get('stone');
  const animal = legacyDouble<Animal>({ mesh: new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial()) }), body = new Bone();
  animal.mesh.bind(new Skeleton([body]));
  const context = legacyDouble<Parameters<NonNullable<typeof stone.animate>>[0]>({ animal, bones: { body }, mem: {}, alive: true, t: 0, dt: 0.016, seed: 1, scale: 1, dims: { bodyY: .5, bodyHalfLen: .5, bodyRadius: .2, headRadius: .1, legLen: .3, halfWidth: .2, feet: [[0, 0]] } satisfies AnimalDims,
    speed: 0, strafe: 0, phase: 0, state: 'idle', deathT: -1, flinch: 0, brace: 0, attack: -1, lookTarget: new Vector3(), lookWeight: 0, position: new Vector3(), yaw: 0 });
  // the first frame starts the read and poses bare; once read, each animal puts its meshes on once
  stone.animate?.(context);
  expect(animal.mesh.children.filter(child => child.name === 'stone-glow')).toHaveLength(0); expect(body.rotation.x).toBe(0.25);
  await stone.preload?.();
  stone.animate?.(context); stone.animate?.(context);
  expect(read).toEqual(['glow.bin']);
  const meshes = animal.mesh.children.filter(child => child.name === 'stone-glow'), mesh = meshes[0];
  expect(meshes).toHaveLength(1);
  expect(mesh instanceof SkinnedMesh && mesh.material instanceof MeshBasicMaterial && mesh.material.toneMapped).toBe(false);
  // attachments without an animate, an unknown programme, or a book with no product files refuse
  const { animate: _frame, ...bare } = row;
  expect(() => worn.packedLooks({ poses: { still }, rows: [bare] })).toThrow('need an animate programme');
  expect(() => worn.packedLooks({ poses: {}, rows: [row] })).toThrow('Missing species pose programme');
  expect(() => book().packedLooks({ poses: { still }, rows: [row] })).toThrow('need the product files');
});

test('a channel frame refuses a programme writing a public field, an unknown frame, and an animate beside it', () => {
  const surface = numericChannelPrograms('lift', 'k.surface', [{ target: 'joint.body', path: ['rotation', 'y'], expr: b => b.constant(1) }]);
  const pose = numericChannelPrograms('still.pose', 'creature.pose', [{ target: 'joint.body', path: ['rotation', 'x'], expr: b => b.constant(0.25) }]);
  const frame = { programs: [...surface, ...pose], surface: 'k.surface', observe: 'k.surface', pose: 'creature.pose', look: [1, 1, 0.5], smooth: [], floor: { lift: 'lift', death: 'dead' }, memory: {} };
  const row = { ...look, family: 'stone', variants: { plain: 'plain' }, frame: 'still' };
  expect(() => book().packedLooks({ poses: {}, frames: { still: frame }, rows: [row] })).toThrow('must target private visual fields');
  const still = creaturePoseRows({ group: 'creature.pose', states: [], programs: pose });
  expect(() => book().packedLooks({ poses: { still }, rows: [row] })).toThrow('runs one known frame');
  expect(() => book().packedLooks({ poses: { still }, frames: {}, rows: [{ ...row, animate: 'still' }] })).toThrow('runs one known frame');
});
