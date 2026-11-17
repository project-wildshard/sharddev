import { Float32BufferAttribute, InterpolateDiscrete, InterpolateLinear, Matrix4, PropertyBinding, Uint16BufferAttribute, type AnimationClip, type BufferAttribute, type BufferGeometry, type Material, type MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import type { RiggedHullBook, RiggedHullUrls } from '@wildshard/format/riggedHulls';

/** Complete authored rigged-hull family and tier resources, admitted by the product's defining grammar. */
export type AuthorRiggedHullBook = RiggedHullBook;
/** Ordered authored geometry, coat and attachment references without a live hull or material owner. */
export type AuthorRiggedHullUrls = RiggedHullUrls;

/**
 * Build-time only (SHARD-PLATFORM M3, the offline skinned-model bake): a shard's generator reads a source GLB offline
 * (`readSourceModel`), runs its own processing on it (fit, retarget, merge, strip, recolour, re-skin: a generator function in
 * the shard's folder), and writes the result as a standard skinned glTF (`skinnedGlb`): a joint hierarchy with inverse
 * bind matrices, `JOINTS_0` / `WEIGHTS_0`, the animations as glTF channels and the shard's own JSON beside it. The client
 * only loads it (`@wildshard/engine/game/plugin/geometry` skinnedModel / creatureBodies), bit-exact: every float32 channel, the joint bind positions as JSON
 * doubles, the weights as written (never renormalized) and an authored triangle soup restored. Every accessor rides
 * EXT_meshopt_compression (lossless: the vertex and index-sequence codecs return the exact bytes), about half the floats.
 *
 * A part's base-colour map rides inside the GLB as the source's exact image bytes (never re-encoded), so the client decodes
 * it as it decoded the source, and the engine's KTX2 bake (`scripts/bake-ktx2.mjs`, geometry bytes untouched) makes its GPU
 * stand-in exactly as it did for the source. (A shardfile asset declares its textures separately: `parseGlb` refuses
 * embedded images, so a textured skinned bake is for a trusted runtime's own loads.)
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
/** A source GLB's base-colour image as its exact bytes (never decoded offline) and its glTF sampler. */
export interface RawTexture {
  readonly image: Uint8Array; readonly mimeType: string;
  readonly sampler: { readonly magFilter?: number; readonly minFilter?: number; readonly wrapS?: number; readonly wrapT?: number };
}
/** A source model read offline: three's own GLTFLoader scene (the identical intake the runtime used), textures as bytes. */
export interface SourceModel {
  readonly gltf: GLTF;
  /** The base-colour texture a loaded material had in the file, or null. */
  texture: (material: Material) => RawTexture | null;
}

const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(isRecord) : [];
const integer = (value: unknown): number | undefined => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

/** Split a GLB into its JSON document and binary chunk. */
function splitGlb(bytes: Uint8Array): { doc: Record<string, unknown>; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 2) throw new Error('Source model is not a GLB 2.0');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + length > bytes.length) throw new Error('Source GLB has no JSON chunk');
  const doc: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (!isRecord(doc)) throw new Error('Source GLB JSON is not an object');
  let bin: Uint8Array = new Uint8Array(0);
  if (20 + length + 8 <= bytes.length && view.getUint32(24 + length, true) === BIN_CHUNK) bin = bytes.subarray(28 + length, 28 + length + view.getUint32(20 + length, true));
  return { doc, bin };
}
/** Assemble a GLB from a JSON document and a binary chunk. */
function joinGlb(doc: unknown, bin: Uint8Array): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify(doc)), length = Math.ceil(raw.length / 4) * 4, binLength = Math.ceil(bin.length / 4) * 4;
  const bytes = new Uint8Array(20 + length + (bin.length > 0 ? 8 + binLength : 0)), view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, length, true); view.setUint32(16, JSON_CHUNK, true); bytes.fill(32, 20, 20 + length); bytes.set(raw, 20);
  if (bin.length > 0) { view.setUint32(20 + length, binLength, true); view.setUint32(24 + length, BIN_CHUNK, true); bytes.set(bin, 28 + length); }
  return bytes;
}
const TEXTURE_EXTENSIONS = ['EXT_texture_webp', 'KHR_texture_basisu', 'EXT_texture_avif'];

/**
 * Read a source GLB offline through three's GLTFLoader and the meshopt decoder, the same intake as the engine's
 * `loadRigFile`, so the shard's own intake code sees identical attributes. Textures are not decoded (Node has no image
 * decoder): each material's base-colour image comes back as its bytes through `texture(material)`.
 */
