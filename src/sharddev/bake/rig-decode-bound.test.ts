import { BoxGeometry, BufferGeometry, FileLoader, Material, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { staticGlb } from './glb';
import { afterEach, expect, it, vi } from 'vitest';
import { createRigLoader } from '@wildshard/engine/anim/rigParser';
import * as clock from '@wildshard/engine/core/clock';

function isMesh(node: Object3D): node is Mesh {
  if (!(node instanceof Mesh)) return false;
  const geometry: unknown = node.geometry, material: unknown = node.material;
  return geometry instanceof BufferGeometry && (material instanceof Material || Array.isArray(material) && material.every(value => value instanceof Material));
}

const document = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] });
afterEach(() => { vi.restoreAllMocks(); });

it('reads files in parallel while bounding real parser work across loader instances', async () => {
  const reads: string[] = [], entered: number[] = [], releases: (() => void)[] = [];
  let cleanup = false;
  vi.spyOn(FileLoader.prototype, 'load').mockImplementation((url, onLoad) => {
    reads.push(url);
    queueMicrotask(() => { onLoad?.(document); });
    return undefined;
  });
  const jobs = [0, 1, 2].map(index => {
    const loader = createRigLoader();
    loader.register(() => ({ name: 'fixture-decode-bound', afterRoot: () => {
      entered.push(index);
      if (cleanup) return Promise.resolve();
      return new Promise<void>(resolve => { releases[index] = resolve; });
    } }));
    return loader.loadAsync(`https://models.example/${index}.gltf`);
  });
  expect(reads).toHaveLength(3);
  try {
    for (const index of [0, 1, 2]) {
      await expect.poll(() => entered).toEqual(Array.from({ length: index + 1 }, (_, at) => at));
      releases[index]?.();
      const loaded = await jobs[index];
      expect(loaded?.scene.type).toBe('Group');
    }
  } finally { cleanup = true; for (const release of releases) release(); }
  await Promise.all(jobs);
});

it('releases the shared slot after a synchronous parser failure', async () => {
  const failed = createRigLoader().parseAsync(JSON.stringify({ asset: { version: '1.0' } }), '');
  const following = createRigLoader().parseAsync(document, '');
  await expect(failed).rejects.toThrow(/Unsupported asset/u);
  expect((await following).scene.type).toBe('Group');
});

it('ends a spent browser decode slice before starting the next cached parse', async () => {
  const previousWindow = globalThis.window;
  vi.stubGlobal('window', {}); vi.useFakeTimers();
  let time = 0;
  vi.spyOn(clock, 'diagnosticNow').mockImplementation(() => time);
  const entered: number[] = [], reads: string[] = [];
  vi.spyOn(FileLoader.prototype, 'load').mockImplementation((url, onLoad) => {
    reads.push(url); queueMicrotask(() => { onLoad?.(document); }); return undefined;
  });
  try {
    const jobs = [0, 1].map(index => {
      const loader = createRigLoader();
      loader.register(() => ({ name: 'fixture-decode-slice', afterRoot: () => { entered.push(index); time = 10; return null; } }));
      return loader.loadAsync(`https://models.example/sliced-${index}.gltf`);
    });
    expect(reads).toHaveLength(2);
    await jobs[0]; await Promise.resolve();
    expect(entered).toEqual([0]);
    await vi.runOnlyPendingTimersAsync();
    await jobs[1]; expect(entered).toEqual([0, 1]);
  } finally { vi.useRealTimers(); vi.stubGlobal('window', previousWindow); }
});

it('copies an immutable byte view only after acquiring its decode slot', async () => {
  let release: (() => void) | undefined;
  const first = createRigLoader();
  first.register(() => ({ name: 'fixture-wire-bound', afterRoot: () => new Promise<void>(resolve => { release = resolve; }) }));
  const active = first.parseAsync(document, '');
  await expect.poll(() => release !== undefined).toBe(true);
  const original = new TextEncoder().encode(document), padded = new Uint8Array(original.length + 8);
  padded.set(original, 4);
  const view = padded.subarray(4, original.length + 4), copy = vi.spyOn(Uint8Array, 'from');
  const queued = createRigLoader().parseBytesAsync(view, '');
  try {
    await Promise.resolve(); expect(copy).not.toHaveBeenCalled();
    release?.(); await active;
    expect((await queued).scene.type).toBe('Group');
    expect(copy).toHaveBeenCalledWith(view);
    expect(view).toEqual(original);
  } finally { release?.(); await active; await queued; }
});


it('borrows a complete immutable GLB while every parse keeps private geometry', async () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const wire = staticGlb([{ geometry, material }]), expected = wire.slice();
  const copy = vi.spyOn(Uint8Array, 'from');
  const files = await Promise.all([createRigLoader().parseBytesAsync(wire, ''), createRigLoader().parseBytesAsync(wire, '')]);
  const meshes = files.map(file => {
    const found: Mesh[] = [];
    file.scene.traverse(node => { if (isMesh(node)) found.push(node); });
    const first = found[0];
    if (first === undefined || !(first.geometry instanceof BufferGeometry)) throw new Error('Missing decoded fixture geometry');
    return first;
  });
  try {
    expect(copy.mock.calls.some(([input]) => input === wire)).toBe(false);
    expect(wire).toEqual(expected);
    const first = meshes[0], second = meshes[1];
    if (first === undefined || second === undefined) throw new Error('Missing independent parses');
    const a = first.geometry.getAttribute('position'), b = second.geometry.getAttribute('position');
    expect(a.array).toEqual(b.array);
    expect(a.array.buffer).not.toBe(wire.buffer);
    expect(a.array.buffer).not.toBe(b.array.buffer);
    const before = b.getX(0);
    a.setX(0, 99); wire.fill(0);
    expect(b.getX(0)).toBe(before);
  } finally {
    for (const mesh of meshes) { mesh.geometry.dispose(); for (const value of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) value.dispose(); }
    geometry.dispose(); material.dispose();
  }
});

it.each(['shared', 'offset'] as const)('copies %s GLB storage before the parser owns its binary data', async storage => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const original = staticGlb([{ geometry, material }]);
  const shared = storage === 'shared' ? new Uint8Array(new SharedArrayBuffer(original.byteLength)) : new Uint8Array(original.byteLength + 8).subarray(4, original.byteLength + 4);
  shared.set(original);
  const copy = vi.spyOn(Uint8Array, 'from');
  const file = await createRigLoader().parseBytesAsync(shared, '');
  try {
    expect(copy.mock.calls.some(([input]) => input === shared)).toBe(true);
    expect(shared).toEqual(original);
  } finally {
    file.scene.traverse(node => { if (isMesh(node)) { node.geometry.dispose(); for (const value of Array.isArray(node.material) ? node.material : [node.material]) value.dispose(); } });
    geometry.dispose(); material.dispose();
  }
});
