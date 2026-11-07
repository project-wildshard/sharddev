import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as v from 'valibot';
import { isJsonData } from '@wildshard/format/json';
import { parseGlb } from '@wildshard/format/product';

const MAX_BYTES = 25_000_000;
const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const sourceSchema = v.looseObject({ asset: v.looseObject({ version: v.literal('2.0') }),
  buffers: v.exactOptional(v.array(v.looseObject({ byteLength: count, uri: v.exactOptional(v.string()) }))),
  images: v.exactOptional(v.array(v.looseObject({ uri: v.exactOptional(v.string()), mimeType: v.exactOptional(v.string()), bufferView: v.exactOptional(count) }))),
  extensionsUsed: v.exactOptional(v.array(v.string())), extensionsRequired: v.exactOptional(v.array(v.string())) });

/** Compile textual glTF and its bounded resources to one self-contained GLB. The injected reader owns path admission;
 * NodeIO never reads a URL or filesystem path. Meshes, skin, animation and original image bytes use the existing
 * SDK bake dependencies; unsupported extensions refuse instead of disappearing during conversion. */
export async function compileGltfSource(bytes: Uint8Array, read: (uri: string) => Uint8Array): Promise<Uint8Array> {
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error('glTF source exceeds its byte cap');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!isJsonData(value)) throw new Error('glTF source must be plain JSON');
  const source = v.parse(sourceSchema, value), supported = new Set(ALL_EXTENSIONS.map(extension => extension.EXTENSION_NAME));
  const checkExtensions = (input: unknown): void => {
    if (typeof input !== 'object' || input === null) return;
    for (const [key, member] of Object.entries(input)) {
      const child: unknown = member;
      if (key === 'extensions' && typeof child === 'object' && child !== null && Object.keys(child).some(name => !supported.has(name))) throw new Error('glTF source requires an unsupported extension');
      checkExtensions(child);
    }
  };
  if ([...source.extensionsUsed ?? [], ...source.extensionsRequired ?? []].some(name => !supported.has(name))) throw new Error('glTF source requires an unsupported extension');
  checkExtensions(source);
  const resources = new Map<string, Uint8Array<ArrayBuffer>>(), sizes = new Map<string, number>();
  let total = bytes.length;
  for (const row of [...source.buffers ?? [], ...source.images ?? []]) {
    if (row.uri === undefined || sizes.has(row.uri)) continue;
    if (row.uri.startsWith('data:')) {
      if (!/^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp|ktx2));base64,[A-Za-z0-9+/]*={0,2}$/u.test(row.uri)) throw new Error('glTF embedded resource must be bounded base64');
      const data = row.uri.slice(row.uri.indexOf(',') + 1);
      if (data.length % 4 !== 0) throw new Error('glTF embedded resource has incomplete base64');
      const size = data.length * 3 / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      total += size; sizes.set(row.uri, size);
    } else {
      const resource = Uint8Array.from(read(row.uri));
      total += resource.length; resources.set(row.uri, resource); sizes.set(row.uri, resource.length);
    }
    if (total > MAX_BYTES * 2) throw new Error('glTF resources exceed their combined byte cap');
  }
  if (source.buffers?.some(buffer => buffer.uri === undefined || sizes.get(buffer.uri) !== buffer.byteLength) === true) throw new Error('glTF buffer differs from its declared byte length');
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const document = await io.readJSON({ json: source, resources: Object.fromEntries(resources) }), root = document.getRoot();
  const buffer = root.listBuffers()[0] ?? document.createBuffer();
  for (const accessor of root.listAccessors()) accessor.setBuffer(buffer);
  for (const other of root.listBuffers()) if (other !== buffer) other.dispose();
  const result = await io.writeBinary(document);
  parseGlb(result);
  return result;
}