export async function readSourceModel(bytes: Uint8Array): Promise<SourceModel> {
  const { doc, bin } = splitGlb(bytes), images = records(doc['images']), textures = records(doc['textures']), samplers = records(doc['samplers']);
  const views = records(doc['bufferViews']);
  const rawTexture = (index: number | undefined): RawTexture | null => {
    const texture = index === undefined ? undefined : textures[index];
    if (texture === undefined) return null;
    const extensions = isRecord(texture['extensions']) ? texture['extensions'] : {};
    let source = integer(texture['source']);
    for (const name of TEXTURE_EXTENSIONS) { const ext = extensions[name]; if (isRecord(ext) && integer(ext['source']) !== undefined) source = integer(ext['source']); }
    const image = source === undefined ? undefined : images[source], view = image === undefined ? undefined : views[integer(image['bufferView']) ?? -1];
    if (image === undefined || view === undefined || typeof image['mimeType'] !== 'string') throw new Error('Source texture must be an embedded image');
    const offset = integer(view['byteOffset']) ?? 0, length = integer(view['byteLength']) ?? 0, sampler = samplers[integer(texture['sampler']) ?? -1] ?? {};
    const pick = (key: string): Record<string, number> => { const value = integer(sampler[key]); return value === undefined ? {} : { [key]: value }; };
    return { image: bin.slice(offset, offset + length), mimeType: image['mimeType'], sampler: { ...pick('magFilter'), ...pick('minFilter'), ...pick('wrapS'), ...pick('wrapT') } };
  };
  const materials = records(doc['materials']);
  const baseColor = materials.map((material) => {
    const pbr = isRecord(material['pbrMetallicRoughness']) ? material['pbrMetallicRoughness'] : {}, info = pbr['baseColorTexture'];
    return rawTexture(isRecord(info) ? integer(info['index']) : undefined);
  });
  // The loader never sees a texture: every texture reference goes (the images stay as unused bytes in the binary chunk).
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([key, entry]) => !(key.endsWith('Texture') && isRecord(entry))).map(([key, entry]) => [key, strip(entry)]));
  };
  const stripped: Record<string, unknown> = { ...doc, materials: materials.map(strip) };
  for (const key of ['textures', 'images', 'samplers']) Reflect.deleteProperty(stripped, key);
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    const list = doc[key];
    if (Array.isArray(list)) stripped[key] = list.filter((name: unknown) => typeof name !== 'string' || !TEXTURE_EXTENSIONS.includes(name));
  }
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
  const input = joinGlb(stripped, bin);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(Uint8Array.from(input).buffer, '');
  return {
    gltf,
    texture: (material) => {
      const index = gltf.parser.associations.get(material)?.materials;
      return index === undefined ? null : baseColor[index] ?? null;
    },
  };
}

/** A joint: its name, its parent's name (null for a root) and its bind position in the model's space (BoneDef's shape). */
export interface SkinnedBone { readonly name: string; readonly parent: string | null; readonly pos: readonly [number, number, number] }
/** A skinned part: a geometry with `skinIndex` / `skinWeight` over the bake's bones, its material and its map. */
export interface SkinnedPart {
  /** Packed attributes, every channel written as baked (float32 but for `skinIndex`; non-glTF channels as `_NAME`). */
  readonly geometry: BufferGeometry;
  /** Its colour, opacity, metalness, roughness and side become the part's glTF material. */
  readonly material: MeshStandardMaterial;
  /** The base-colour map: the source's exact image bytes and sampler. */
  readonly texture?: RawTexture;
  /** The part's mesh and node name (default `<bake name>.<part index>`). */
  readonly name?: string;
}
/**
 * One skinned model to bake (`skinnedGlb`): its skeleton, its parts skinned over it, its clips and the shard's extras. The
 * runtime reads the GLB back bit-exact with the game's `skinnedModel` (`@wildshard/engine/game/plugin/geometry`), a creature body
 * with `creatureBodies`.
 */
export interface SkinnedBake {
  /** The model's name: an unnamed part's mesh and node are named `<name>.<part index>`. */
  readonly name: string;
  /** The skeleton, uniquely named, each parent before its children: every part's `skinIndex` indexes this list. */
  readonly bones: readonly SkinnedBone[];
  /** The skinned meshes, each its own mesh and node over the one skin. */
  readonly parts: readonly SkinnedPart[];
  /** Bone animations (`<bone>.position|quaternion|scale` tracks, linear or step). */
  readonly clips?: readonly AnimationClip[];
  /** The shard's own JSON beside the model (dims, look numbers), read back as `extras`. */
  readonly extras?: Json;
}
/** The bake's output: the GLB. */
export interface SkinnedOutput { readonly glb: Uint8Array }

