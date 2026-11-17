import { parseGlbData, prepareGlbCost } from '@wildshard/format/glbCost';
import { glbBuffers } from '@wildshard/format/glbBuffers';
import { parseKtx2 } from '@wildshard/format/ktx2Cost';
import { parseStillImage } from '@wildshard/format/stillImage';

/** An owned colour image; the caller supplies its original encoding recipe without file/process imports here. */
export interface GlbBasisImage { readonly index: number; readonly bytes: Uint8Array; readonly width: number; readonly height: number }
/** Encode one source image into a complete Basis LDR KTX2 mip chain with identical dimensions. */
export type GlbBasisEncoder = (image: GlbBasisImage) => Uint8Array | Promise<Uint8Array>;
const MAX = 25_000_000, MESHOPT = 'EXT_meshopt_compression', WEBP = 'EXT_texture_webp', BASIS = 'KHR_texture_basisu';
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GLB variant object required');
  return value as Record<string, unknown>;
};
const rows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) throw new Error('GLB variant rows required');
  return value.map(object);
};
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX) throw new Error('GLB variant range required');
  return value;
};

/** Producer-only byte rewrite: preserve every decoded geometry/skin/clip view and all non-storage JSON.
 * Replace embedded WebP with injected Basis KTX2, removing meshopt storage for the original raw variant form.
 * Both complete GLBs cross normal admission; there is no public-artifact, file, encoder or compiler fallback. */
export async function basisGlbVariant(source: Uint8Array, encode: GlbBasisEncoder): Promise<Uint8Array> {
  if (!(source instanceof Uint8Array) || source.byteLength > MAX) throw new Error('GLB variant source cap');
  const input = new Uint8Array(source);
  await prepareGlbCost(); parseGlbData(input);
  const header = new DataView(input.buffer, input.byteOffset, input.byteLength), jsonLength = header.getUint32(12, true);
  const doc = object(JSON.parse(new TextDecoder().decode(input.subarray(20, 20 + jsonLength))));
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    const extensions = doc[key] ?? [];
    if (!Array.isArray(extensions) || extensions.some(value => value !== MESHOPT && value !== WEBP)) throw new Error('Unsupported GLB variant extension');
  }
  const images = rows(doc['images'] ?? []), textures = rows(doc['textures'] ?? []);
  if (images.length === 0 || textures.length === 0) throw new Error('GLB variant needs embedded WebP paint');
  const buffers = rows(doc['buffers']), physical = buffers[0];
  if (physical === undefined || buffers.slice(1).some(buffer => Object.keys(buffer).some(key => key !== 'byteLength' && key !== 'extensions'))) throw new Error('Unsupported GLB variant fallback metadata');
  const data = glbBuffers(doc, input.subarray(28 + jsonLength)), accessors = rows(doc['accessors'] ?? []);
  const replacements = new Map<number, Uint8Array>();
  for (const [index, image] of images.entries()) {
    const id = integer(image['bufferView']), view = data.views[id];
    if (image['mimeType'] !== 'image/webp' || view === undefined || replacements.has(id)
      || accessors.some(accessor => accessor['bufferView'] === id)) throw new Error('GLB variant requires independent WebP image views');
    const offset = integer(view['byteOffset'] ?? 0), length = integer(view['byteLength']);
    const bytes = new Uint8Array(data.bytes.subarray(offset, offset + length)), paint = parseStillImage(bytes);
    const encoded = await encode({ index, bytes, width: paint.width, height: paint.height });
    parseKtx2(encoded);
    const ktx = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength), model = ktx.getUint8(ktx.getUint32(48, true) + 12);
    if (ktx.getUint32(12, true) !== 0 || (model !== 163 && model !== 166)
      || ktx.getUint32(20, true) !== paint.width || ktx.getUint32(24, true) !== paint.height
      || ktx.getUint32(40, true) !== Math.floor(Math.log2(Math.max(paint.width, paint.height))) + 1) throw new Error('Basis variant dimensions, encoding or mip chain differ');
    replacements.set(id, new Uint8Array(encoded)); image['mimeType'] = 'image/ktx2';
  }
  let length = 0;
  const chunks = data.views.map((view, index) => {
    const offset = integer(view['byteOffset'] ?? 0), size = integer(view['byteLength']);
    const bytes = replacements.get(index) ?? data.bytes.subarray(offset, offset + size);
    const padded = Math.ceil(bytes.length / 4) * 4;
    length += padded;
    if (length > MAX) throw new Error('GLB variant buffer cap');
    const extensions = view['extensions'] === undefined ? {} : object(view['extensions']);
    if (Object.keys(extensions).some(key => key !== MESHOPT)) throw new Error('Unsupported GLB variant view extension');
    view['buffer'] = 0; view['byteOffset'] = length - padded; view['byteLength'] = bytes.length; delete view['extensions'];
    return bytes;
  });
  physical['byteLength'] = length;
  doc['bufferViews'] = data.views; doc['buffers'] = [physical];
  for (const texture of textures) {
    const binding = object(object(texture['extensions'])[WEBP]);
    texture['extensions'] = { [BASIS]: { source: integer(binding['source']) } };
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) doc[key] = [BASIS];
  const json = new TextEncoder().encode(JSON.stringify(doc)), padded = Math.ceil(json.length / 4) * 4;
  if (json.length > 2_000_000 || 28 + padded + length > MAX) throw new Error('GLB variant wire cap');
  const output = new Uint8Array(28 + padded + length), result = new DataView(output.buffer);
  result.setUint32(0, 0x46546c67, true); result.setUint32(4, 2, true); result.setUint32(8, output.length, true);
  result.setUint32(12, padded, true); result.setUint32(16, 0x4e4f534a, true); output.fill(32, 20, 20 + padded); output.set(json, 20);
  result.setUint32(20 + padded, length, true); result.setUint32(24 + padded, 0x004e4942, true);
  let at = 28 + padded;
  for (const bytes of chunks) { output.set(bytes, at); at += Math.ceil(bytes.length / 4) * 4; }
  parseGlbData(output); return output;
}
