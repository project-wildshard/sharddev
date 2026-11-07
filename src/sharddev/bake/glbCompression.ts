import { VertexLayout, WebIO, type Accessor } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { parseGlb, prepareAssetDecoders } from '@wildshard/format/product';

await MeshoptEncoder.ready;
await prepareAssetDecoders();
const EXT = 'EXT_meshopt_compression';
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GLB compression object required');
  return value as Record<string, unknown>;
};
const rows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) throw new Error('GLB compression array required');
  return value.map(object);
};
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('GLB compression count required');
  return value;
};

/** Lossless buffer-view encoding, without quantization, welding, index reordering or scene/material edits.
 * The ordinary meshopt-capable runtime decodes the exact original channels, including application accessors. */
export function compressGlb(input: Uint8Array): Uint8Array {
  parseGlb(input);
  const header = new DataView(input.buffer, input.byteOffset, input.byteLength), jsonLength = header.getUint32(12, true);
  const doc = object(JSON.parse(new TextDecoder().decode(input.subarray(20, 20 + jsonLength))));
  if (Array.isArray(doc['extensionsUsed']) && doc['extensionsUsed'].includes(EXT)) return Uint8Array.from(input);
  const source = input.subarray(28 + jsonLength), views = rows(doc['bufferViews'] ?? []), accessors = rows(doc['accessors'] ?? []);
  const chunks: Uint8Array[] = [];
  let physical = 0, fallback = 0;
  const append = (bytes: Uint8Array): number => {
    const offset = physical, padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes); chunks.push(padded); physical += padded.length; return offset;
  };
  const packedViews = views.map((view, index) => {
    const output = view;
    const length = integer(view['byteLength']), offset = integer(view['byteOffset'] ?? 0), bytes = source.subarray(offset, offset + length);
    const accessor = accessors.find(row => row['bufferView'] === index && (row['byteOffset'] ?? 0) === 0);
    const count = accessor === undefined ? 0 : integer(accessor['count']);
    const indices = accessor?.['type'] === 'SCALAR' && (accessor['componentType'] === 5123 || accessor['componentType'] === 5125);
    const inferred = count === 0 ? 0 : length / count;
    const size = view['byteStride'] === undefined ? inferred : integer(view['byteStride']);
    const mode = indices ? 'INDICES' : 'ATTRIBUTES';
    if (size === 0 || !Number.isInteger(size) || length % size !== 0 || size > 256
      || (indices ? size !== 2 && size !== 4 : size % 4 !== 0)) { output['byteOffset'] = append(bytes); return output; }
    const packed = MeshoptEncoder.encodeGltfBuffer(bytes, length / size, size, mode), target = fallback;
    fallback += Math.ceil(length / 4) * 4;
    output['buffer'] = 1; output['byteOffset'] = target;
    output['extensions'] = { ...(view['extensions'] === undefined ? {} : object(view['extensions'])),
      [EXT]: { buffer: 0, byteOffset: append(packed), byteLength: packed.length, byteStride: size, count: length / size, mode } };
    return output;
  });
  if (fallback === 0) return Uint8Array.from(input);
  doc['bufferViews'] = packedViews;
  doc['buffers'] = [{ byteLength: physical }, { byteLength: fallback, extensions: { [EXT]: { fallback: true } } }];
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    const existing = doc[key];
    const entries: unknown[] = existing === undefined ? [] : Array.isArray(existing) ? existing : (() => { throw new Error('GLB extension list required'); })();
    doc[key] = [...entries, EXT];
  }
  const json = new TextEncoder().encode(JSON.stringify(doc)), paddedJson = Math.ceil(json.length / 4) * 4;
  const output = new Uint8Array(28 + paddedJson + physical), result = new DataView(output.buffer);
  result.setUint32(0, 0x46546c67, true); result.setUint32(4, 2, true); result.setUint32(8, output.length, true);
  result.setUint32(12, paddedJson, true); result.setUint32(16, 0x4e4f534a, true);
  output.fill(32, 20, 20 + paddedJson); output.set(json, 20);
  result.setUint32(20 + paddedJson, physical, true); result.setUint32(24 + paddedJson, 0x004e4942, true);
  let offset = 28 + paddedJson;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  parseGlb(output);
  return output;
}

/** Re-encode authored channels with the native separate-layout meshopt writer.
 * No reorder, quantization transform or filter is applied. Deduplication is explicit. */
