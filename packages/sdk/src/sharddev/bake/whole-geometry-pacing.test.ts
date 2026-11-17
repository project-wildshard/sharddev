import { afterEach, expect, test, vi } from 'vitest';
import { BufferAttribute, BufferGeometry, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { zlibSync } from 'fflate';
import { Scope } from '@wildshard/engine/app/scope';
import { pageScope } from '@wildshard/engine/app/resources';
import { isDev, setDev } from '@wildshard/engine/core/devMode';
import { enterOwner } from '@wildshard/engine/app/ownership';
import { fetchDeflatedBytes } from '@wildshard/engine/core/deflate';
import * as pacing from '@wildshard/engine/core/framePacing';
import * as workSlices from '@wildshard/engine/core/workSlice';
import { assembleWholeGeometryViews, fetchLaneBake, readWholeGeometry, unshuffleLanes } from '@wildshard/engine/game/plugin/geometry';
import { provideRuntimeProduct } from '@wildshard/engine/game/shardfile/runtimeProduct';
import { emptyShardfile } from '../author';
import { staticGlb } from './glb';
import { hashImmutableBytes } from '../immutable';

const owners: Scope[] = [], geometries: BufferGeometry[] = [], materials: MeshBasicMaterial[] = [];
const nativeFetch = globalThis.fetch, nativeDecoder = globalThis.DecompressionStream;
afterEach(() => { vi.restoreAllMocks(); vi.stubGlobal('fetch', nativeFetch); vi.stubGlobal('DecompressionStream', nativeDecoder); for (const owner of owners.splice(0)) owner.dispose(); for (const geometry of geometries.splice(0)) geometry.dispose(); for (const material of materials.splice(0)) material.dispose(); });

function source(owner: Scope, levels = false, indexed = false): { geometry: BufferGeometry; ref: string; matrix: Matrix4; product: ReturnType<typeof emptyShardfile>; coarse: string } {
  owners.push(owner);
  const geometry = new BufferGeometry(), count = 65538, positions = new Float32Array(count * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = Math.sin(i) * (i % 97 - 48);
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometries.push(geometry);
  if (indexed) geometry.setIndex(new BufferAttribute(Uint32Array.from({ length: count }, (_, index) => index), 1));
  const material = new MeshBasicMaterial(), matrix = new Matrix4().makeTranslation(3.25, -2.5, 8.125); materials.push(material);
  const bytes = staticGlb([{ geometry, material, nativeAttributes: true, compactIndex: true, transform: matrix,
    extras: { wholePartition: { id: 'draw', vertices: { runs: [0, count] }, triangles: { runs: [0, count / 3] }, vertexCount: count, indexCount: indexed ? count : 0, index: indexed ? 'u32' : 'none' } } }]);
  const ref = hashImmutableBytes(bytes), product = emptyShardfile({ slug: 'whole-pace', name: 'Whole pace', author: 'Test', revision: 1, seed: 1 });
  product.files.push({ hash: ref, kind: 'glb', compressed: bytes.length, decoded: bytes.length, gpu: positions.byteLength, triangles: count / 3, draws: 1, dependencies: [], critical: false });
  const invalid = new Uint8Array([1, 2, 3]), coarse = hashImmutableBytes(invalid), assets = new Map([[ref, bytes]]);
  if (levels) {
    product.files.push({ hash: coarse, kind: 'glb', compressed: invalid.length, decoded: invalid.length, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: false });
    assets.set(coarse, invalid);
    product.props = { version: 1, family: 'pbr', tiles: [{ lod: 0, x: 0, z: 0, file: ref }, { lod: 1, x: 0, z: 0, file: coarse }],
      panels: [], models: [], far: null, colliders: [], textures: [] };
  }
  provideRuntimeProduct({ source: product, assets, cached: false }, owner, {
    base: 'https://test.example/shardfiles/whole-pace/', offline: false, firstParty: true,
    fetch: () => Promise.reject(new Error('All test bytes must be admitted')), hash: wire => Promise.resolve(hashImmutableBytes(wire)),
  });
  return { geometry, ref, matrix, product, coarse };
}

test.each([false, true])('whole defaults read L0 only; explicit references retain strict decoding (object source=%s)', async object => {
  const owner = new Scope('whole-pace'), fixture = source(owner, true);
  const input = object ? fixture.product : 'whole-pace';
  const result = await readWholeGeometry(owner, input);
  expect(result.get('draw')?.geometry.getAttribute('position').array).toEqual(fixture.geometry.getAttribute('position').array);
  expect(result.size).toBe(1);
  // The same declared L1 reference still reaches the unchanged GLB refusal
  // when a caller explicitly asks for it; it is never silently discarded.
  await expect(readWholeGeometry(owner, input, [fixture.coarse])).rejects.toThrow();
});

test('yields through final validation and bounds without changing source bytes or exact sphere', async () => {
  const owner = new Scope('whole-pace'), fixture = source(owner), original = fixture.geometry, oracle = original.clone(), pause = vi.fn(() => Promise.resolve());
  oracle.computeBoundingSphere();
  try {
    const result = await readWholeGeometry(owner, 'whole-pace', [fixture.ref], pause), view = result.get('draw');
    expect(pause.mock.calls.length).toBeGreaterThan(4);
    expect(view?.geometry.getAttribute('position').array).toEqual(original.getAttribute('position').array);
    expect(view?.geometry.boundingSphere).toEqual(oracle.boundingSphere);
    expect(view?.geometry.boundingBox).toBeNull();
    expect(view?.matrix.elements).toEqual(fixture.matrix.elements);
    expect(result.size).toBe(1);
  } finally { owner.dispose(); oracle.dispose(); }
});

test.each([false, true])('the owned reader avoids transient attribute clones and keeps final backing detached (indexed=%s)', async indexed => {
  const owner = new Scope('whole-owned-channels'), fixture = source(owner, false, indexed);
  const clone = vi.spyOn(BufferAttribute.prototype, 'clone'), disposed = vi.spyOn(BufferGeometry.prototype, 'dispose');
  const result = await readWholeGeometry(owner, 'whole-pace', [fixture.ref]), view = result.get('draw');
  if (view === undefined) throw new Error('Missing reconstructed draw');
  expect(view.geometry.getAttribute('position').array).toEqual(fixture.geometry.getAttribute('position').array);
  expect(view.geometry.getAttribute('position').array.buffer).not.toBe(fixture.geometry.getAttribute('position').array.buffer);
  expect(view.geometry.index?.array).toEqual(fixture.geometry.index?.array);
  if (indexed) expect(view.geometry.index?.array.buffer).not.toBe(fixture.geometry.index?.array.buffer);
  expect(view.matrix.elements).toEqual(fixture.matrix.elements);
  expect(clone).not.toHaveBeenCalled();
  expect(disposed.mock.contexts.length).toBeGreaterThanOrEqual(2);
  for (const input of disposed.mock.contexts) {
    if (!(input instanceof BufferGeometry)) throw new Error('Expected decoded geometry cleanup');
    const position: unknown = input.getAttribute('position');
    if (!(position instanceof BufferAttribute)) throw new Error('Expected decoded plain positions');
    expect(position.array.buffer).not.toBe(view.geometry.getAttribute('position').array.buffer);
    if (indexed) expect(input.index?.array.buffer).not.toBe(view.geometry.index?.array.buffer);
  }
});

test('the public assembler still borrows caller-owned channels without disposing or mutating them', () => {
  const owner = new Scope('whole-borrowed-channels'), fixture = source(owner), geometry = fixture.geometry;
  const mesh = new Mesh(geometry, materials[materials.length - 1]);
  mesh.userData['nativeAttributes'] = { position: { semantic: 'POSITION', storage: 'Float32Array', normalized: false, itemSize: 3 } };
  const count = geometry.getAttribute('position').count;
  mesh.userData['wholePartition'] = { id: 'draw', vertices: { runs: [0, count] }, triangles: { runs: [0, count / 3] }, vertexCount: count, indexCount: 0, index: 'none' };
  mesh.userData['matrix64'] = fixture.matrix.elements;
  const disposed = vi.fn<() => void>(); geometry.addEventListener('dispose', disposed);
  const clone = vi.spyOn(BufferAttribute.prototype, 'clone'), result = assembleWholeGeometryViews([mesh]);
  const view = result.get('draw');
  if (view === undefined) throw new Error('Missing borrowed draw');
  try {
    expect(clone).toHaveBeenCalledTimes(1); expect(disposed).not.toHaveBeenCalled();
    const original = geometry.getAttribute('position'), output = view.geometry.getAttribute('position');
    expect(output.array).toEqual(original.array); expect(output.array.buffer).not.toBe(original.array.buffer);
    const first = original.getX(0); output.setX(0, first + 7); expect(original.getX(0)).toBe(first);
  } finally { view.geometry.dispose(); geometry.removeEventListener('dispose', disposed); }
});

test.each([true, false])('whole read phase totals are bounded and keep output and pause calls (Developer=%s)', async developer => {
  const previous = isDev(), owner = new Scope('whole-phase-timing'), fixture = source(owner), pause = vi.fn(() => Promise.resolve());
  const phases = ['read-wait', 'decode', 'assemble', 'yield', 'release', 'finalize'];
  try {
    setDev(developer);
    const result = await readWholeGeometry(owner, 'whole-pace', [fixture.ref], pause);
    expect(result.get('draw')?.geometry.getAttribute('position').array).toEqual(fixture.geometry.getAttribute('position').array);
    for (const phase of phases) {
      const spans = performance.getEntriesByName(`wildshard.prepare:whole-pace:whole.${phase}`), span = spans[0];
      expect(spans).toHaveLength(developer ? 1 : 0);
      if (developer) {
        if (span === undefined) throw new Error('Missing whole read phase');
        const detail: unknown = Reflect.get(span, 'detail');
        expect(detail).toEqual(expect.objectContaining({ failures: 0 }));
        if (detail === null || typeof detail !== 'object') throw new Error('Missing phase totals');
        const calls: unknown = Reflect.get(detail, 'calls');
        if (typeof calls !== 'number') throw new Error('Missing phase call count');
        if (phase === 'finalize') expect(calls).toBeGreaterThan(4);
        else expect(calls).toBe(phase === 'yield' ? pause.mock.calls.length : 1);
      }
    }
    expect(pause.mock.calls.length).toBeGreaterThan(4);
  } finally { setDev(previous); owner.dispose(); for (const phase of phases) performance.clearMeasures(`wildshard.prepare:whole-pace:whole.${phase}`); }
});

test('a scope closed during finalization disposes the unpublished reconstructed draw', async () => {
  const owner = new Scope('whole-cancel'), fixture = source(owner), disposed = vi.spyOn(BufferGeometry.prototype, 'dispose');
  let turns = 0;
  await expect(readWholeGeometry(owner, 'whole-pace', [fixture.ref], () => {
    if (++turns === 2) owner.dispose();
    return Promise.resolve();
  })).rejects.toThrow('Whole geometry unloaded while reading');
  expect(turns).toBe(2);
  expect(disposed.mock.contexts.some((geometry: unknown) => {
    if (!(geometry instanceof BufferGeometry) || geometry === fixture.geometry) return false;
    const position: unknown = geometry.getAttribute('position');
    return position instanceof BufferAttribute && position.count === 65538;
  })).toBe(true);
});

test('the default reader uses the owned work slice when no pause is supplied', async () => {
  const owner = new Scope('whole-default'), fixture = source(owner), timeout = vi.spyOn(owner, 'timeout');
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  try {
    const result = await readWholeGeometry(owner, 'whole-pace', [fixture.ref]);
    expect(result.size).toBe(1); expect(timeout.mock.calls.length).toBeGreaterThan(1);
  } finally { owner.dispose(); }
});

test.each([false, true])('live whole completions keep their shared budget and explicit pause (%s)', async explicit => {
  const owner = new Scope('whole-live-budget'), fixture = source(owner), timeout = vi.spyOn(owner, 'timeout');
  vi.spyOn(pacing, 'presenting').mockReturnValue(true);
  vi.spyOn(pacing, 'buildHeld').mockReturnValue(true);
  vi.spyOn(pacing, 'frameBudgetSpent').mockReturnValue(false);
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  const pause = vi.fn(() => Promise.resolve());
  const result = await readWholeGeometry(owner, 'whole-pace', [fixture.ref], explicit ? pause : undefined);
  expect(result.get('draw')?.geometry.getAttribute('position').array).toEqual(fixture.geometry.getAttribute('position').array);
  expect(result.get('draw')?.matrix.elements).toEqual(fixture.matrix.elements);
  expect(timeout).not.toHaveBeenCalled();
  if (explicit) expect(pause.mock.calls.length).toBeGreaterThan(4);
  else expect(pause).not.toHaveBeenCalled();
});

test('a spent live completion preserves its budget refusal and releases unpublished geometry', async () => {
  const owner = new Scope('whole-live-refusal'), fixture = source(owner), failure = new Error('original live budget refusal');
  vi.spyOn(pacing, 'presenting').mockReturnValue(true);
  vi.spyOn(pacing, 'buildHeld').mockReturnValue(true);
  vi.spyOn(pacing, 'frameBudgetSpent').mockReturnValue(true);
  const pause = vi.spyOn(workSlices, 'buildYield').mockRejectedValue(failure), disposed = vi.spyOn(BufferGeometry.prototype, 'dispose');
  await expect(readWholeGeometry(owner, 'whole-pace', [fixture.ref])).rejects.toBe(failure);
  expect(pause).toHaveBeenCalledExactlyOnceWith(owner);
  expect(disposed.mock.contexts).not.toContain(fixture.geometry);
  expect(disposed.mock.contexts.some((geometry: unknown) => {
    if (!(geometry instanceof BufferGeometry)) return false;
    const position: unknown = geometry.getAttribute('position');
    return position instanceof BufferAttribute && position.count === 65538;
  })).toBe(true);
});

test('closing the default yield owner cannot strand a reconstruction', async () => {
  const owner = new Scope('whole-default-cancel'), fixture = source(owner);
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  vi.spyOn(owner, 'timeout').mockImplementation(() => { owner.dispose(); return 0; });
  await expect(readWholeGeometry(owner, 'whole-pace', [fixture.ref])).rejects.toThrow('Whole geometry unloaded while reading');
});

test('bounds native inflate input and yields without changing bytes from a single network chunk', async () => {
  const bytes = new Uint8Array(262_144), chunks: number[] = [];
  let seed = 17;
  for (let i = 0; i < bytes.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; bytes[i] = seed & 255; }
  const compressed = zlibSync(bytes), NativeDecoder = DecompressionStream;
  vi.stubGlobal('DecompressionStream', class {
    readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>;
    readonly writable: WritableStream<BufferSource>;
    constructor(format: CompressionFormat) {
      const boundary = new TransformStream<BufferSource, BufferSource>({ transform(chunk, controller) { chunks.push(chunk.byteLength); controller.enqueue(chunk); } });
      this.readable = boundary.readable.pipeThrough(new NativeDecoder(format)); this.writable = boundary.writable;
    }
  });
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(compressed)));
  const timeout = vi.spyOn(pageScope, 'timeout');
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  expect(await fetchDeflatedBytes('https://test.example/bake')).toEqual(bytes);
  expect(Math.max(...chunks)).toBeLessThanOrEqual(16_384);
  expect(chunks.reduce((sum, size) => sum + size, 0)).toBe(compressed.length);
  expect(timeout.mock.calls.length).toBeGreaterThan(1);
});

