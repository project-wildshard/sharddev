import { expect, test } from 'vitest';
import { BoxGeometry, BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Matrix4 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { staticGlb } from './glb';
import { compressGlb } from './glbCompression';
import { nameBlob, emitNamedBlobs } from '../blobs';
import { parseGlb, visitGlbTriangles } from '@wildshard/format/product';
import { createOwnedGeometry } from '@wildshard/engine/models/ownedGeometry';

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Fixture object required');
  return value as Record<string, unknown>;
};
const isGeometry = (value: unknown): value is BufferGeometry => value instanceof BufferGeometry;
function split(bytes: Uint8Array): { doc: Record<string, unknown>; bin: Uint8Array } {
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  return { doc: record(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + n)))), bin: bytes.subarray(28 + n) };
}
function join(doc: Record<string, unknown>, bin: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(doc)), size = Math.ceil(json.length / 4) * 4, n = Math.ceil(bin.length / 4) * 4;
  const bytes = new Uint8Array(28 + size + n), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + size); bytes.set(json, 20);
  view.setUint32(20 + size, n, true); view.setUint32(24 + size, 0x004e4942, true); bytes.set(bin, 28 + size); return bytes;
}
function model(): Uint8Array {
  const geometry = new BoxGeometry(1, 2, 3, 5, 5, 5), material = new MeshStandardMaterial({ vertexColors: true });
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(0.5), 3));
  geometry.setAttribute('aSway', new BufferAttribute(Float32Array.from({ length: count }, (_, i) => i / count), 1));
  try { return staticGlb([{ geometry, material, customAttributes: { _SWAY: 'aSway' }, compactIndex: true }]); }
  finally { geometry.dispose(); material.dispose(); }
}
test('meshopt named GLBs retain exact runtime channels, topology and admission costs', async () => {
  const raw = model(), packed = compressGlb(raw), loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [before, after] = await Promise.all([loader.parseAsync(Uint8Array.from(raw).buffer, ''), loader.parseAsync(Uint8Array.from(packed).buffer, '')]);
  const a = before.scene.children[0], b = after.scene.children[0];
  if (!(a instanceof Mesh) || !(b instanceof Mesh)) throw new Error('Fixture mesh missing');
  const original: unknown = a.geometry, restored: unknown = b.geometry;
  if (!isGeometry(original) || !isGeometry(restored)) throw new Error('Fixture geometry missing');
  for (const [name, attribute] of Object.entries(original.attributes)) expect(restored.getAttribute(name).array).toEqual(attribute.array);
  expect(restored.index?.array).toEqual(original.index?.array);
  expect(packed.length).toBeLessThan(raw.length);
  const cost = parseGlb(raw), compressedCost = parseGlb(packed);
  expect(compressedCost).toMatchObject({ gpu: cost.gpu, triangles: cost.triangles, draws: cost.draws });
  const triangles: unknown[] = [], decoded: unknown[] = [];
  visitGlbTriangles(raw, triangle => { triangles.push(triangle); }); visitGlbTriangles(packed, triangle => { decoded.push(triangle); });
  expect(decoded).toEqual(triangles);
  const blob = nameBlob('models/packed.glb', 'glb', packed);
  expect(emitNamedBlobs([blob]).assets.get(blob.file.hash)).toEqual(packed);
  const intake = createOwnedGeometry('fixture.glb', { _sway: 'aSway' });
  await intake.load(packed);
  const geometry = intake.take();
  expect(geometry.getAttribute('position').array).toEqual(original.getAttribute('position').array);
  expect(geometry.getAttribute('aSway').array).toEqual(original.getAttribute('_sway').array);
  geometry.dispose();
  original.dispose(); restored.dispose();
});
test('meshopt admission refuses corrupt ranges, virtual views, expansion and decoded positions', () => {
  const packed = compressGlb(model());
  const mutate = (change: (doc: Record<string, unknown>) => void): Uint8Array => {
    const { doc, bin } = split(packed); change(doc); return join(doc, bin);
  };
  const firstView = (doc: Record<string, unknown>): Record<string, unknown> => {
    const views = doc['bufferViews']; if (!Array.isArray(views)) throw new Error('Fixture views absent'); return record(views[0]);
  };
  const codec = (doc: Record<string, unknown>): Record<string, unknown> => record(record(firstView(doc)['extensions'])['EXT_meshopt_compression']);
  expect(() => parseGlb(mutate(doc => { codec(doc)['byteOffset'] = 25_000_000; }))).toThrow('physical buffer');
  expect(() => parseGlb(mutate(doc => { codec(doc)['count'] = 4_000_000; }))).toThrow('layout');
  expect(() => parseGlb(mutate(doc => { codec(doc)['byteLength'] = 0; }))).toThrow();
  expect(() => parseGlb(mutate(doc => { doc['extensionsRequired'] = []; }))).toThrow('fallback');
  expect(() => parseGlb(mutate(doc => { delete firstView(doc)['extensions']; }))).toThrow('virtual view');
  const { doc, bin } = split(packed), c = codec(doc), count = c['count'], stride = c['byteStride'];
  if (typeof count !== 'number' || typeof stride !== 'number') throw new Error('Fixture codec absent');
  const invalid = new Uint8Array(count * stride); new DataView(invalid.buffer).setFloat32(0, Number.NaN, true);
  const bad = MeshoptEncoder.encodeGltfBuffer(invalid, count, stride, 'ATTRIBUTES'), physical = new Uint8Array(bin.length + Math.ceil(bad.length / 4) * 4);
  physical.set(bin); physical.set(bad, bin.length); c['byteOffset'] = bin.length; c['byteLength'] = bad.length;
  const buffers = doc['buffers']; if (!Array.isArray(buffers)) throw new Error('Fixture buffers absent'); record(buffers[0])['byteLength'] = physical.length;
  expect(() => parseGlb(join(doc, physical))).toThrow('nonfinite GLB position');
});

