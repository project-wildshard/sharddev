import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, type InterleavedBufferAttribute } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Document, WebIO } from '@gltf-transform/core';
import { afterEach, expect, test } from 'vitest';
import { staticGlb } from './glb';
import { packStaticGlb, setStaticVertexPacking, staticVertexPacking } from './packedVertex';
import { glbGeometry } from '../vertexLayout';

// MEMORY-STRUCTURE STR16: the packed static vertex (Int8 normals, Uint8 colour, Uint16 UVs, 4-byte strides)

afterEach(() => { setStaticVertexPacking(false); });

const json = (bytes: Uint8Array): { accessors: { componentType: number; normalized?: boolean; type: string; bufferView: number; count: number }[]; bufferViews: { byteStride?: number }[]; meshes: { primitives: { attributes: Record<string, number> }[] }[]; extensionsUsed?: string[]; nodes: { extras?: Record<string, unknown> }[] } =>
  JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset + 12, 4).getUint32(0, true))));
const layout = (bytes: Uint8Array, semantic: string): string => {
  const doc = json(bytes), accessor = doc.accessors[doc.meshes[0]?.primitives[0]?.attributes[semantic] ?? -1];
  if (accessor === undefined) return 'missing';
  const name = ({ 5120: 'i8', 5121: 'u8', 5122: 'i16', 5123: 'u16', 5126: 'f32' } as Record<number, string>)[accessor.componentType];
  return `${name ?? '?'}x${accessor.type.slice(3)}${accessor.normalized === true ? 'n' : ''}/${String(doc.bufferViews[accessor.bufferView]?.byteStride ?? 'tight')}`;
};
async function read(bytes: Uint8Array): Promise<BufferGeometry> {
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  const found: BufferGeometry[] = [];
  gltf.scene.traverse(node => { if (node instanceof Mesh && node.geometry instanceof BufferGeometry) found.push(node.geometry); });
  const geometry = found[0]; if (geometry === undefined) throw new Error('no mesh'); return geometry;
}
const read3 = (attribute: BufferAttribute | InterleavedBufferAttribute, i: number, width: number): number[] =>
  [attribute.getX(i), attribute.getY(i), ...(width > 2 ? [attribute.getZ(i)] : [])];

function triangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1.25, 0, 0, 0, 2.5, -0.75]), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, -1, 0, 0.6, 0, -0.8]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0.123456, 0.987654]), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array([1, 0.5, 0, 0.25, 0.75, 1, 0.1, 0.2, 0.3]), 3));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

test('float normals, colours and UVs pack into aligned Int8, Uint8 and Uint16 channels the loader reads back', async () => {
  const material = new MeshStandardMaterial({ vertexColors: true }), geometry = triangle();
  const plain = staticGlb([{ geometry, material, compactIndex: true }]), packed = packStaticGlb(plain);
  expect(layout(packed, 'POSITION')).toBe('f32x3/tight');
  expect(layout(packed, 'NORMAL')).toBe('i8x3n/4');
  expect(layout(packed, 'COLOR_0')).toBe('u8x3n/4');
  expect(layout(packed, 'TEXCOORD_0')).toBe('u16x2n/tight');
  expect(json(packed).extensionsUsed).toContain('KHR_mesh_quantization');
  // 12 + 4 + 4 + 4 bytes a vertex, and nothing Metal must copy (STR17)
  expect(glbGeometry(packed)?.copied.size).toBe(0);
  const binary = (bytes: Uint8Array): number => bytes.byteLength - 28 - new DataView(bytes.buffer, bytes.byteOffset + 12, 4).getUint32(0, true);
  expect(binary(packed)).toBeLessThan(binary(plain));
  const back = await read(packed), source = triangle();
  for (let i = 0; i < 3; i++) {
    expect(read3(back.getAttribute('position'), i, 3)).toEqual(read3(source.getAttribute('position'), i, 3));
    read3(back.getAttribute('normal'), i, 3).forEach((n, c) => { expect(Math.abs(n - (read3(source.getAttribute('normal'), i, 3)[c] ?? 0))).toBeLessThan(1 / 127); });
    read3(back.getAttribute('color'), i, 3).forEach((n, c) => { expect(Math.abs(n - (read3(source.getAttribute('color'), i, 3)[c] ?? 0))).toBeLessThan(1 / 255); });
    read3(back.getAttribute('uv'), i, 2).forEach((n, c) => { expect(Math.abs(n - (read3(source.getAttribute('uv'), i, 2)[c] ?? 0))).toBeLessThan(1 / 65535); });
  }
  material.dispose(); geometry.dispose(); source.dispose();
});

test('a colour past 1 and a tiling UV stay float; positions never change storage', () => {
  const material = new MeshStandardMaterial({ vertexColors: true }), geometry = triangle();
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 4, 0, -0.5, 1]), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array([1.5, 0.5, 0, 0, 0, 0, 0, 0, 0]), 3));
  const packed = packStaticGlb(staticGlb([{ geometry, material }]));
  expect(layout(packed, 'TEXCOORD_0')).toBe('f32x2/tight');
  expect(layout(packed, 'COLOR_0')).toBe('f32x3/tight');
  expect(layout(packed, 'NORMAL')).toBe('i8x3n/4');
  expect(layout(packed, 'POSITION')).toBe('f32x3/tight');
  material.dispose(); geometry.dispose();
});