const SEMANTICS: Readonly<Record<string, string>> = { position: 'POSITION', normal: 'NORMAL', tangent: 'TANGENT', uv: 'TEXCOORD_0', uv1: 'TEXCOORD_1', color: 'COLOR_0', skinIndex: 'JOINTS_0', skinWeight: 'WEIGHTS_0' };
type Typed = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int16Array | Int8Array;
const COMPONENT = (array: unknown): number => array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125 : array instanceof Uint16Array ? 5123
  : array instanceof Uint8Array ? 5121 : array instanceof Int16Array ? 5122 : array instanceof Int8Array ? 5120 : 0;
const TYPES = ['', 'SCALAR', 'VEC2', 'VEC3', 'VEC4'];
const MESHOPT = 'EXT_meshopt_compression';
await MeshoptEncoder.ready;
const BOUNDED = new Set(['POSITION']);

/** One vertex's bytes across every channel: equal keys are bit-identical vertices. */
function weld(attributes: readonly (readonly [string, BufferAttribute])[], count: number): { index: number[]; first: number[] } {
  const seen = new Map<string, number>(), index: number[] = [], first: number[] = [];
  const bytes = attributes.map(([, a]) => { const array = a.array as Typed; return { u8: new Uint8Array(array.buffer, array.byteOffset, array.byteLength), size: array.BYTES_PER_ELEMENT * a.itemSize }; });
  for (let v = 0; v < count; v++) {
    let key = '';
    for (const { u8, size } of bytes) for (let b = v * size; b < v * size + size; b++) key += String.fromCodePoint(u8[b] ?? 0);
    let at = seen.get(key);
    if (at === undefined) { at = first.length; seen.set(key, at); first.push(v); }
    index.push(at);
  }
  return { index, first };
}

/**
 * Write a deterministic skinned GLB. A non-indexed part is welded losslessly (bit-identical vertices shared, the soup
 * restored by the loader); weights are written as given; a map's image bytes are embedded unchanged.
 */