export async function meshoptGlb(input: Uint8Array, options: { readonly deduplicate?: boolean } = {}): Promise<Uint8Array> {
  const bytes = Uint8Array.from(input), deduplicate = options.deduplicate === true;
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new WebIO().setVertexLayout(VertexLayout.SEPARATE).registerExtensions([EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const document = await io.readBinary(bytes);
  if (deduplicate) await document.transform(dedup());
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return io.writeBinary(document);
}

function sameNumbers(a: ArrayLike<number> | null, b: ArrayLike<number> | null): boolean {
  if (a === null || b === null || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (!Object.is(a[index], b[index])) return false;
  return true;
}
const sameAccessor = (a: Accessor | null, b: Accessor | null): boolean => a !== null && b !== null
  && a.getType() === b.getType() && a.getNormalized() === b.getNormalized() && a.getComponentType() === b.getComponentType()
  && sameNumbers(a.getArray(), b.getArray());

/** Pack alternate vertex channels beside an identical static mesh, without
 * requantizing its frame, positions, indices or existing channels. Both inputs
 * require one unskinned mesh in the same frame and material; only explicitly
 * selected channels may differ. New application accessors keep the source's
 * exact component storage and normalization. Inputs remain independently owned.
 */
export async function pairedChannelGlb(primary: Uint8Array, alternate: Uint8Array, name: string,
  channels: readonly { readonly from: string; readonly to: string }[]): Promise<Uint8Array> {
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/u.test(name) || channels.length === 0 || channels.length > 8
    || new Set(channels.map(row => row.from)).size !== channels.length || new Set(channels.map(row => row.to)).size !== channels.length
    || channels.some(row => !/^[A-Z_][A-Z0-9_]*$/u.test(row.from) || !/^_[A-Z0-9_]+$/u.test(row.to) || row.from === 'POSITION')) throw new Error('Invalid paired GLB channels');
  parseGlb(primary); parseGlb(alternate); await MeshoptDecoder.ready;
  const io = new WebIO().setVertexLayout(VertexLayout.SEPARATE).registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const left = await io.readBinary(Uint8Array.from(primary)), right = await io.readBinary(Uint8Array.from(alternate));
  const a = left.getRoot(), b = right.getRoot(), node = a.listNodes()[0], otherNode = b.listNodes()[0], mesh = a.listMeshes()[0], otherMesh = b.listMeshes()[0];
  if (node === undefined || otherNode === undefined || mesh === undefined || otherMesh === undefined
    || a.listNodes().length !== 1 || b.listNodes().length !== 1 || a.listMeshes().length !== 1 || b.listMeshes().length !== 1
    || a.listAnimations().length > 0 || b.listAnimations().length > 0 || a.listSkins().length > 0 || b.listSkins().length > 0
    || a.listTextures().length > 0 || b.listTextures().length > 0 || node.getMesh() !== mesh || otherNode.getMesh() !== otherMesh
    || !sameNumbers(node.getMatrix(), otherNode.getMatrix())) throw new Error('Paired GLB requires identical static frames');
  const part = mesh.listPrimitives()[0], other = otherMesh.listPrimitives()[0];
  const semantics = part?.listSemantics().sort(), otherSemantics = other?.listSemantics().sort();
  if (part === undefined || other === undefined || mesh.listPrimitives().length !== 1 || otherMesh.listPrimitives().length !== 1
    || part.listTargets().length > 0 || other.listTargets().length > 0 || part.getMode() !== other.getMode()
    || semantics === undefined || otherSemantics === undefined || semantics.length !== otherSemantics.length
    || semantics.some((semantic, index) => semantic !== otherSemantics[index])
    || !sameAccessor(part.getAttribute('POSITION'), other.getAttribute('POSITION'))
    || (part.getIndices() !== null || other.getIndices() !== null) && !sameAccessor(part.getIndices(), other.getIndices())) throw new Error('Paired GLB topology differs');
  const material = part.getMaterial(), otherMaterial = other.getMaterial();
  if (material === null ? otherMaterial !== null : otherMaterial === null || !material.equals(otherMaterial)) throw new Error('Paired GLB material differs');
  const selected = new Set(channels.map(row => row.from));
  for (const semantic of part.listSemantics()) if (!selected.has(semantic) && !sameAccessor(part.getAttribute(semantic), other.getAttribute(semantic))) throw new Error(`Paired GLB channel differs: ${semantic}`);
  const buffer = part.getAttribute('POSITION')?.getBuffer();
  if (buffer === undefined || buffer === null) throw new Error('Missing paired GLB buffer');
  for (const { from, to } of channels) {
    const source = other.getAttribute(from), values = source?.getArray();
    if (source === null || source === undefined || values === null || values === undefined || part.getAttribute(to) !== null) throw new Error('Missing or duplicate paired GLB channel');
    part.setAttribute(to, left.createAccessor(to).setType(source.getType()).setNormalized(source.getNormalized()).setArray(values.slice()).setBuffer(buffer));
  }
  node.setName(name); mesh.setName(name);
  // Decode the old transport once, then use the existing lossless view codec.
  // No second grid quantization or meshopt attribute filter enters the table.
  for (const extension of a.listExtensionsUsed()) if (extension.extensionName === EXT) extension.dispose();
  return compressGlb(await io.writeBinary(left));
}