test('restores every lane byte across paced blocks and refuses partial words', async () => {
  const lanes = new Uint8Array(1_048_576), words = lanes.length / 4, expected = new Uint8Array(lanes.length);
  for (let i = 0; i < words; i++) for (let b = 0; b < 4; b++) { const value = (i * 13 + b * 53) & 255; lanes[b * words + i] = value; expected[i * 4 + b] = value; }
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(zlibSync(lanes))));
  const timeout = vi.spyOn(pageScope, 'timeout');
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  expect(await fetchLaneBake('https://test.example/lanes')).toEqual(expected);
  expect(unshuffleLanes(lanes)).toEqual(expected);
  const range = new Uint8Array(lanes.length);
  unshuffleLanes(lanes, range, 2, 5);
  expect(range.slice(8, 20)).toEqual(expected.slice(8, 20));
  expect(range.slice(0, 8)).toEqual(new Uint8Array(8));
  expect(range.slice(20)).toEqual(new Uint8Array(lanes.length - 20));
  expect(() => unshuffleLanes(lanes, lanes)).toThrow('bad output/range');
  expect(() => unshuffleLanes(lanes, range, -1, 5)).toThrow('bad output/range');
  expect(() => unshuffleLanes(lanes, range, 0, words + 1)).toThrow('bad output/range');
  expect(timeout.mock.calls.length).toBeGreaterThan(4);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(zlibSync(new Uint8Array(3)))));
  await expect(fetchLaneBake('https://test.example/partial')).rejects.toThrow('not whole words');
});

