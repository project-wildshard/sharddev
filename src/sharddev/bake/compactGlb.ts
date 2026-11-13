// oxlint-disable-next-line import/no-nodejs-modules -- The build measures each file's wire bytes with the deploy's brotli.
import { brotliCompressSync, constants } from 'node:zlib';
import { WebIO, type Accessor, type Document, type Mesh, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMeshQuantization, type InstancedMesh } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { compressGlb } from './glbCompression';
import { hashImmutableBytes } from '../immutable';
import { nameBlob, nameMeshoptBlob, type BlobOptions, type NamedBlob } from '../blobs';
import { entryFootprints, obstructsEntry } from '@wildshard/format/entryGeometry';
import type { ShardEntryways } from '@wildshard/format/entryways';
import { visitGlbTriangles } from '@wildshard/format/product';

/** The brotli size a phone pays for a file over the wire: the deploy's own encoding, quality 3 (Vercel's responses match it
 *  byte for byte). */
export function brotliBytes(bytes: Uint8Array): number {
  return brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 3, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }).length;
}

const quantized = (accessor: Accessor, array: Int16Array<ArrayBuffer> | Int8Array<ArrayBuffer> | Uint8Array<ArrayBuffer>): void => {
  accessor.setArray(array).setNormalized(true);
};

/** compactClearGlb's picks this process has made (null: the input was kept) */
const cleared = new Map<string, Uint8Array | null>();
/** compactPhoneGlb's picks this process has made (null: the input was kept) */
const compacted = new Map<string, Uint8Array | null>();

/**
 * iPhone downloads I3: a phone-tier baked model with 16-bit positions, 8-bit normals and 8-bit colours
 * (KHR_mesh_quantization), with or without meshopt (EXT_meshopt_compression): whichever of the input, the quantized
 * file and the packed one has the fewest brotli bytes ships. The positions sit on the mesh's own grid: a uniform scale and a translation on its node dequantize
 * them (`createOwnedGeometry` bakes that node transform back into float positions). An instanced node
 * (EXT_mesh_gpu_instancing) keeps its identity transform: the grid folds into every instance's translation and scale
 * instead (the instance applies after the vertex). A meshopt input is decoded first and competes as it was. Only a file
 * with exactly one mesh on one identity-space node, float positions and no skin, morph target or animation is compacted
 * (channels already quantized stay as they are); every other file, and every channel but POSITION / NORMAL / COLOR_0, passes through unchanged.
 * `each`: a bank of named meshes, each on its own root identity node (a rest pool), puts every node on its own grid.
 */
export async function compactPhoneGlb(input: Uint8Array, options: { readonly contain?: true; readonly each?: true } = {}): Promise<Uint8Array> {
  // the pick is a pure function of the bytes: a producer that prepares its output again (a test's second prepareOutput, a
  // rebuild in one process) reuses it instead of re-running the meshopt and brotli trials; a hit hands back its own copy
  const key = `${options.contain === true ? 'contain' : 'grid'}${options.each === true ? '-each' : ''}:${hashImmutableBytes(input)}`, known = compacted.get(key);
  if (known === null) return input;
  if (known !== undefined) return Uint8Array.from(known);
  const result = await compactOnce(input, options);
  compacted.set(key, result === input ? null : Uint8Array.from(result));
  return result;
}

/** Put one root mesh node on its own uniform grid (16-bit positions, Int8 normals, Uint8 colours in [0, 1]); false,
 *  changing nothing, when its mesh cannot be (no float vec3 positions, morph targets, or instances that will not fold). */
