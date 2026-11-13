import { Format, NodeIO, type Accessor, type JSONDocument } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { hashImmutableBytes } from '../immutable';

/** Decode Meshopt into plain accessor buffers and externalize original embedded WebP/PNG/JPEG bytes.
 * This is build-time glTF source, not an admitted product: the caller must declare and admit its texture files.
 * Float32 vertex channels match the original GPU's normalized values; joint indices, skin weights, inverse binds,
 * triangle order, hierarchy, animations, materials and samplers are retained. The no-op normalized flag on
 * Float32 accessors is cleared without touching their values (integer normalization stays meaningful). No image is decoded or re-encoded.
 * Resources have immutable SHA-256 names. Unknown extensions and external input resources refuse rather than vanish. */
export async function normalizeRigSource(glb: Uint8Array): Promise<JSONDocument> {
  // Validate the complete header before either the JSON reader or extension decoder sees the source.
  if (glb.length < 20 || glb.length > 64_000_000) throw new Error('Rig requires bounded GLB bytes');
  const header = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== glb.byteLength) throw new Error('Rig requires complete GLB 2 bytes');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const intake = await io.binaryToJSON(Uint8Array.from(glb)), original = intake.json;
  const supported = new Set(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp']);
  if ([...original.extensionsUsed ?? [], ...original.extensionsRequired ?? []].some(name => !supported.has(name))) throw new Error('Rig normalization requires an explicit extension compiler');
  const checkExtensions = (value: unknown, depth = 0): void => {
    if (depth > 128) throw new Error('Rig normalization exceeds declaration depth');
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'extensions' && typeof child === 'object' && child !== null && Object.keys(child).some(name => !supported.has(name))) throw new Error('Rig normalization requires an explicit extension compiler');
      checkExtensions(child, depth + 1);
    }
  };
  checkExtensions(original);
  if (original.buffers?.some(buffer => buffer.uri !== undefined) || original.images?.some(image => image.uri !== undefined)) throw new Error('Rig normalization requires embedded source resources');
  const document = await io.readJSON(intake), root = document.getRoot();
  if (root.listNodes().length > 4096 || root.listAccessors().length > 10000 || root.listTextures().length > 256) throw new Error('Rig normalization exceeds resource cap');
  let elements = 0;
  for (const accessor of root.listAccessors()) {
    // glTF normalization applies only to integer encodings. Some retained sources mark Float32 weights too;
    // Three treats that flag as a no-op, while bounded admission must see a canonical Float32 declaration.
    if (accessor.getComponentType() === 5126) accessor.setNormalized(false);
    elements += accessor.getCount() * accessor.getElementSize();
    if (elements > 64_000_000) throw new Error('Rig normalization exceeds accessor cap');
  }
  const converted = new Set<Accessor>();
  const convert = (accessor: Accessor): void => {
    if (converted.has(accessor) || accessor.getComponentType() === 5126) return;
    converted.add(accessor);
    const values = new Float32Array(accessor.getCount() * accessor.getElementSize()), row: number[] = [];
    for (let index = 0; index < accessor.getCount(); index++) {
      accessor.getElement(index, row);
      if (row.some(value => !Number.isFinite(value))) throw new Error('Rig normalization requires finite channels');
      values.set(row, index * accessor.getElementSize());
    }
    accessor.setArray(values).setNormalized(false);
  };
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    for (const semantic of primitive.listSemantics()) {
      const accessor = primitive.getAttribute(semantic);
      // Skin weights stay in their original encoding: GLTFLoader normalizes them in-place after loading.
      if (accessor !== null && !/^(?:JOINTS|WEIGHTS)_\d+$/u.test(semantic)) convert(accessor);
    }
    for (const target of primitive.listTargets()) for (const accessor of target.listAttributes()) convert(accessor);
  }
  for (const extension of root.listExtensionsUsed()) if (extension.extensionName === 'EXT_meshopt_compression' || extension.extensionName === 'KHR_mesh_quantization') extension.dispose();
  const buffer = root.listBuffers()[0] ?? document.createBuffer();
  for (const accessor of root.listAccessors()) accessor.setBuffer(buffer);
  for (const other of root.listBuffers()) if (other !== buffer) other.dispose();
  for (const texture of root.listTextures()) {
    const bytes = texture.getImage(), mime = texture.getMimeType(), suffix = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : null;
    if (bytes === null || bytes.length === 0 || bytes.length > 4_000_000 || suffix === null) throw new Error('Rig normalization requires bounded original still-image bytes');
    texture.setURI(`${hashImmutableBytes(bytes)}.${suffix}`);
  }
  const result = await io.writeJSON(document, { format: Format.GLTF });
  for (const row of result.json.buffers ?? []) {
    const uri = row.uri, bytes = uri === undefined ? undefined : result.resources[uri];
    if (uri === undefined || bytes === undefined) throw new Error('Rig normalization lost a buffer');
    const name = `${hashImmutableBytes(bytes)}.bin`; row.uri = name;
    result.resources[name] = Uint8Array.from(bytes); if (name !== uri) delete result.resources[uri];
  }
  for (const [uri, bytes] of Object.entries(result.resources)) result.resources[uri] = Uint8Array.from(bytes);
  return result;
}