test('refuses HTTP and invalid deflate responses rather than publishing partial bytes', async () => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
  await expect(fetchDeflatedBytes('https://test.example/missing')).rejects.toThrow('404');
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
  await expect(fetchDeflatedBytes('https://test.example/invalid')).rejects.toThrow();
});

test('a page-lived bake read survives a retired ambient construction owner', async () => {
  const bytes = new Uint8Array(65_536), retired = new Scope('retired-bake-reader'); owners.push(retired);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(zlibSync(bytes))));
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  enterOwner(retired); retired.dispose();
  try { expect(await fetchDeflatedBytes('https://test.example/page-bake')).toEqual(bytes); }
  finally { enterOwner(null); }
});

test('lane restoration keeps its page lifetime after the construction owner retires', async () => {
  const lanes = new Uint8Array(262_144), retired = new Scope('retired-lane-reader'); owners.push(retired);
  for (let i = 0; i < lanes.length; i++) lanes[i] = i % 251;
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(zlibSync(lanes))));
  let at = 0; vi.spyOn(performance, 'now').mockImplementation(() => { at += 10; return at; });
  enterOwner(retired); retired.dispose();
  try { expect(await fetchLaneBake('https://test.example/page-lanes')).toEqual(unshuffleLanes(lanes)); }
  finally { enterOwner(null); }
});


test('an unspent completion still rechecks an owner retired by its budget query', async () => {
  const owner = new Scope('whole-budget-retires'), fixture = source(owner);
  const nativeDispose: unknown = Reflect.get(BufferGeometry.prototype, 'dispose');
  if (typeof nativeDispose !== 'function') throw new Error('Missing native geometry disposal');
  let assembled = false;
  const disposed = vi.spyOn(BufferGeometry.prototype, 'dispose').mockImplementation(function disposeTemporary(this: BufferGeometry) {
    if (this.getAttribute('position')?.count === 65538) assembled = true;
    Reflect.apply(nativeDispose, this, []);
  });
  vi.spyOn(pacing, 'presenting').mockReturnValue(true);
  vi.spyOn(pacing, 'buildHeld').mockReturnValue(true);
  vi.spyOn(pacing, 'frameBudgetSpent').mockImplementation(() => {
    if (assembled) owner.dispose();
    return false;
  });
  await expect(readWholeGeometry(owner, 'whole-pace', [fixture.ref])).rejects.toThrow('Whole geometry unloaded while reading');
  expect(assembled).toBe(true); expect(owner.disposed).toBe(true);
  expect(disposed.mock.contexts).not.toContain(fixture.geometry);
});