function gridNode(doc: Document, node: Node, mesh: Mesh, contain: boolean): boolean {
  const primitives = mesh.listPrimitives();
  if (primitives.length === 0 || primitives.some(primitive => primitive.listTargets().length > 0)) return false;
  // one uniform grid for the whole mesh (a non-uniform scale would bend its normals)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], point: number[] = [];
  for (const primitive of primitives) {
    const position = primitive.getAttribute('POSITION');
    if (position === null || position.getComponentType() !== 5126 || position.getElementSize() !== 3) return false;
    // Unnormalized float storage is already decoded; normalized channels keep getElement.
    const values = position.getNormalized() ? null : position.getArray(), count = position.getCount();
    for (let i = 0; i < count; i++) {
      if (values === null) position.getElement(i, point);
      for (let axis = 0; axis < 3; axis++) { const value = (values === null ? point[axis] : values[i * 3 + axis]) ?? 0; min[axis] = Math.min(min[axis] ?? 0, value); max[axis] = Math.max(max[axis] ?? 0, value); }
    }
  }
  const mid = (axis: number): number => ((min[axis] ?? 0) + (max[axis] ?? 0)) / 2;
  const centre: [number, number, number] = [mid(0), mid(1), mid(2)];
  const half = Math.max(...[0, 1, 2].map(axis => ((max[axis] ?? 0) - (min[axis] ?? 0)) / 2), 1e-6);
  const instances = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
  if (instances !== null && !foldGrid(doc, instances, centre, half)) return false;
  const done = new Set<Accessor>();
  for (const primitive of primitives) {
    const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), colour = primitive.getAttribute('COLOR_0');
    if (position !== null && !done.has(position)) {
      const count = position.getCount(), values = position.getNormalized() ? null : position.getArray();
      const out = new Int16Array(count * 3);
      for (let i = 0; i < count; i++) {
        if (values === null) position.getElement(i, point);
        for (let axis = 0; axis < 3; axis++) {
          let q = Math.round((((values === null ? point[axis] : values[i * 3 + axis]) ?? 0) - (centre[axis] ?? 0)) / half * 32767);
          // `contain`: a grid step never carries a vertex past the mesh's own bounds (a placed tile's cell edge, ±250 m)
          if (contain) {
            const at = (step: number): number => step / 32767 * half + (centre[axis] ?? 0);
            while (q > -32767 && at(q) > (max[axis] ?? 0)) q--;
            while (q < 32767 && at(q) < (min[axis] ?? 0)) q++;
          }
          out[i * 3 + axis] = q;
        }
      }
      quantized(position, out); done.add(position);
    }
    if (normal !== null && !done.has(normal) && normal.getComponentType() === 5126 && normal.getElementSize() === 3) {
      const count = normal.getCount(), values = normal.getNormalized() ? null : normal.getArray();
      const out = new Int8Array(count * 3);
      for (let i = 0; i < count; i++) {
        if (values === null) normal.getElement(i, point);
        for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(Math.max(-1, Math.min(1, (values === null ? point[c] : values[i * 3 + c]) ?? 0)) * 127);
      }
      quantized(normal, out); done.add(normal);
    }
    if (colour !== null && !done.has(colour) && colour.getComponentType() === 5126) {
      const width = colour.getElementSize(), values = colour.getArray();
      if (values !== null && Array.from(values).every(value => value >= 0 && value <= 1)) {
        const out = new Uint8Array(colour.getCount() * width);
        for (let i = 0; i < out.length; i++) out[i] = Math.round((values[i] ?? 0) * 255);
        quantized(colour, out); done.add(colour);
      }
    }
  }
  if (instances === null) node.setTranslation(centre).setScale([half, half, half]);
  // a native-attribute file (its intake restores each channel's declared storage) declares the new storage too
  const extras = node.getExtras(), native: unknown = extras['nativeAttributes'];
  if (typeof native === 'object' && native !== null) {
    const stored: Readonly<Record<string, readonly [string, boolean]>> = { POSITION: ['Int16Array', true], NORMAL: ['Int8Array', true], COLOR_0: ['Uint8Array', true] };
    const rows = Object.fromEntries(Object.entries(native).map(([name, row]: [string, unknown]) => {
      if (typeof row !== 'object' || row === null || !('semantic' in row) || typeof row.semantic !== 'string') return [name, row];
      const accessor = primitives[0]?.getAttribute(row.semantic), next = stored[row.semantic];
      return [name, accessor !== null && accessor !== undefined && done.has(accessor) && next !== undefined ? { ...row, storage: next[0], normalized: next[1] } : row];
    }));
    node.setExtras({ ...extras, nativeAttributes: rows });
  }
  return true;
}

