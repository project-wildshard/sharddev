import { expect, it } from 'vitest';
import { BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshGPUInstancing, type InstancedMesh } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { createOwnedGeometry, identitySpaceGeometry } from '@wildshard/engine/models/ownedGeometry';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { staticGlb } from './glb';
import { brotliBytes, compactPhoneGlb, nameCompactBlob } from './compactGlb';
import { compressGlb } from './glbCompression';

/** A phone-tier model big enough for the grid to pay: a 20 m sphere off the origin with per-vertex colours (`native`:
 *  written with its exact channel storage declared, as the foliage batches are). */
function sphereGlb(native = false): Uint8Array {
  const geometry = new SphereGeometry(10, 96, 64).translate(30, 4, -12), colours = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colours.length; i++) colours[i] = (i % 7) / 7;
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  return staticGlb([{ geometry, material: new MeshStandardMaterial(), ...(native ? { nativeAttributes: true } : {}) }]);
}

it('keeps named-file selection metadata through compact and unchanged geometry', async () => {
  const material = new MeshStandardMaterial(), geometry = new SphereGeometry(1);
  try {
    const unchanged = staticGlb([{ geometry, material }, { geometry, material }]);
    for (const input of [sphereGlb(), unchanged]) {
      const original = await nameCompactBlob('fixed.glb', input);
      const tiered = await nameCompactBlob('fixed.glb', input, { tier: 'desktop' });
      expect(tiered.file).toEqual({ ...original.file, tier: 'desktop' });
      expect(tiered.bytes).toEqual(original.bytes);
    }
  } finally { geometry.dispose(); material.dispose(); }
});

it('quantizes and meshopt-compresses a phone model only when its brotli bytes shrink', async () => {
  const input = sphereGlb(), packed = await compactPhoneGlb(input);
  expect(brotliBytes(packed)).toBeLessThan(brotliBytes(input) * 0.75);
  const json = JSON.parse(new TextDecoder().decode(packed.subarray(20, 20 + new DataView(packed.buffer, packed.byteOffset).getUint32(12, true)))) as { extensionsUsed?: string[] };
  expect(json.extensionsUsed).toEqual(expect.arrayContaining(['KHR_mesh_quantization', 'EXT_meshopt_compression']));
  // a compacted file is left alone the second time, and a two-mesh file is never touched
  expect(await compactPhoneGlb(packed)).toBe(packed);
  const pair = staticGlb([{ geometry: new SphereGeometry(1), material: new MeshStandardMaterial() }, { geometry: new SphereGeometry(2), material: new MeshStandardMaterial() }]);
  expect(await compactPhoneGlb(pair)).toBe(pair);
});

it.each([false, true])('the owned-geometry intake reads a compacted model back in its own space (native=%s)', async native => {
  const input = sphereGlb(native), original = createOwnedGeometry('/original.glb'), compact = createOwnedGeometry('/compact.glb');
  await original.load(input); await compact.load(await compactPhoneGlb(input));
  const a = original.take(), b = compact.take();
  try {
    const pa = a.getAttribute('position'), pb = b.getAttribute('position'), index = a.getIndex(), other = b.getIndex();
    expect(pb.array).toBeInstanceOf(Float32Array);
    expect(pb.count).toBe(pa.count);
    // the meshopt writer keeps the vertex order; one grid step of a 20 m sphere is ~0.5 mm
    let worst = 0;
    for (let i = 0; i < pa.count; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(pa.getComponent(i, c) - pb.getComponent(i, c)));
    expect(worst).toBeLessThan(1e-3);
    expect(Array.from(other?.array ?? [])).toEqual(Array.from(index?.array ?? []));
    const na = a.getAttribute('normal'), nb = b.getAttribute('normal');
    let normal = 0;
    for (let i = 0; i < na.count; i++) for (let c = 0; c < 3; c++) normal = Math.max(normal, Math.abs(na.getComponent(i, c) - nb.getComponent(i, c)));
    expect(normal).toBeLessThan(0.02);
    const mesh = new Mesh(b);
    b.computeBoundingBox();
    expect(b.boundingBox?.min.x).toBeCloseTo(20, 2);
    expect(mesh.matrixWorld.equals(mesh.matrix)).toBe(true);
  } finally { a.dispose(); b.dispose(); }
});

it('a meshopt input is decoded and competes; the smaller quantized file reads back in its own space', async () => {
  const input = compressGlb(sphereGlb()), packed = await compactPhoneGlb(input);
  expect(brotliBytes(packed)).toBeLessThan(brotliBytes(input));
  const original = createOwnedGeometry('/meshopt.glb'), compact = createOwnedGeometry('/compact.glb');
  await original.load(input); await compact.load(packed);
  const a = original.take(), b = compact.take();
  try {
    const pa = a.getAttribute('position'), pb = b.getAttribute('position');
    let worst = 0;
    for (let i = 0; i < pa.count; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(pa.getComponent(i, c) - pb.getComponent(i, c)));
    expect(worst).toBeLessThan(1e-3);
  } finally { a.dispose(); b.dispose(); }
});