export function skinnedGlb(bake: SkinnedBake): SkinnedOutput {
  const chunks: Uint8Array[] = [], views: Json[] = [], accessors: Json[] = [];
  let offset = 0;
  const view = (bytes: Uint8Array): number => {
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4); padded.set(bytes);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }); chunks.push(padded); offset += padded.length; return views.length - 1;
  };
  // a lossless meshopt view: its bytes on the data-less fallback buffer 1, their encoding in buffer 0
  let fallback = 0;
  const packed = (bytes: Uint8Array, count: number, stride: number, mode: 'ATTRIBUTES' | 'INDICES'): number => {
    const encoded = MeshoptEncoder.encodeGltfBuffer(bytes, count, stride, mode), padded = new Uint8Array(Math.ceil(encoded.length / 4) * 4); padded.set(encoded);
    views.push({ buffer: 1, byteOffset: fallback, byteLength: bytes.length, extensions: { [MESHOPT]: { buffer: 0, byteOffset: offset, byteLength: encoded.length, byteStride: stride, count, mode } } });
    chunks.push(padded); offset += padded.length; fallback += Math.ceil(bytes.length / 4) * 4; return views.length - 1;
  };
  const accessor = (array: Typed, width: number, normalized: boolean, bounds: boolean, mode: 'ATTRIBUTES' | 'INDICES' = 'ATTRIBUTES'): number => {
    const component = COMPONENT(array), count = array.length / width, stride = array.BYTES_PER_ELEMENT * width;
    if (component === 0 || !Number.isInteger(count) || count === 0) throw new Error('Invalid skinned GLB channel');
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const lossless = mode === 'INDICES' ? stride === 2 || stride === 4 : stride % 4 === 0 && stride <= 256;
    const a: Record<string, Json> = { bufferView: lossless ? packed(bytes, count, stride, mode) : view(bytes), componentType: component, count, type: width === 16 ? 'MAT4' : TYPES[width] ?? 'SCALAR' };
    if (normalized) a['normalized'] = true;
    if (bounds) {
      const min = Array.from({ length: width }, () => Infinity), max = Array.from({ length: width }, () => -Infinity);
      array.forEach((value, i) => { const c = i % width; min[c] = Math.min(min[c] ?? Infinity, value); max[c] = Math.max(max[c] ?? -Infinity, value); });
      a['min'] = min; a['max'] = max;
    }
    accessors.push(a); return accessors.length - 1;
  };
  const { bones } = bake, names = new Map(bones.map((bone, i) => [bone.name, i]));
  if (bones.length === 0 || names.size !== bones.length) throw new Error('Skinned bake needs uniquely named bones');
  bones.forEach((bone, i) => {
    const parent = bone.parent === null ? -1 : names.get(bone.parent) ?? Infinity;
    if (parent >= i || bone.pos.some((n) => !Number.isFinite(n))) throw new Error(`Skinned bone ${bone.name}: its parent must come before it`);
  });
  // the joints: nodes after the parts' mesh nodes, each at its offset from its parent, its exact bind position in extras
  const partNodes = bake.parts.length, joint = (i: number): number => partNodes + i, nodes: Json[] = [];
  const meshes: Json[] = [], materials: Json[] = [], images: Json[] = [], textures: Json[] = [], samplers: Json[] = [], imageOf = new Map<RawTexture, number>();
  const used = new Set<string>();
  bake.parts.forEach((part, p) => {
    const { geometry, material, texture } = part, position = geometry.getAttribute('position');
    if (!geometry.hasAttribute('position') || !geometry.hasAttribute('skinIndex') || !geometry.hasAttribute('skinWeight')) throw new Error('A skinned part needs position, skinIndex and skinWeight');
    const channels = Object.keys(geometry.attributes).sort().map((name) => {
      const a = geometry.getAttribute(name);
      if (!('isBufferAttribute' in a) || a.count !== position.count || a.array.length !== a.count * a.itemSize) throw new Error(`Skinned part channel ${name} must be a packed attribute`);
      return [name, a] as const;
    });
    const skin = geometry.getAttribute('skinIndex');
    if (!(skin.array instanceof Uint16Array || skin.array instanceof Uint8Array) || skin.itemSize !== 4 || Array.from(skin.array).some((j) => j >= bones.length)) throw new Error('skinIndex must be 4 unsigned joints within the bones');
    const weights = geometry.getAttribute('skinWeight');
    if (!(weights.array instanceof Float32Array) || weights.itemSize !== 4) throw new Error('skinWeight must be 4 float32 weights');
    const source = geometry.getIndex(), soup = source === null, welded = soup ? weld(channels, position.count) : null;
    const attributes: Record<string, Json> = {}, renamed: Record<string, Json> = {};
    for (const [name, a] of channels) {
      let semantic = SEMANTICS[name];
      if (semantic === undefined) { semantic = `_${name.replaceAll(/[^A-Za-z0-9]/g, '_').toUpperCase()}`; renamed[semantic] = name; }
      if (semantic !== 'JOINTS_0' && !semantic.startsWith('_') && !(a.array instanceof Float32Array)) throw new Error(`Skinned part channel ${name} must be float32`);
      const array = a.array as Typed, width = a.itemSize;
      const out = welded === null ? array : (() => {
        const copy = new (array.constructor as new (n: number) => Typed)(welded.first.length * width);
        welded.first.forEach((v, i) => { for (let c = 0; c < width; c++) copy[i * width + c] = array[v * width + c] ?? 0; });
        return copy;
      })();
      attributes[semantic] = accessor(out, width, a.normalized, BOUNDED.has(semantic));
    }
    const indexValues = welded?.index ?? Array.from(source?.array ?? []), vertices = welded?.first.length ?? position.count;
    const indices = vertices > 65535 ? Uint32Array.from(indexValues) : Uint16Array.from(indexValues);
    const extras: Record<string, Json> = {};
    if (soup) extras['soup'] = true;
    if (Object.keys(renamed).length > 0) extras['attributes'] = renamed;
    const primitive: Record<string, Json> = { attributes, indices: accessor(indices, 1, false, false, 'INDICES'), material: materials.length };
    if (Object.keys(extras).length > 0) primitive['extras'] = { wildshard: extras };
    const pbr: Record<string, Json> = { baseColorFactor: [...material.color, material.opacity], metallicFactor: material.metalness, roughnessFactor: material.roughness };
    if (texture !== undefined) {
      if (!['image/webp', 'image/png', 'image/jpeg'].includes(texture.mimeType) || texture.image.length === 0) throw new Error(`Skinned texture must be a WebP, PNG or JPEG image (${texture.mimeType})`);
      let index = imageOf.get(texture);
      if (index === undefined) {
        images.push({ bufferView: view(texture.image), mimeType: texture.mimeType });
        samplers.push({ ...texture.sampler });
        const image = images.length - 1, ext = texture.mimeType === 'image/webp' ? 'EXT_texture_webp' : null;
        if (ext !== null) used.add(ext);
        textures.push(ext === null ? { sampler: samplers.length - 1, source: image } : { sampler: samplers.length - 1, extensions: { [ext]: { source: image } } });
        index = textures.length - 1; imageOf.set(texture, index);
      }
      pbr['baseColorTexture'] = { index };
    }
    materials.push({ name: material.name, pbrMetallicRoughness: pbr, doubleSided: material.side === 2 });
    meshes.push({ name: part.name ?? `${bake.name}.${String(p)}`, primitives: [primitive] });
    nodes.push({ name: part.name ?? `${bake.name}.${String(p)}`, mesh: p, skin: 0 });
  });
  bones.forEach((bone) => {
    const parent = bone.parent === null ? undefined : bones[names.get(bone.parent) ?? -1];
    const children = bones.flatMap((child, c) => child.parent === bone.name ? [joint(c)] : []);
    const node: Record<string, Json> = { name: bone.name, translation: bone.pos.map((n, c) => n - (parent?.pos[c] ?? 0)), extras: { wildshard: { bind: [...bone.pos] } } };
    if (children.length > 0) node['children'] = children;
    nodes.push(node);
  });
  const inverse = new Float32Array(bones.length * 16), m = new Matrix4();
  bones.forEach((bone, i) => { m.makeTranslation(-bone.pos[0], -bone.pos[1], -bone.pos[2]); inverse.set(m.elements, i * 16); });
  const skin = { name: bake.name, joints: bones.map((_, i) => joint(i)), inverseBindMatrices: accessor(inverse, 16, false, false) };
  const animations: Json[] = (bake.clips ?? []).map((clip) => {
    const samplerRows: Json[] = [], channelRows: Json[] = [];
    for (const track of clip.tracks) {
      const parsed = PropertyBinding.parseTrackName(track.name), node = names.get(parsed.nodeName);
      const path = parsed.propertyName === 'position' ? 'translation' : parsed.propertyName === 'quaternion' ? 'rotation' : parsed.propertyName === 'scale' ? 'scale' : null;
      const interpolation = track.getInterpolation() === InterpolateLinear ? 'LINEAR' : track.getInterpolation() === InterpolateDiscrete ? 'STEP' : null;
      if (node === undefined || path === null || interpolation === null) throw new Error(`Skinned clip ${clip.name}: unsupported track ${track.name}`);
      const width = path === 'rotation' ? 4 : 3, times = Float32Array.from(track.times), values = Float32Array.from(track.values);
      samplerRows.push({ input: accessor(times, 1, false, true), output: accessor(values, width, false, false), interpolation });
      channelRows.push({ sampler: samplerRows.length - 1, target: { node: joint(node), path } });
    }
    return { name: clip.name, samplers: samplerRows, channels: channelRows };
  });
  const roots = bones.flatMap((bone, i) => bone.parent === null ? [joint(i)] : []);
  const doc: Record<string, Json> = {
    asset: { version: '2.0', generator: 'wildshard-skinned-v1', extras: { wildshard: bake.extras ?? null } },
    scene: 0, scenes: [{ name: bake.name, nodes: [...bake.parts.map((_, p) => p), ...roots] }], nodes, meshes, materials, skins: [skin], accessors, bufferViews: views,
    buffers: fallback === 0 ? [{ byteLength: offset }] : [{ byteLength: offset }, { byteLength: fallback, extensions: { [MESHOPT]: { fallback: true } } }],
  };
  if (fallback > 0) used.add(MESHOPT);
  if (animations.length > 0) doc['animations'] = animations;
  if (images.length > 0) { doc['images'] = images; doc['samplers'] = samplers; doc['textures'] = textures; }
  if (used.size > 0) { doc['extensionsUsed'] = [...used].sort(); doc['extensionsRequired'] = [...used].sort(); }
  const bin = new Uint8Array(offset); let at = 0;
  for (const chunk of chunks) { bin.set(chunk, at); at += chunk.length; }
  return { glb: joinGlb(doc, bin) };
}

/** Bind every triangle rigidly to the bone `boneOf` names for its centroid (bone indices in the caller's skeleton order). */
export function bindRigid(g: BufferGeometry, boneOf: (x: number, y: number, z: number) => number): BufferGeometry {
  const p = g.getAttribute('position'), n = p.count, index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
  for (let t = 0; t + 2 < n; t += 3) {
    const bone = boneOf((p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3);
    for (let v = t; v < t + 3; v++) { index[v * 4] = bone; weight[v * 4] = 1; }
  }
  g.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4)); g.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));
  return g;
}