async function compactOnce(input: Uint8Array, options: { readonly contain?: true; readonly each?: true }): Promise<Uint8Array> {
  await MeshoptDecoder.ready;
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(Uint8Array.from(input)), root = doc.getRoot();
  const used = new Set(root.listExtensionsUsed().map(extension => extension.extensionName));
  const nodes = root.listNodes().filter(node => node.getMesh() !== null), node = nodes[0], mesh = node?.getMesh();
  if (root.listSkins().length > 0 || root.listAnimations().length > 0 || node === undefined || mesh === null || mesh === undefined) return input;
  if (options.each !== true && (nodes.length !== 1 || root.listMeshes().length !== 1
    || node.getMatrix().some((value, i) => value !== (i % 5 === 0 ? 1 : 0)) || node.getParentNode() !== null)) return input;
  if (options.each === true) {
    // `each`: every mesh on its own root identity node, each node gridded alone (a rest-pool bank of named shapes)
    const meshes = new Set(nodes.map(row => row.getMesh()));
    if (meshes.size !== nodes.length || nodes.some(row => row.getParentNode() !== null || row.getExtension('EXT_mesh_gpu_instancing') !== null
      || row.getMatrix().some((value, i) => value !== (i % 5 === 0 ? 1 : 0)))) return input;
    for (const row of nodes) { const own = row.getMesh(); if (own === null || !gridNode(doc, row, own, options.contain === true)) return input; }
  } else if (!gridNode(doc, node, mesh, options.contain === true)) return input;
  if (!used.has('KHR_mesh_quantization')) doc.createExtension(KHRMeshQuantization).setRequired(true);
  // a meshopt input was decoded on read: the quantized file is written plain, and packed again below
  for (const extension of root.listExtensionsUsed()) if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
  // the quantized file with and without meshopt: a triangle soup often packs better under brotli alone
  const plain = await io.writeBinary(doc), packed = compressGlb(plain);
  const sizes = [input, plain, packed].map(bytes => ({ bytes, size: brotliBytes(bytes) }));
  return sizes.reduce((best, row) => row.size < best.size ? row : best).bytes;
}

/** Name a built GLB the way a phone-geometry producer ships it (I3): `compactPhoneGlb`'s pick when it compacts the file,
 *  else the lossless meshopt pick of a `meshopt: true` source (`nameMeshoptBlob`). */
export async function nameCompactBlob(name: string, bytes: Uint8Array, options: BlobOptions = {}): Promise<NamedBlob> {
  const compact = await compactPhoneGlb(bytes);
  return compact === bytes ? nameMeshoptBlob(name, bytes, options) : nameBlob(name, 'glb', compact, options);
}

/** `compactPhoneGlb` for a placed tile beside the cell's entryways: rounding onto the grid may lift a road-height vertex by
 *  under half a step, which the entryway clearance check (format/entryClearance) rightly refuses, so a tile whose compact
 *  triangles obstruct an entry footprint its exact ones did not keeps its exact bytes. Its grid never carries a vertex past
 *  the tile's own bounds (`contain`), which the cell's draw-bounds check holds to ±250 m. */