test('compressed instance transforms retain placements and refuse corrupt decoded transforms', () => {
  const geometry = new BoxGeometry(1, 2, 3), material = new MeshStandardMaterial();
  try {
    for (const exactInstances of [false, true]) {
      const raw = staticGlb([{ geometry, material, ...(exactInstances ? { exactInstances: true as const } : {}), instances: [new Matrix4().makeTranslation(4, 2, 1), new Matrix4().makeTranslation(-3, 0, 7)] }]);
      const packed = compressGlb(raw), a: unknown[] = [], b: unknown[] = [];
      visitGlbTriangles(raw, triangle => { a.push(triangle); });
      visitGlbTriangles(packed, triangle => { b.push(triangle); });
      expect(b).toEqual(a);
      const { doc, bin } = split(packed), { doc: original, bin: originalBin } = split(raw);
      const nodes = doc['nodes'], accessors = doc['accessors'], views = doc['bufferViews'], oldViews = original['bufferViews'];
      if (!Array.isArray(nodes) || !Array.isArray(accessors) || !Array.isArray(views) || !Array.isArray(oldViews)) throw new Error('Fixture instance tables missing');
      const attributes = record(record(record(nodes[0])['extensions'])['EXT_mesh_gpu_instancing'])['attributes'];
      const id = record(attributes)[exactInstances ? '_MATRIX' : 'TRANSLATION'];
      if (typeof id !== 'number') throw new Error('Fixture transform absent');
      const accessor = record(accessors[id]), viewId = accessor['bufferView'];
      if (typeof viewId !== 'number') throw new Error('Fixture view absent');
      const view = record(views[viewId]), oldView = record(oldViews[viewId]);
      const offset = oldView['byteOffset'] ?? 0, length = oldView['byteLength'];
      if (typeof offset !== 'number' || typeof length !== 'number') throw new Error('Fixture view range absent');
      const bytes = Uint8Array.from(originalBin.subarray(offset, offset + length));
      new DataView(bytes.buffer).setFloat32(exactInstances ? 15 * 4 : 0, exactInstances ? 0 : Number.NaN, true);
      const codec = record(record(view['extensions'])['EXT_meshopt_compression']), count = codec['count'], stride = codec['byteStride'];
      if (typeof count !== 'number' || typeof stride !== 'number') throw new Error('Fixture instance codec absent');
      const encoded = MeshoptEncoder.encodeGltfBuffer(bytes, count, stride, 'ATTRIBUTES'), physical = new Uint8Array(bin.length + Math.ceil(encoded.length / 4) * 4);
      physical.set(bin); physical.set(encoded, bin.length); codec['byteOffset'] = bin.length; codec['byteLength'] = encoded.length;
      const buffers = doc['buffers']; if (!Array.isArray(buffers)) throw new Error('Fixture buffers absent'); record(buffers[0])['byteLength'] = physical.length;
      expect(() => parseGlb(join(doc, physical))).toThrow(exactInstances ? 'affine instance matrix' : 'instance transform');
    }
  } finally { geometry.dispose(); material.dispose(); }
});