/** World-space points of every instance of every vertex (T R S v), as a renderer draws an instanced node. */
async function instancedPoints(bytes: Uint8Array): Promise<number[][]> {
  await MeshoptDecoder.ready;
  const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(bytes);
  const node = doc.getRoot().listNodes()[0], instances = node?.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
  const position = node?.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION');
  if (node === undefined || instances === null || instances === undefined || position === null || position === undefined) throw new Error('Missing instanced node');
  const t = instances.getAttribute('TRANSLATION'), r = instances.getAttribute('ROTATION'), s = instances.getAttribute('SCALE'), out: number[][] = [];
  const v: number[] = [], at: number[] = [], q: number[] = [], k: number[] = [];
  for (let j = 0; j < (t?.getCount() ?? 0); j++) {
    t?.getElement(j, at); r?.getElement(j, q); s?.getElement(j, k);
    const matrix = new Matrix4().compose(new Vector3(at[0], at[1], at[2]), new Quaternion(q[0], q[1], q[2], q[3]), new Vector3(k[0], k[1], k[2]));
    for (let i = 0; i < position.getCount(); i += 37) { position.getElement(i, v); out.push(new Vector3(v[0], v[1], v[2]).applyMatrix4(matrix).toArray()); }
  }
  return out;
}
it('an instanced node keeps its identity transform: the grid folds into every instance', async () => {
  const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(sphereGlb()), root = doc.getRoot(), node = root.listNodes()[0], buffer = root.listBuffers()[0];
  if (node === undefined || buffer === undefined) throw new Error('Missing sphere node');
  const accessor = (values: number[], type: 'VEC3' | 'VEC4') => doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7).toArray();
  node.setExtension('EXT_mesh_gpu_instancing', doc.createExtension(EXTMeshGPUInstancing).createInstancedMesh()
    .setAttribute('TRANSLATION', accessor([0, 0, 0, 40, 2, -9, -15, 0, 30], 'VEC3'))
    .setAttribute('ROTATION', accessor([0, 0, 0, 1, ...rotation, 0, 0, 0, 1], 'VEC4'))
    .setAttribute('SCALE', accessor([1, 1, 1, 0.5, 0.5, 0.5, 2, 1, 2], 'VEC3')));
  const input = await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc), packed = await compactPhoneGlb(input);
  expect(packed).not.toBe(input);
  const json = JSON.parse(new TextDecoder().decode(packed.subarray(20, 20 + new DataView(packed.buffer, packed.byteOffset).getUint32(12, true)))) as { nodes: { translation?: number[]; scale?: number[] }[] };
  expect(json.nodes[0]?.translation).toBeUndefined(); expect(json.nodes[0]?.scale).toBeUndefined();
  const a = await instancedPoints(input), b = await instancedPoints(packed);
  expect(b).toHaveLength(a.length);
  let worst = 0;
  for (let i = 0; i < a.length; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs((a[i]?.[c] ?? 0) - (b[i]?.[c] ?? 0)));
  expect(worst).toBeLessThan(2e-3);
});

it('a rest pool reads a compacted model back as its identity-space Float32 mesh', async () => {
  const input = sphereGlb(), packed = await compactPhoneGlb(input), loader = new GLTFLoader();
  await MeshoptDecoder.ready; loader.setMeshoptDecoder(MeshoptDecoder);
  const parse = async (bytes: Uint8Array): Promise<Mesh> => {
    const gltf = await loader.parseAsync(bytes.slice().buffer, ''); gltf.scene.updateMatrixWorld(true);
    let found: Mesh | undefined; gltf.scene.traverse(node => { if (node instanceof Mesh) found = node; });
    if (found === undefined) throw new Error('Missing mesh'); return found;
  };
  const original = await parse(input), compact = await parse(packed);
  expect(identitySpaceGeometry(original)).toBeNull();
  const decoded = identitySpaceGeometry(compact); if (decoded === null) throw new Error('Missing decoded geometry');
  try {
    // every channel, not only the quantized ones: the writer interleaves its views, and a rest pool takes plain Float32 only
    for (const [name, attribute] of Object.entries(decoded.attributes)) {
      expect(attribute, name).toBeInstanceOf(BufferAttribute); expect(attribute.array, name).toBeInstanceOf(Float32Array); expect(attribute.normalized, name).toBe(false);
    }
    const pa = original.geometry.getAttribute('position'), pb = decoded.getAttribute('position'), na = original.geometry.getAttribute('normal'), nb = decoded.getAttribute('normal');
    let worst = 0, normal = 0;
    for (let i = 0; i < pa.count; i++) for (let c = 0; c < 3; c++) {
      worst = Math.max(worst, Math.abs(pa.getComponent(i, c) - pb.getComponent(i, c))); normal = Math.max(normal, Math.abs(na.getComponent(i, c) - nb.getComponent(i, c)));
    }
    expect(worst).toBeLessThan(1e-3); expect(normal).toBeLessThan(0.02);
  } finally { decoded.dispose(); }
});
