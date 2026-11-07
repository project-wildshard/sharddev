import { Matrix4, Quaternion, Vector3 } from 'three';
import { isJsonData } from '@wildshard/format/json';

interface Intake { matrices: Matrix4[]; parents: (number | undefined)[]; roots: number[] }
const object = (input: unknown): Record<string, unknown> => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('World GLB object required');
  return input as Record<string, unknown>;
};
const list = (input: unknown): unknown[] => {
  if (!Array.isArray(input) || input.length > 10000) throw new Error('World GLB array cap');
  return input;
};
const count = (input: unknown, max: number): number => {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || input > max) throw new Error('World GLB count outside cap');
  return input;
};
function vector(input: unknown, fallback: readonly number[]): number[] {
  const values = input === undefined ? [...fallback] : list(input);
  if (values.length !== fallback.length || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('World GLB finite transform required');
  return values.map(Number);
}

/** Bound self-contained author bytes and hierarchy before glTF-Transform allocates accessor arrays. */
export function preflightWorldGlb(bytes: Uint8Array): Intake {
  if (bytes.length < 28 || bytes.length > 256_000_000) throw new Error('World GLB wire cap or truncated header');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), jsonBytes = header.getUint32(12, true);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.length || header.getUint32(16, true) !== 0x4e4f534a || jsonBytes > 2_000_000 || jsonBytes % 4 !== 0 || jsonBytes + 28 > bytes.length) throw new Error('World GLB header or JSON cap');
  const binBytes = header.getUint32(20 + jsonBytes, true);
  if (header.getUint32(24 + jsonBytes, true) !== 0x004e4942 || binBytes % 4 !== 0 || 28 + jsonBytes + binBytes !== bytes.length) throw new Error('World GLB binary chunk');
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + jsonBytes)));
  if (!isJsonData(input)) throw new Error('World GLB finite bounded JSON required');
  const doc = object(input);
  if (object(doc['asset'])['version'] !== '2.0') throw new Error('World GLB version');
  const pending: unknown[] = [doc];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== 'object' || value === null) continue;
    if (!Array.isArray(value) && Object.hasOwn(value, 'extensions') && Object.keys(object(Reflect.get(value, 'extensions'))).length > 0) throw new Error('World GLB unsupported extension');
    const children: unknown[] = Object.values(value);
    pending.push(...children);
  }
  if (list(doc['extensionsRequired'] ?? []).length > 0 || list(doc['extensionsUsed'] ?? []).length > 0 || list(doc['skins'] ?? []).length > 0 || list(doc['animations'] ?? []).length > 0 || list(doc['cameras'] ?? []).length > 0) throw new Error('World GLB unsupported extension, skin, animation or camera');
  const buffers = list(doc['buffers'] ?? []).map(object);
  if (buffers.length !== 1 || buffers.some((buffer) => buffer['uri'] !== undefined || count(buffer['byteLength'], binBytes) < binBytes - 3)) throw new Error('World GLB needs one embedded buffer');
  const views = list(doc['bufferViews'] ?? []).map(object);
  for (const view of views) if (count(view['buffer'], 0) !== 0 || count(view['byteOffset'] ?? 0, binBytes) + count(view['byteLength'], binBytes) > count(buffers[0]?.['byteLength'], binBytes)) throw new Error('World GLB buffer view outside buffer');
  const accessors = list(doc['accessors'] ?? []);
  let aggregate = 0;
  for (const entry of accessors) {
    const accessor = object(entry), view = views[count(accessor['bufferView'], views.length)];
    const width = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]).get(Number(accessor['componentType']));
    const dimension = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4]]).get(String(accessor['type']));
    const n = count(accessor['count'], 12_000_000);
    if (view === undefined || width === undefined || dimension === undefined || accessor['sparse'] !== undefined) throw new Error('World GLB unsupported accessor');
    const size = width * dimension, stride = count(view['byteStride'] ?? size, 252), offset = count(accessor['byteOffset'] ?? 0, binBytes);
    aggregate += n * dimension;
    if (aggregate > 64_000_000 || stride < size || stride % width !== 0 || offset % width !== 0 || offset + (n === 0 ? 0 : (n - 1) * stride + size) > count(view['byteLength'], binBytes)) throw new Error('World GLB accessor range or aggregate cap');
  }
  const images = list(doc['images'] ?? []);
  for (const entry of images) {
    const image = object(entry);
    if (image['uri'] !== undefined || views[count(image['bufferView'], views.length)] === undefined || !['image/png', 'image/jpeg', 'image/webp'].includes(String(image['mimeType']))) throw new Error('World GLB image must be embedded PNG, JPEG or WebP');
  }
  const meshes = list(doc['meshes'] ?? []);
  const materials = list(doc['materials'] ?? []);
  const textures = list(doc['textures'] ?? []), samplers = list(doc['samplers'] ?? []);
  for (const entry of textures) {
    const texture = object(entry);
    if (images[count(texture['source'], images.length)] === undefined || (texture['sampler'] !== undefined && samplers[count(texture['sampler'], samplers.length)] === undefined)) throw new Error('World GLB texture references missing image or sampler');
  }
  for (const entry of materials) {
    const material = object(entry);
    if (typeof material['name'] !== 'string' || material['name'].length === 0 || material['name'].length > 128) throw new Error('World GLB material needs a bounded explicit name');
    const pbr = object(material['pbrMetallicRoughness'] ?? {});
    for (const value of [pbr['baseColorTexture'], pbr['metallicRoughnessTexture'], material['normalTexture'], material['occlusionTexture'], material['emissiveTexture']]) if (value !== undefined && textures[count(object(value)['index'], textures.length)] === undefined) throw new Error(`World GLB material ${material['name']} references missing texture`);
  }
  for (const mesh of meshes) for (const entry of list(object(mesh)['primitives'])) {
    const primitive = object(entry);
    if ((primitive['mode'] ?? 4) !== 4 || list(primitive['targets'] ?? []).length > 0) throw new Error('World GLB needs static triangles without morph targets');
    for (const index of Object.values(object(primitive['attributes']))) if (accessors[count(index, accessors.length)] === undefined) throw new Error('World GLB missing attribute accessor');
    if (primitive['indices'] !== undefined && accessors[count(primitive['indices'], accessors.length)] === undefined) throw new Error('World GLB missing index accessor');
    if (primitive['material'] === undefined || materials[count(primitive['material'], materials.length)] === undefined) throw new Error('World GLB primitive needs an explicit material');
  }
  const nodes = list(doc['nodes'] ?? []).map(object), parents: (number | undefined)[] = Array.from({ length: nodes.length }), local: Matrix4[] = [];
  nodes.forEach((node, index) => {
    if (node['mesh'] !== undefined && meshes[count(node['mesh'], meshes.length)] === undefined) throw new Error(`World GLB node ${index} references missing mesh`);
    if (node['name'] !== undefined && (typeof node['name'] !== 'string' || node['name'].length > 128)) throw new Error(`World GLB node ${index} name cap`);
    if (node['skin'] !== undefined || node['camera'] !== undefined || node['weights'] !== undefined) throw new Error(`World GLB node ${typeof node['name'] === 'string' ? node['name'] : index} is not static geometry`);
    for (const entry of list(node['children'] ?? [])) {
      const child = count(entry, nodes.length - 1);
      if (parents[child] !== undefined) throw new Error('World GLB node has multiple parents');
      parents[child] = index;
    }
    if (node['matrix'] !== undefined) {
      if (['translation', 'rotation', 'scale'].some((key) => node[key] !== undefined)) throw new Error('World GLB node has matrix and TRS');
      const matrix = vector(node['matrix'], new Matrix4().elements);
      if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) throw new Error('World GLB transform must be affine');
      local.push(new Matrix4().fromArray(matrix));
    } else {
      const translation = vector(node['translation'], [0, 0, 0]), rotation = vector(node['rotation'], [0, 0, 0, 1]), scale = vector(node['scale'], [1, 1, 1]);
      if (Math.abs(rotation.reduce((sum, value) => sum + value * value, 0) - 1) > 1e-5) throw new Error('World GLB unit quaternion required');
      local.push(new Matrix4().compose(new Vector3().fromArray(translation), new Quaternion().fromArray(rotation), new Vector3().fromArray(scale)));
    }
  });
  const scenes = list(doc['scenes'] ?? []).map(object);
  if (scenes.length !== 1 || (doc['scene'] ?? 0) !== 0) throw new Error('World GLB requires exactly one scene');
  const roots = list(scenes[0]?.['nodes'] ?? []).map((entry) => count(entry, nodes.length - 1));
  if (new Set(roots).size !== roots.length || roots.some((root) => parents[root] !== undefined)) throw new Error('World GLB scene root hierarchy');
  const matrices: Matrix4[] = [];
  nodes.forEach((_node, index) => {
    const chain: number[] = []; let at: number | undefined = index;
    while (at !== undefined) {
      if (chain.includes(at) || chain.length >= 64) throw new Error('World GLB node cycle or hierarchy depth');
      chain.push(at); at = parents[at];
    }
    if (!roots.includes(chain.at(-1) ?? -1)) throw new Error('World GLB node outside scene');
    const matrix = new Matrix4();
    for (const id of chain.reverse()) { const transform = local[id]; if (transform === undefined) throw new Error('World GLB missing transform'); matrix.multiply(transform); }
    if (!matrix.elements.every(Number.isFinite) || !Number.isFinite(matrix.determinant()) || matrix.determinant() === 0) throw new Error(`World GLB node ${index} has singular transform`);
    matrices.push(matrix);
  });
  return { matrices, parents, roots };
}
