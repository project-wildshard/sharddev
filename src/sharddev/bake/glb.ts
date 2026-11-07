import * as schema from 'valibot';
import { BufferAttribute, Float16BufferAttribute, Matrix4, type Color, type InterleavedBufferAttribute, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, Group, Mesh, type Material, type Object3D, BufferGeometry, Euler } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseGlb } from '../assets';
import { parsePrivateScene, compileTubeCurve, type TubeCurveProfile, type TubeCurveFrame, type PrivateScene } from '@wildshard/format/clientChannels';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Geometry GLB and the existing private-scene rows; actual materials remain owned client ports. */
export interface ClientSceneBake { readonly glb: Uint8Array; readonly scene: PrivateScene }

/** A bounded authored strand, optionally placed within its named scene mesh. */
export interface ClientSceneCurve {
  readonly profile: TubeCurveProfile; readonly frame: TubeCurveFrame; readonly time?: number;
  readonly position?: readonly [number, number, number]; readonly rotation?: readonly [number, number, number];
}
/** Named curve meshes share the runtime tube sampler; absent preserves ordinary geometry. */
export interface ClientSceneOptions { readonly curves?: ReadonlyMap<string, readonly ClientSceneCurve[]> }
function curveGeometry(rows: readonly ClientSceneCurve[]): BufferGeometry {
  if (rows.length === 0 || rows.length > 32) throw new Error('Authored curves exceed their bounded roster');
  const parts: BufferGeometry[] = []; let vertices = 0;
  try {
    for (const row of rows) {
      const tube = compileTubeCurve(row.profile); vertices += tube.vertices;
      if (vertices > 65536) throw new Error('Authored curve mesh exceeds its vertex budget');
      const positions = new Float32Array(tube.vertices * 3); tube.write(positions, row.frame, row.time ?? 0);
      const { segments, radial, caps } = row.profile, indices: number[] = [];
      for (let s = 0; s < segments; s++) for (let r = 0; r < radial; r++) {
        const a = s * radial + r, b = s * radial + (r + 1) % radial, c = a + radial, d = b + radial;
        indices.push(a, b, c, b, d, c);
      }
      if (caps === true) {
        const bottom = (segments + 1) * radial, top = bottom + radial + 1;
        for (let r = 0; r < radial; r++) {
          const next = (r + 1) % radial;
          indices.push(bottom, bottom + next + 1, bottom + r + 1, top, top + r + 1, top + next + 1);
        }
      }
      const geometry = new BufferGeometry(); parts.push(geometry);
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(new Uint16Array(indices), 1)); geometry.computeVertexNormals();
      const position = row.position ?? [0, 0, 0], rotation = row.rotation ?? [0, 0, 0];
      if ([...position, ...rotation].some(value => !Number.isFinite(value) || Math.abs(value) > 1e5)) throw new Error('Invalid authored curve pose');
      geometry.applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1)));
    }
    const result = mergeGeometries(parts);
    result.computeBoundingBox(); result.computeBoundingSphere(); return result;
  } finally { for (const geometry of parts) geometry.dispose(); }
}

function ordinaryMesh(value: Object3D): value is Mesh { return value instanceof Mesh && value.type === 'Mesh'; }

