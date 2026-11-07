import { expect, it } from 'vitest';
import { BoxGeometry, BufferAttribute, Float16BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import { createRigLoader } from '@wildshard/engine/anim/rigParser';
import { nativeWholeGeometry, restoreDrawnChannels } from '@wildshard/engine/models/nativeGeometry';
import * as v from 'valibot';
import { staticGlb } from './glb';

const GlbJson = v.object({ accessors: v.array(v.object({ componentType: v.number() })),
  meshes: v.array(v.object({ primitives: v.array(v.object({ attributes: v.record(v.string(), v.number()) })) })) });
const json = (glb: Uint8Array): v.InferOutput<typeof GlbJson> =>
  v.parse(GlbJson, JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true)))));

it('a nativeOnce GLB writes an integer channel once in its type and a half channel only as its bits, and restores both exactly', async () => {
  const geometry = new BoxGeometry(2, 3, 4), count = geometry.getAttribute('position').count;
  const tag = new Uint16Array(count * 2).map((_, i) => (i * 37) % 65535), half = new Uint16Array(count * 4).map((_, i) => 0x3c00 + (i % 512));
  geometry.setAttribute('tag', new BufferAttribute(tag, 2));
  geometry.setAttribute('half', new Float16BufferAttribute(half, 4));
  const glb = staticGlb([{ geometry, material: new MeshStandardMaterial(), nativeAttributes: true, nativeOnce: true, customAttributes: { _TAG: 'tag', _HALF: 'half' } }]);
  const { accessors, meshes } = json(glb), attributes = meshes[0]?.primitives[0]?.attributes ?? {};
  // no float32 copy of either channel: the integer one is stored once as Uint16, the half one only as its raw bits
  expect(accessors[attributes['_TAG'] ?? -1]?.componentType).toBe(5123);
  expect(attributes['_HALF']).toBeUndefined();
  expect(accessors[attributes['_WS_RAW_HALF'] ?? -1]?.componentType).toBe(5123);
  const gltf = await createRigLoader().parseBytesAsync(glb, '');
  let node: Mesh | undefined;
  gltf.scene.traverse(child => { if (child instanceof Mesh) node = child; });
  if (node === undefined) throw new Error('Missing native mesh');
  const restored = nativeWholeGeometry(node);
  expect(Array.from(restored.getAttribute('tag').array)).toEqual(Array.from(tag));
  const halves = restored.getAttribute('half');
  expect(halves).toBeInstanceOf(Float16BufferAttribute);
  expect(Array.from(halves.array)).toEqual(Array.from(half));
});

it('a native node with a vec4 shader normal draws with that normal once its drawn channels are restored (D154)', async () => {
  const geometry = new BoxGeometry(2, 3, 4), count = geometry.getAttribute('position').count, source = geometry.getAttribute('normal');
  const packed = new Int8Array(count * 4);
  for (let i = 0; i < count; i++) { for (let c = 0; c < 3; c++) packed[i * 4 + c] = Math.round(source.getComponent(i, c) * 127); packed[i * 4 + 3] = 64; }
  geometry.setAttribute('normal', new BufferAttribute(packed, 4, true));
  const glb = staticGlb([{ geometry, material: new MeshStandardMaterial(), nativeAttributes: true, nativeOnce: true }]);
  const gltf = await createRigLoader().parseBytesAsync(glb, '');
  let node: Mesh | undefined;
  gltf.scene.traverse(child => { if (child instanceof Mesh) node = child; });
  if (node === undefined) throw new Error('Missing native mesh');
  // a vec4 normal is never a glTF NORMAL: as parsed, the node has no normal for a lit material to read
  expect(node.geometry.hasAttribute('normal')).toBe(false);
  const position = node.geometry.getAttribute('position');
  restoreDrawnChannels(node);
  const normal = node.geometry.getAttribute('normal');
  expect(normal.itemSize).toBe(4);
  expect(normal.normalized).toBe(true);
  expect(Array.from(normal.array)).toEqual(Array.from(packed));
  expect(node.geometry.hasAttribute('_ws_raw_normal')).toBe(false);
  expect(node.geometry.getAttribute('position')).toBe(position);
  // already drawable: a second call changes nothing
  restoreDrawnChannels(node);
  expect(node.geometry.getAttribute('normal')).toBe(normal);
});

it('native coarse GLB application channels recover their declared names with identical storage and bytes (NR4)', async () => {
  const geometry = new BoxGeometry(2, 3, 4), count = geometry.getAttribute('position').count;
  geometry.setAttribute('aFace', new BufferAttribute(Float32Array.from({ length: count * 4 }, (_, i) => i % 5 === 0 ? -0 : i / 8), 4));
  geometry.setAttribute('aMisc', new BufferAttribute(Uint8Array.from({ length: count * 2 }, (_, i) => (i * 37) % 256), 2, true));
  geometry.setAttribute('aOff', new BufferAttribute(Float32Array.from({ length: count * 3 }, (_, i) => i - 11.5), 3));
  geometry.setAttribute('aPat', new Float16BufferAttribute(Uint16Array.from({ length: count * 4 }, (_, i) => 0x3c00 + i % 512), 4));
  geometry.setAttribute('aSpill', new BufferAttribute(Uint16Array.from({ length: count * 4 }, (_, i) => i * 19), 4));
  geometry.setAttribute('aTan', new BufferAttribute(Int8Array.from({ length: count * 4 }, (_, i) => i % 127 - 63), 4, true));
  const channels = { _AFACE: 'aFace', _AMISC: 'aMisc', _AOFF: 'aOff', _APAT: 'aPat', _ASPILL: 'aSpill', _ATAN: 'aTan' };
  const glb = staticGlb([{ geometry, material: new MeshStandardMaterial(), nativeAttributes: true, nativeOnce: true, compactIndex: true, customAttributes: channels }]);
  const original = glb.slice(), gltf = await createRigLoader().parseBytesAsync(glb, '');
  let node: Mesh | undefined;
  gltf.scene.traverse(child => { if (child instanceof Mesh) node = child; });
  if (node === undefined) throw new Error('Missing native coarse mesh');
  const positions = node.geometry.getAttribute('position'), indices = node.geometry.getIndex();
  expect(node.geometry.hasAttribute('aFace')).toBe(false);
  restoreDrawnChannels(node);
  for (const name of Object.values(channels)) {
    const source = geometry.getAttribute(name), restored = node.geometry.getAttribute(name);
    expect(restored.itemSize).toBe(source.itemSize); expect(restored.normalized).toBe(source.normalized);
    expect(restored.array.constructor).toBe(source.array.constructor);
    expect(new Uint8Array(restored.array.buffer, restored.array.byteOffset, restored.array.byteLength))
      .toEqual(new Uint8Array(source.array.buffer, source.array.byteOffset, source.array.byteLength));
    if (name === 'aPat') expect(restored).toBeInstanceOf(Float16BufferAttribute);
  }
  expect(Object.keys(node.geometry.attributes).sort()).toEqual(Object.keys(geometry.attributes).sort());
  expect(node.geometry.getAttribute('position')).toBe(positions); expect(node.geometry.getIndex()).toBe(indices);
  expect(glb).toEqual(original);
  const face = node.geometry.getAttribute('aFace'); restoreDrawnChannels(node);
  expect(node.geometry.getAttribute('aFace')).toBe(face);
});