test('the tight 3-byte and stride-6 channels STR17 reports take a 4-byte stride with the same words', async () => {
  const material = new MeshStandardMaterial({ vertexColors: true }), geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Int8Array([0, 0, 127, 0, -127, 0, 90, 0, -90]), 3, true));
  geometry.setAttribute('color', new BufferAttribute(new Uint16Array([0, 65535, 1234, 65535, 0, 4321, 32768, 16384, 8192]), 3, true));
  const tight = staticGlb([{ geometry, material, compactIndex: true, quantizedChannels: true }]);
  expect([...glbGeometry(tight)?.copied.keys() ?? []].sort()).toEqual(['COLOR_0 u16x3n stride 6', 'NORMAL i8x3n stride 3']);
  const packed = packStaticGlb(tight);
  expect(glbGeometry(packed)?.copied.size).toBe(0);
  expect(layout(packed, 'NORMAL')).toBe('i8x3n/4');
  expect(layout(packed, 'COLOR_0')).toBe('u16x3n/8');
  const back = await read(packed), normal = back.getAttribute('normal'), colour = back.getAttribute('color');
  expect([0, 1, 2].flatMap(i => read3(normal, i, 3).map(n => Math.round(n * 127)))).toEqual([0, 0, 127, 0, -127, 0, 90, 0, -90]);
  expect([0, 1, 2].flatMap(i => read3(colour, i, 3).map(n => Math.round(n * 65535)))).toEqual([0, 65535, 1234, 65535, 0, 4321, 32768, 16384, 8192]);
  material.dispose(); geometry.dispose();
});

test('an interleaved glTF-Transform file comes apart into packed channels; a partition piece, skinned or meshopt file is left alone', async () => {
  const doc = new Document(), buffer = doc.createBuffer();
  const accessor = (type: 'VEC2' | 'VEC3', values: number[]) => doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute('POSITION', accessor('VEC3', [0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setAttribute('NORMAL', accessor('VEC3', [0, 0, 1, 0, 0, 1, 0, 0, 1])).setAttribute('TEXCOORD_0', accessor('VEC2', [0, 0, 1, 0, 0, 1]));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  const interleaved = await new WebIO().writeBinary(doc);
  expect(layout(interleaved, 'NORMAL')).toBe('f32x3/32');
  const packed = packStaticGlb(interleaved);
  expect(layout(packed, 'POSITION')).toBe('f32x3/tight');
  expect(layout(packed, 'NORMAL')).toBe('i8x3n/4');
  expect(layout(packed, 'TEXCOORD_0')).toBe('u16x2n/tight');
  expect(read3((await read(packed)).getAttribute('position'), 1, 3)).toEqual([1, 0, 0]);
  // a whole-partition piece (ONE-FORMAT's slabs) keeps its layout: its sibling pieces must declare the same channels
  const node = doc.getRoot().listNodes()[0];
  node?.setExtras({ wholePartition: { id: 'slab' } });
  const piece = await new WebIO().writeBinary(doc);
  expect(packStaticGlb(piece)).toBe(piece);
  node?.setExtras({});
  primitive.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(12)).setBuffer(buffer));
  const skinned = await new WebIO().writeBinary(doc);
  expect(packStaticGlb(skinned)).toBe(skinned);
  // a compressed file declares it; its views are not raw channels, so it passes through
  const text = new TextDecoder().decode(interleaved.subarray(20, 20 + new DataView(interleaved.buffer, interleaved.byteOffset + 12, 4).getUint32(0, true)));
  const marked = JSON.stringify({ ...JSON.parse(text), extensionsUsed: ['EXT_meshopt_compression'] }).padEnd(Math.ceil((text.length + 40) / 4) * 4, ' ');
  const meshopt = new Uint8Array(28 + marked.length + (interleaved.byteLength - 20 - text.length - 8 + 8));
  const raw = new TextEncoder().encode(marked), rest = interleaved.subarray(20 + new DataView(interleaved.buffer, interleaved.byteOffset + 12, 4).getUint32(0, true));
  const view = new DataView(meshopt.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(12, raw.length, true); view.setUint32(16, 0x4e4f534a, true);
  meshopt.set(raw, 20); meshopt.set(rest, 20 + raw.length); view.setUint32(8, 20 + raw.length + rest.length, true);
  const compressed = meshopt.subarray(0, 20 + raw.length + rest.length);
  expect(packStaticGlb(compressed)).toBe(compressed);
});

test('a native-attribute table names the packed storage it now reads', () => {
  const material = new MeshStandardMaterial({ vertexColors: true }), geometry = triangle();
  const packed = packStaticGlb(staticGlb([{ geometry, material, nativeAttributes: true }]));
  const table = json(packed).nodes[0]?.extras?.['nativeAttributes'] as Record<string, { storage: string; normalized: boolean }>;
  expect(table['normal']).toMatchObject({ storage: 'Int8Array', normalized: true });
  expect(table['uv']).toMatchObject({ storage: 'Uint16Array', normalized: true });
  expect(table['position']).toMatchObject({ storage: 'Float32Array', normalized: false });
  material.dispose(); geometry.dispose();
});

test('the cook option is off by default: staticGlb writes the old bytes until a generator asks', () => {
  const material = new MeshStandardMaterial({ vertexColors: true });
  expect(staticVertexPacking()).toBe(false);
  const before = staticGlb([{ geometry: triangle(), material }]);
  expect(layout(before, 'NORMAL')).toBe('f32x3/tight');
  expect(setStaticVertexPacking(true)).toBe(false);
  const after = staticGlb([{ geometry: triangle(), material }]);
  expect(after).toEqual(packStaticGlb(before));
  expect(layout(after, 'NORMAL')).toBe('i8x3n/4');
  setStaticVertexPacking(false);
  expect(staticGlb([{ geometry: triangle(), material }])).toEqual(before);
  material.dispose();
});