/** Bake named ordinary groups and meshes without fitting geometry or serializing shader/material owners. */
export function clientSceneGlb(root: Group, ports: ReadonlyMap<Material, string>, options: ClientSceneOptions = {}): ClientSceneBake {
  const nodes: PrivateScene['nodes'] = [], materials: PrivateScene['materials'] = [], primitives: GlbPrimitive[] = [];
  const identities = new Set<string>(), namedMaterials = new Map<string, Material>();
  const geometryMaterial = new MeshStandardMaterial(), ownedCurves: BufferGeometry[] = [], usedCurves = new Set<string>();
  if ((options.curves?.size ?? 0) > 128) throw new Error('Too many authored curve targets');
  const visit = (object: Object3D): void => {
    if (identities.size >= 128) throw new Error('Rest scene exceeds its bounded part roster');
    if (!/^[a-z][a-zA-Z0-9-]{0,95}$/u.test(object.name) || identities.has(object.name)) throw new Error('Rest scene requires unique loader-safe part names');
    if (object.layers.mask !== 1 || !object.matrixAutoUpdate || object.animations.length > 0) throw new Error('Rest scene requires ordinary transform owners');
    identities.add(object.name);
    const pose = { position: [object.position.x, object.position.y, object.position.z] as [number, number, number],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z] as [number, number, number], order: object.rotation.order,
      scale: [object.scale.x, object.scale.y, object.scale.z] as [number, number, number], children: object.children.map(child => child.name),
      visible: object.visible, castShadow: object.castShadow, receiveShadow: object.receiveShadow, frustumCulled: object.frustumCulled, renderOrder: object.renderOrder };
    if (ordinaryMesh(object)) {
      if (Array.isArray(object.material) || Object.keys(object.geometry.morphAttributes).length > 0
        || object.geometry.drawRange.start !== 0 || object.geometry.drawRange.count !== Infinity) throw new Error('Rest scene requires one owned material and complete rigid geometry');
      const material = ports.get(object.material);
      if (material === undefined) throw new Error('Rest scene material has no declared client port');
      const prior = namedMaterials.get(material);
      if (prior !== undefined && prior !== object.material) throw new Error('Rest scene material port aliases distinct owners');
      if (prior === undefined) {
        if (namedMaterials.size >= 32) throw new Error('Rest scene exceeds its bounded material roster');
        namedMaterials.set(material, object.material); materials.push({ kind: 'port', id: material, source: material });
      }
      const curves = options.curves?.get(object.name), geometry = curves === undefined ? object.geometry : curveGeometry(curves);
      if (curves !== undefined) { ownedCurves.push(geometry); usedCurves.add(object.name); }
      const sphere = geometry.boundingSphere, box = geometry.boundingBox;
      for (const [channel, attribute] of Object.entries(geometry.attributes)) {
        const width = ['uv','uv1'].includes(channel) ? 2 : channel === 'tangent' ? 4 : ['position', 'normal', 'color'].includes(channel) ? 3 : undefined;
        if (width === undefined || !(attribute instanceof BufferAttribute) || !(attribute.array instanceof Float32Array)
          || attribute.normalized || attribute.itemSize !== width) throw new Error('Rest scene requires exact supported Float32 geometry channels');
      }
      const index = geometry.index;
      if (index !== null && (!(index.array instanceof Uint16Array) && !(index.array instanceof Uint32Array)
        || index.normalized || index.itemSize !== 1)) throw new Error('Rest scene requires exact uint16/uint32 indices');
      const extras = { restBox: box === null ? null : [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], restGroups: geometry.groups.map(group => [group.start, group.count, group.materialIndex ?? 0]),
        restSphere: sphere === null ? null : [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius] };
      primitives.push({ name: object.name, geometry, material: geometryMaterial, nativeAttributes: true, compactIndex: true, extras });
      nodes.push({ kind: 'mesh', id: object.name, geometry: object.name, material, missing: 'empty', ...pose });
    } else if (object instanceof Group && object.type === 'Group') nodes.push({ kind: 'group', id: object.name, ...pose });
    else throw new Error('Rest scene supports ordinary Group and Mesh declarations only');
    for (const child of object.children) visit(child);
  };
  try {
    visit(root);
    if (usedCurves.size !== (options.curves?.size ?? 0)) throw new Error('Authored curve target is not a declared mesh');
    const scene = parsePrivateScene({ version: 1, root: root.name, nodes, materials });
    return { scene, glb: staticGlb(primitives, root.name) };
  } finally { geometryMaterial.dispose(); for (const geometry of ownedCurves) geometry.dispose(); }
}
/** A primitive's geometry, material and optional instanced local transforms; textures are separate declared assets. */
export interface GlbPrimitive {
  geometry: BufferGeometry; material: MeshStandardMaterial | MeshBasicMaterial; instances?: readonly Matrix4[]; castShadow?: boolean;
  /** Optional unique glTF node/mesh name (letters, digits, underscore or hyphen); absent preserves the old byte path. */
  name?: string;
  /** Write exact float32 column-major MAT4 instances instead of decomposing TRS. */
  exactInstances?: true;
  /** Optional linear RGB instance colours, 0 … 1; count must match instances. */
  instanceColours?: readonly Color[];
  /** Explicit glTF application semantic → geometry channel, e.g. `_SPLAT: 'splat'`; absent preserves old bytes. */
  customAttributes?: Readonly<Record<string, string>>;
  /** Optional node transform (a finite positive TRS; not with `instances`); absent preserves the old byte path. */
  transform?: Matrix4;
  /** I3: with `nativeAttributes`, each non-float32 channel is written once (an integer custom channel in its own type,
   *  a half-float one only as its raw bits) instead of also as float32; absent: the old (pinned) byte path. */
  nativeOnce?: true;
  /** I3: the exact source transform a native node records (`matrix64`) when its node `transform` also carries the grid
   *  that dequantizes its positions; absent: `transform` itself. */
  pose?: Matrix4;
  /** Keep original typed vertex channels as glTF application accessors with reconstruction metadata in node extras.
   * Half floats use uint16 bits (glTF has no float16); ordinary semantics remain portable float32. Also retains
   * double-precision source transforms in extras. Omitted: the existing byte path. */
  nativeAttributes?: true;
  /** Plain application rows, charged inside the GLB; reserved storage/transform extras remain baker-owned. */
  extras?: Readonly<Record<string, Json>>;
  /** `true` writes the index as built: none for a non-indexed geometry, 16-bit when it is 16-bit; absent always writes a 32-bit index (the old byte path). */
  compactIndex?: true;
  /** `true` writes a normalized Int8 normal and a normalized Uint8 / Uint16 colour as they are (KHR_mesh_quantization,
   *  tightly packed), which three's GLTFLoader reads back into the same typed attributes;
   *  positions stay float32. Other storage refuses. Absent: the old float32 byte path. */
  quantizedChannels?: true;
  /** With `quantizedChannels`: every quantized channel gets a 4-byte stride (meshopt's attribute codec needs one;
   *  GLTFLoader reads it back interleaved), and an unnormalized Int16 position is written on its node's grid, the
   *  node's `transform` (a scale and translation) dequantizing it (RM8.1, tiles). */
  meshoptReady?: true;
}
/** A deterministic self-contained static GLB; names and vertex colours survive the ordinary engine GLTFLoader. */
export function staticGlb(primitives: readonly GlbPrimitive[], name = 'baked'): Uint8Array {
  const names = primitives.map(primitive => primitive.name ?? name);
  for (const primitive of primitives) {
    if (primitive.name !== undefined && (!/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/u.test(primitive.name)
      || names.filter(actual => actual === primitive.name).length !== 1)) throw new Error('GLB node names must be unique loader-safe identifiers');
  }
  const chunks: Uint8Array[] = [], views: Json[] = [], accessors: Json[] = [], meshes: Json[] = [], nodes: Json[] = [], materials: Json[] = [];
  let offset = 0;
  const accessor = (values: readonly number[] | BufferAttribute | InterleavedBufferAttribute, width: number, type: string, integer = false, bounds = false, short = false): number => {
    // Read through Three's channel API, including normalized, half and interleaved
    // attributes, without first allocating a boxed copy of every component.
    const length = 'length' in values ? values.length : values.count * width;
    // Three's Float16BufferAttribute inherits getComponent, which returns
    // Uint16 storage bits. Its axis getters decode the numeric channel value.
    const read = 'length' in values ? (i: number) => values[i]
      : values instanceof Float16BufferAttribute ? (i: number) => {
        const row = Math.floor(i / width), component = i % width;
        return component === 0 ? values.getX(row) : component === 1 ? values.getY(row)
          : component === 2 ? values.getZ(row) : values.getW(row);
      } : (i: number) => values.getComponent(Math.floor(i / width), i % width);
    if (length === 0 || length % width !== 0) throw new Error('Invalid GLB attribute');
    // Validate, encode and collect component bounds in one ordered pass. Bounds
    // retain the unrounded source values, while the wire keeps its old storage.
    const minima: number[] = bounds ? Array.from({ length: width }, () => Infinity) : [];
    const maxima: number[] = bounds ? Array.from({ length: width }, () => -Infinity) : [];
    // a 16-bit index's view is padded to 4 bytes so every later view stays aligned
    const size = short ? 2 : 4, bytes = new Uint8Array(Math.ceil(length * size / 4) * 4), v = new DataView(bytes.buffer);
    for (let i = 0; i < length; i++) {
      const n = read(i);
      if (n === undefined || !Number.isFinite(n)) throw new Error('Invalid GLB attribute');
      if (short) v.setUint16(i * 2, n, true);
      else if (integer) v.setUint32(i * 4, n, true);
      else v.setFloat32(i * 4, n, true);
      if (bounds) {
        const component = i % width;
        minima[component] = Math.min(minima[component] ?? Infinity, n);
        maxima[component] = Math.max(maxima[component] ?? -Infinity, n);
      }
    }
    const view = views.length; views.push({ buffer: 0, byteOffset: offset, byteLength: length * size }); chunks.push(bytes); offset += bytes.length;
    const a: Record<string, Json> = { bufferView: view, componentType: short ? 5123 : integer ? 5125 : 5126, count: length / width, type };
    if (bounds) { a['min'] = minima; a['max'] = maxima; }
    accessors.push(a); return accessors.length - 1;
  };
  const rawAccessor = (attribute: BufferAttribute): number => {
    const array = attribute.array;
    const componentType = array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125
      : array instanceof Uint16Array ? 5123 : array instanceof Int16Array ? 5122
      : array instanceof Uint8Array ? 5121 : array instanceof Int8Array ? 5120 : null;
    if (componentType === null) throw new Error('Native GLB attributes require a glTF component type');
    const length = attribute.count * attribute.itemSize * array.BYTES_PER_ELEMENT;
    const bytes = new Uint8Array(Math.ceil(length / 4) * 4);
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, length));
    const view = views.length; views.push({ buffer: 0, byteOffset: offset, byteLength: length }); chunks.push(bytes); offset += bytes.length;
    accessors.push({ bufferView: view, componentType, count: attribute.count,
      type: attribute.itemSize === 1 ? 'SCALAR' : `VEC${attribute.itemSize}`,
      ...(attribute.normalized ? { normalized: true } : {}) });
    return accessors.length - 1;
  };
  // KHR_mesh_quantization: a normalized integer vertex channel, tightly packed (each view starts 4-byte aligned): WebGL
  // needs only component alignment, and three's GLTFLoader reads a packed view back as a plain typed attribute (a padded
  // stride would come back interleaved)
  let quantized = false;
  const packedAccessor = (attribute: BufferAttribute, aligned = false, position = false): number => {
    const array = attribute.array;
    const componentType = position ? (array instanceof Int16Array && !attribute.normalized ? 5122 : null)
      : !attribute.normalized ? null : array instanceof Int8Array ? 5120 : array instanceof Uint8Array ? 5121 : array instanceof Uint16Array ? 5123 : null;
    if (componentType === null) throw new Error('Quantized GLB channels must be normalized Int8, Uint8 or Uint16 (positions unnormalized Int16)');
    const element = attribute.itemSize * array.BYTES_PER_ELEMENT, stride = aligned ? Math.ceil(element / 4) * 4 : element;
    const length = attribute.count * stride, bytes = new Uint8Array(Math.ceil(length / 4) * 4), source = new Uint8Array(array.buffer, array.byteOffset, attribute.count * element);
    if (stride === element) bytes.set(source);
    // Copy raw components without allocating a typed view for every padded
    // vertex. The fresh target retains the same zero stride/tail padding.
    else for (let i = 0, from = 0, to = 0; i < attribute.count; i++, from += element, to += stride) {
      for (let component = 0; component < element; component++) bytes[to + component] = source[from + component] ?? 0;
    }
    const view = views.length; views.push({ buffer: 0, byteOffset: offset, byteLength: length, ...(stride === element ? {} : { byteStride: stride }) }); chunks.push(bytes); offset += bytes.length;
    const a: Record<string, Json> = { bufferView: view, componentType, ...(position ? {} : { normalized: true }), count: attribute.count, type: `VEC${attribute.itemSize}` };
    if (position) {
      const minima = [Infinity, Infinity, Infinity], maxima = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < 3; c++) {
        const n = attribute.getComponent(i, c); minima[c] = Math.min(minima[c] ?? Infinity, n); maxima[c] = Math.max(maxima[c] ?? -Infinity, n);
      }
      a['min'] = minima; a['max'] = maxima;
    }
    accessors.push(a);
    quantized = true;
    return accessors.length - 1;
  };
  const trs = (matrix: Matrix4): { position: Vector3; rotation: Quaternion; scale: Vector3 } => {
    const position = new Vector3(), scale = new Vector3(), rotation = new Quaternion();
    matrix.decompose(position, rotation, scale);
    const composed = new Matrix4().compose(position, rotation, scale);
    if (matrix.elements.some((n, i) => !Number.isFinite(n) || Math.abs(n - (composed.elements[i] ?? Infinity)) > 1e-5) || scale.x <= 0 || scale.y <= 0 || scale.z <= 0) throw new Error('Instance must be a finite positive TRS transform');
    return { position, rotation, scale };
  };
  for (const { geometry, material, instances, exactInstances, instanceColours, castShadow = true, customAttributes = {}, name: nodeName = name, transform, compactIndex, nativeAttributes, nativeOnce, extras, pose, quantizedChannels, meshoptReady } of primitives) {
    if (material.map !== null || material.alphaMap !== null || (!(material instanceof MeshBasicMaterial) && (material.normalMap !== null || material.roughnessMap !== null || material.metalnessMap !== null))) throw new Error('GLB textures must be external KTX2 declarations');
    if (!geometry.hasAttribute('position')) throw new Error('Missing GLB positions');
    const p = geometry.getAttribute('position'); if ( p.count > 400_000) throw new Error('Unsupported GLB geometry');
    const attributes: Record<string, Json> = {};
    for (const [key, semantic, width] of [['position', 'POSITION', 3], ['normal', 'NORMAL', 3], ['uv', 'TEXCOORD_0', 2], ['uv1', 'TEXCOORD_1', 2], ['color', 'COLOR_0', geometry.hasAttribute('color') ? geometry.getAttribute('color').itemSize : 3], ['tangent', 'TANGENT', 4]] as const) {
      const a = geometry.getAttribute(key); if (!geometry.hasAttribute(key)) continue;
      // A trusted whole shape may use the fourth normal component as a shader channel. glTF NORMAL is vec3:
      // retain the original vec4 as an application accessor below, never misdeclare the portable semantic.
      if (nativeAttributes === true && key === 'normal' && a.itemSize === 4 && a.count === p.count) continue;
      if (a.itemSize !== width || a.count !== p.count || (key === 'color' && width !== 3 && width !== 4)) throw new Error('Mismatched GLB attributes');
      // (a colour outside [0, 1] stays float32 beside quantized normals: compactWholeNormals)
      if (quantizedChannels === true && (key === 'normal' || (key === 'color' && !(a.array instanceof Float32Array)))) {
        if (!(a instanceof BufferAttribute) || (key === 'normal' && !(a.array instanceof Int8Array))) throw new Error('Quantized GLB normals must be normalized Int8');
        attributes[semantic] = packedAccessor(a, meshoptReady === true); continue;
      }
      if (quantizedChannels === true && meshoptReady === true && key === 'position' && a instanceof BufferAttribute && a.array instanceof Int16Array) {
        if (transform === undefined) throw new Error('A quantized GLB position needs its node transform');
        attributes[semantic] = packedAccessor(a, true, true); continue;
      }
      attributes[semantic] = accessor(a, width, `VEC${width}`, false, key === 'position');
    }
    const custom = Object.entries(customAttributes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (custom.length > 16) throw new Error('GLB custom attribute cap');
    for (const [semantic, channel] of custom) {
      if (!/^_[A-Z][A-Z0-9_]{0,63}$/.test(semantic) || !geometry.hasAttribute(channel)) throw new Error(`Invalid GLB custom attribute ${semantic}`);
      const a = geometry.getAttribute(channel), width = a.itemSize;
      if (!Number.isInteger(width) || width < 1 || width > 4 || a.count !== p.count) throw new Error(`Mismatched GLB custom attribute ${semantic}`);
      // iPhone downloads I3 (with `nativeOnce`, so pinned byte paths stay): a native channel that is not float32 is read back only from its exact stored copy below (an
      // integer channel is that copy, under its own semantic; a half-float one is its raw bits), so it is not also
      // written as float32 (a half channel's float32 copy held its raw bits, never read; Nine's tiles carried ~50 MB of them)
      if (nativeAttributes === true && nativeOnce === true && a instanceof BufferAttribute && !(a.array instanceof Float32Array)) continue;
      attributes[semantic] = accessor(a, width, width === 1 ? 'SCALAR' : `VEC${width}`);
    }
    const native: Record<string, Json> = {};
    if (nativeAttributes === true) {
      const channels = new Map<string, string>([['position', 'POSITION'], ['normal', 'NORMAL'], ['uv', 'TEXCOORD_0'], ['uv1', 'TEXCOORD_1'], ['color', 'COLOR_0'], ['tangent', 'TANGENT'], ...custom.map(([semantic, channel]) => [channel, semantic] as [string, string])]);
      for (const [channel, semantic] of channels) {
        if (!geometry.hasAttribute(channel)) continue;
        const a = geometry.getAttribute(channel);
        if (!(a instanceof BufferAttribute)) throw new Error('Native GLB attributes must not be interleaved');
        let stored = semantic;
        // a quantized normal / colour is already its own typed portable accessor: the table names it, with no raw copy;
        // so is an integer custom channel (glTF admits any component type for an application semantic), written once here
        const portable = quantizedChannels === true && (channel === 'normal' || channel === 'color'
          || (channel === 'position' && meshoptReady === true && a.array instanceof Int16Array && !a.normalized));
        const integerCustom = nativeOnce === true && semantic.startsWith('_') && !(a instanceof Float16BufferAttribute) && !(a.array instanceof Float32Array);
        if (integerCustom) { attributes[semantic] = rawAccessor(a); native[channel] = { semantic, storage: a.array.constructor.name, normalized: a.normalized, itemSize: a.itemSize }; continue; }
        if (!portable && (!(a.array instanceof Float32Array) || (semantic === 'NORMAL' && a.itemSize !== 3))) {
          stored = `_WS_RAW_${semantic.replace(/^_/u, '')}`;
          if (Object.hasOwn(attributes, stored)) throw new Error(`Native GLB semantic collision ${stored}`);
          attributes[stored] = rawAccessor(a);
        }
        native[channel] = { semantic: stored, storage: a instanceof Float16BufferAttribute ? 'Float16Array' : a.array.constructor.name,
          normalized: a.normalized, itemSize: a.itemSize };
      }
    }
    const index = geometry.getIndex(), indices = index === null ? Array.from({ length: p.count }, (_, i) => i) : Array.from(index.array);
    if (indices.length % 3 !== 0 || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= p.count)) throw new Error('Invalid triangle indices');
    const materialIndex = materials.length;
    materials.push({ name: material.name, pbrMetallicRoughness: { baseColorFactor: [...material.color, material.opacity], metallicFactor: material instanceof MeshBasicMaterial ? 0 : material.metalness, roughnessFactor: material instanceof MeshBasicMaterial ? 1 : material.roughness }, doubleSided: material.side === 2,
      alphaMode: material.transparent ? 'BLEND' : material.alphaTest > 0 ? 'MASK' : 'OPAQUE',
      ...(material.alphaTest > 0 ? { alphaCutoff: material.alphaTest } : {}),
      ...(material instanceof MeshBasicMaterial ? { extensions: { KHR_materials_unlit: {} } } : material.emissive.r !== 0 || material.emissive.g !== 0 || material.emissive.b !== 0 ? { emissiveFactor: [...material.emissive].map(value => value * material.emissiveIntensity) } : {}),
    });
    const compact = compactIndex === true, short = compact && index !== null && index.array instanceof Uint16Array;
    meshes.push({ name: nodeName, primitives: [{ attributes, ...(compact && index === null ? {} : { indices: accessor(indices, 1, 'SCALAR', true, false, short) }), material: materialIndex }] });
    if (extras !== undefined && ['castShadow', 'nativeAttributes', 'matrix64', 'instances64'].some(key => Object.hasOwn(extras, key))) throw new Error('GLB application extras use a reserved key');
    const node: Record<string, Json> = { name: nodeName, mesh: meshes.length - 1, extras: { ...extras, castShadow, ...(nativeAttributes === true ? { nativeAttributes: native,
      ...(transform === undefined ? {} : { matrix64: (pose ?? transform).elements }),
      ...(instances === undefined ? {} : { instances64: instances.map(matrix => matrix.elements) }) } : {}) } };
    if (instances === undefined && (exactInstances !== undefined || instanceColours !== undefined)) throw new Error('Instance options need instances');
    if (instances !== undefined) {
      if (instances.length === 0 || instances.length > 10_000) throw new Error('Invalid instance count');
      let instanceAttributes: Record<string, Json>;
      if (exactInstances === true) instanceAttributes = { _MATRIX: accessor(instances.flatMap(matrix => matrix.elements), 16, 'MAT4') };
      else {
        const t: number[] = [], r: number[] = [], s: number[] = [];
        for (const matrix of instances) { const { position, rotation, scale } = trs(matrix); t.push(...position); r.push(...rotation); s.push(...scale); }
        instanceAttributes = { TRANSLATION: accessor(t, 3, 'VEC3'), ROTATION: accessor(r, 4, 'VEC4'), SCALE: accessor(s, 3, 'VEC3') };
      }
      if (instanceColours !== undefined) {
        if (instanceColours.length !== instances.length) throw new Error('Instance colours must match instance count');
        instanceAttributes['_COLOR_0'] = accessor(instanceColours.flatMap(colour => [colour.r, colour.g, colour.b]), 3, 'VEC3');
      }
      node['extensions'] = { EXT_mesh_gpu_instancing: { attributes: instanceAttributes } };
    }
    if (transform !== undefined) {
      if (instances !== undefined) throw new Error('A GLB node takes a transform or instances, not both');
      const { position, rotation, scale } = trs(transform);
      // only what differs from the identity, so a translated node keeps its exact translation
      if (position.x !== 0 || position.y !== 0 || position.z !== 0) node['translation'] = [position.x, position.y, position.z];
      if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0 || rotation.w !== 1) node['rotation'] = [rotation.x, rotation.y, rotation.z, rotation.w];
      if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) node['scale'] = [scale.x, scale.y, scale.z];
    }
    nodes.push(node);
  }
  const doc: Record<string, Json> = { asset: { version: '2.0', generator: 'wildshard-static-v1' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
  const extensions = [...(primitives.some(p => p.instances !== undefined) ? ['EXT_mesh_gpu_instancing'] : []), ...(primitives.some(p => p.material instanceof MeshBasicMaterial) ? ['KHR_materials_unlit'] : []), ...(quantized ? ['KHR_mesh_quantization'] : [])];
  if (extensions.length > 0) { doc['extensionsUsed'] = extensions; doc['extensionsRequired'] = extensions; }
  const raw = new TextEncoder().encode(JSON.stringify(doc)), length = Math.ceil(raw.length / 4) * 4, bytes = new Uint8Array(28 + length + offset), v = new DataView(bytes.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, bytes.length, true); v.setUint32(12, length, true); v.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + length); bytes.set(raw, 20);
  v.setUint32(20 + length, offset, true); v.setUint32(24 + length, 0x004e4942, true);
  let at = 28 + length; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  parseGlb(bytes); return bytes;
}

/** Read ordered whole-partition identities from a bounded standard GLB JSON
 * chunk. Unrelated glTF metadata strips; malformed optional structures refuse. */
export function glbWholePartitionIds(bytes: Uint8Array): string[] {
  if (bytes.byteLength < 20) throw new Error('GLB partition is truncated');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = header.getUint32(12, true);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength
    || header.getUint32(16, true) !== 0x4e4f534a || length > bytes.byteLength - 20) throw new Error('GLB partition header differs');
  const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + length)));
  const value = schema.parse(schema.object({ nodes: schema.optional(schema.array(schema.object({ extras: schema.optional(schema.object({ wholePartition: schema.optional(schema.object({ id: schema.string() })) })) })), []) }), json);
  return value.nodes.flatMap(node => node.extras?.wholePartition === undefined ? [] : [node.extras.wholePartition.id]);
}