export async function compactClearGlb(input: Uint8Array, entryways: readonly Pick<ShardEntryways[number], 'edge' | 'width'>[]): Promise<Uint8Array> {
  // the pick (and its two triangle walks) is a pure function of the bytes and the entryways: kept for the process, as
  // compactPhoneGlb keeps its own (a producer that prepares its output again reuses it; a hit hands back its own copy)
  const key = `${hashImmutableBytes(input)}:${JSON.stringify(entryways.map(row => [row.edge, row.width]))}`, known = cleared.get(key);
  if (known === null) return input;
  if (known !== undefined) return Uint8Array.from(known);
  const compact = await compactPhoneGlb(input, { contain: true });
  if (compact === input) { cleared.set(key, null); return input; }
  const rectangles = entryFootprints(entryways);
  const obstructs = (bytes: Uint8Array): boolean => {
    let hit = false;
    visitGlbTriangles(bytes, triangle => { if (!hit && rectangles.some(rect => obstructsEntry(triangle, rect))) hit = true; });
    return hit;
  };
  const result = obstructs(compact) && !obstructs(input) ? input : compact;
  cleared.set(key, result === input ? null : Uint8Array.from(result));
  return result;
}

/** `nameCompactBlob` over a set of shapes: one hash has one logical name (emitNamedBlobs), so a shape whose compacted bytes
 *  equal an earlier one's (two shapes that differ only below the grid step) keeps its meshopt pick instead. */
export async function nameCompactBlobs(shapes: readonly (readonly [string, Uint8Array])[]): Promise<NamedBlob[]> {
  const named = await Promise.all(shapes.map(([name, bytes]) => nameCompactBlob(name, bytes))), seen = new Set<string>();
  const out: NamedBlob[] = [];
  for (const [i, blob] of named.entries()) {
    const shape = shapes[i];
    if (shape === undefined) throw new Error('Missing compact shape');
    if (seen.has(blob.file.hash)) out.push(await nameMeshoptBlob(shape[0], shape[1]));
    else { seen.add(blob.file.hash); out.push(blob); }
  }
  return out;
}

/** Fold a grid (`centre`, uniform `half`) into each instance: T' = T + R(S * centre), S' = S * half, so that
 *  T' R S' q = T R S (half q + centre). Refuses (false) instance rows that are not plain float TRS. */
function foldGrid(doc: Document, instances: InstancedMesh, centre: readonly [number, number, number], half: number): boolean {
  const t = instances.getAttribute('TRANSLATION'), r = instances.getAttribute('ROTATION'), s = instances.getAttribute('SCALE');
  const rows = [t, r, s].filter((row): row is Accessor => row !== null);
  const count = rows[0]?.getCount() ?? 0;
  if (count === 0 || rows.some(row => row.getComponentType() !== 5126 || row.getCount() !== count)) return false;
  const translation = new Float32Array(count * 3), scale = new Float32Array(count * 3), at: number[] = [], q: number[] = [], k: number[] = [];
  for (let i = 0; i < count; i++) {
    if (t === null) at.splice(0, 3, 0, 0, 0); else t.getElement(i, at);
    if (r === null) q.splice(0, 4, 0, 0, 0, 1); else r.getElement(i, q);
    if (s === null) k.splice(0, 3, 1, 1, 1); else s.getElement(i, k);
    const [x, y, z, w] = [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1];
    const v = [0, 1, 2].map(axis => (k[axis] ?? 1) * (centre[axis] ?? 0));
    const [vx, vy, vz] = [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
    // v + 2 q.xyz x (q.xyz x v + w v)
    const cx = y * vz - z * vy + w * vx, cy = z * vx - x * vz + w * vy, cz = x * vy - y * vx + w * vz;
    const rotated = [vx + 2 * (y * cz - z * cy), vy + 2 * (z * cx - x * cz), vz + 2 * (x * cy - y * cx)];
    for (let axis = 0; axis < 3; axis++) {
      translation[i * 3 + axis] = (at[axis] ?? 0) + (rotated[axis] ?? 0);
      scale[i * 3 + axis] = (k[axis] ?? 1) * half;
    }
  }
  const buffer = doc.getRoot().listBuffers()[0] ?? null;
  for (const [name, array, previous] of [['TRANSLATION', translation, t], ['SCALE', scale, s]] as const) {
    instances.setAttribute(name, doc.createAccessor().setType('VEC3').setArray(array).setBuffer(buffer));
    if (previous !== null && previous.listParents().length <= 1) previous.dispose();
  }
  return true;
}
