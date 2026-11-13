import { BufferAttribute, type BufferGeometry, Float16BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import * as v from 'valibot';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NativeAttributesSchema } from '@wildshard/engine/models/nativeGeometry';
import { wholeGeometryPieces } from '@wildshard/engine/game/shardfile/wholeGeometryPieces';
import type { WholeGeometryPiece } from '@wildshard/engine/game/plugin/geometry';
import { joinWholePieceSteps } from './wholePieceJoin';
import { WorldSceneSlabsSchema, type WorldSceneSlabChunk, type WorldSceneSlabFile, type WorldSceneSlabKey, type WorldSceneSlabLibrary } from '@wildshard/format/worldSceneSlabs';
import { parseWorldSceneWeld, type WorldSceneWeld, type WorldSceneWeldNode } from '@wildshard/format/worldSceneWeld';
import type { WorldScenesSection } from '@wildshard/format/worldScenes';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { prepareGlbBuffers } from '@wildshard/format/glbBuffers';
import { hashImmutableBytes } from '../immutable';
import { staticGlb, type GlbPrimitive } from './glb';
import { compressGlb } from './glbCompression';
import { parseGlb } from '../assets';
import { readSourceModel } from './skinned';
import { positionErrorScale } from './geometryError';
import { partitionSlabGeometry, type SlabGeometryChunk } from './slabChunks';

// Every native slab mounts as one identity instance with a white RGB colour.
// Its first draw uploads those two native attributes as well as the geometry.
const INSTANCE_UPLOAD_BYTES = (16 + 3) * Float32Array.BYTES_PER_ELEMENT;
const GEOMETRY_UPLOAD_BYTES = 4_000_000 - INSTANCE_UPLOAD_BYTES;

type WholeLibrary = Exclude<Extract<WorldScenesSection['libraries'][number], { kind: 'whole' }>, { storage: 'slabs' }>;
type Draw = Extract<WorldSceneWeldNode, { kind: 'mesh' }>;
interface Source { node: Draw; model: WholeLibrary['models'][number]; forceIdentity: boolean; frame: Matrix4; owners: readonly string[] }
interface Chunk { key: WorldSceneSlabKey; part: SlabGeometryChunk; custom: Readonly<Record<string, string>>; error: number }
interface GroupedKey { key: WorldSceneSlabKey; signature: string }
/** Actual partition and upload census. Oversized height is explained by an unchanged source triangle, never a clipped one. */
export interface SlabBakeTileReport {
  tile: number; sourceTriangles: number; triangles: number; chunks: number; files: number; bytes: number;
  maxHeight: number; maxTriangleHeight: number;
}
/** New staged data only; callers keep the original whole library and every existing asset unchanged. */
export interface WholeSlabBake {
  library: WorldSceneSlabLibrary; assets: ReadonlyMap<string, Uint8Array>; report: readonly SlabBakeTileReport[];
}

function matrixWords(matrix: Matrix4): number[] { return Array.from(new Uint32Array(Float64Array.from(matrix.elements).buffer)); }
function anchorFrames(weld: WorldSceneWeld): ReadonlyMap<string, Matrix4> {
  const nodes = new Map(weld.nodes.map(node => [node.id, node])), frames = new Map<string, Matrix4>([[weld.root, new Matrix4()]]), active = new Set<string>();
  const frame = (id: string): Matrix4 => {
    const known = frames.get(id); if (known !== undefined) return known;
    const row = nodes.get(id); if (row === undefined || active.has(id)) throw new Error('Slab anchor has an unknown or cyclic parent');
    active.add(id);
    const object = new Group(); object.matrixAutoUpdate = row.matrixAutoUpdate;
    if (row.transformBits !== undefined) {
      const values = new Float64Array(Uint32Array.from(row.transformBits).buffer);
      object.position.fromArray(values); object.quaternion.fromArray(values, 3); object.scale.fromArray(values, 7);
    }
    if (row.matrixBits !== undefined) object.matrix.fromArray(new Float64Array(Uint32Array.from(row.matrixBits).buffer));
    if (object.matrixAutoUpdate) object.updateMatrix();
    const world = frame(row.parent).clone().multiply(object.matrix); frames.set(id, world); active.delete(id); return world;
  };
  for (const row of weld.nodes) frame(row.id);
  return frames;
}
function sources(library: WholeLibrary, weld: WorldSceneWeld): Source[] {
  if (library.load !== 'refine') throw new Error('Slabs require a fine whole library');
  const frames = anchorFrames(weld), models = new Map(library.models.map(model => [model.id, model])), nodes = new Map(weld.nodes.map(node => [node.id, node]));
  const handed = new Set<string>(), transforms = new Map<string, boolean>(), output: Source[] = [];
  for (const node of weld.nodes) if ('geometry' in node && node.geometry.library === library.id) {
    if (node.kind !== 'mesh') throw new Error('Slabs require plain static refine anchors');
    const model = models.get(node.geometry.model), frame = frames.get(node.id);
    if (model === undefined || frame === undefined) throw new Error('Slab anchor omits its whole model');
    let forceIdentity = transforms.get(model.id);
    if (forceIdentity === undefined) { forceIdentity = handed.has(model.part); transforms.set(model.id, forceIdentity); handed.add(model.part); }
    const ancestors = new Set<string>([node.id]); let parent = node.parent;
    while (parent !== weld.root) {
      const ancestor = nodes.get(parent); if (ancestor === undefined || ancestors.has(parent)) throw new Error('Slab anchor has an unknown or cyclic owner');
      ancestors.add(parent); parent = ancestor.parent;
    }
    // Equal poses alone do not make independently culled or hidden anchors interchangeable.
    // Keep the original parent and each cull-root slot, including its original distance origin.
    const owners = [node.parent, ...weld.culls.flatMap((cull, cullIndex) => cull.roots.flatMap((root, origin) => ancestors.has(root) ? [`${cullIndex}:${origin}`] : []))];
    output.push({ node, model, frame, forceIdentity, owners });
  }
  if (output.length === 0) throw new Error('Slabs require a covered fine draw');
  return output;
}
function drawKey(source: Source, id: string): WorldSceneSlabKey {
  const row = source.node;
  return { id, node: row.id, material: row.material, castShadow: row.castShadow, receiveShadow: row.receiveShadow,
    ...(row.castFrom === undefined ? {} : { castFrom: row.castFrom }), ...(row.until === undefined ? {} : { until: row.until }),
    renderOrder: row.renderOrder, layers: row.layers, frustumCulled: row.frustumCulled, visible: row.visible, sources: [source.model.id] };
}
function compatibleSignature(source: Source, geometry: BufferGeometry, custom: Readonly<Record<string, string>>): string {
  const { id: _id, node: _node, sources: _sources, ...key } = drawKey(source, 'key');
  return JSON.stringify([key, source.owners, matrixWords(source.frame), geometry.index !== null, Object.entries(geometry.attributes).map(([name, attribute]) => [name,
    attribute.array.constructor.name, attribute.constructor.name, attribute.itemSize, attribute.normalized, attribute instanceof BufferAttribute ? attribute.gpuType : null]), custom]);
}
function joined(pieces: readonly WholeGeometryPiece[], source: Source): BufferGeometry {
  const steps = joinWholePieceSteps(pieces, source.model.matrix, source.forceIdentity);
  for (;;) { const next = steps.next(); if (next.done) { if (next.value === undefined) throw new Error('Slab join did not complete'); return next.value; } }
}
function concatenate(geometries: readonly BufferGeometry[]): BufferGeometry {
  const first = geometries[0]; if (first === undefined) throw new Error('Slab key has no geometry');
  const mergedGeometry = mergeGeometries([...geometries], false);
  if (mergedGeometry === null) throw new Error('Slab key channel layout differs');
  // Three's merger preserves raw words but drops the half-float attribute class.
  for (const [name, attribute] of Object.entries(first.attributes)) if (attribute instanceof Float16BufferAttribute) {
    const merged = mergedGeometry.getAttribute(name);
    if (!(merged instanceof BufferAttribute) || !(merged.array instanceof Uint16Array)) { mergedGeometry.dispose(); throw new Error('Slab half storage differs'); }
    const half = new Float16BufferAttribute(merged.array, merged.itemSize, merged.normalized); half.gpuType = attribute.gpuType; mergedGeometry.setAttribute(name, half);
  }
  return mergedGeometry;
}
function joinError(pieces: readonly WholeGeometryPiece[], source: Source, tileError: number): number {
  const pose = source.model.matrix === undefined ? undefined : new Matrix4().fromArray(source.model.matrix), scale = pose === undefined ? 1 : positionErrorScale(pose);
  let maximum = 0;
  const identity = new Matrix4(), point = new Vector3();
  for (const piece of pieces) {
    const position = piece.geometry.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
      point.fromBufferAttribute(position, vertex); let error = 0;
      if (source.forceIdentity || pose !== undefined || !piece.matrix.equals(identity)) {
        point.applyMatrix4(piece.matrix);
        error = Math.hypot(point.x - Math.fround(point.x), point.y - Math.fround(point.y), point.z - Math.fround(point.z));
        point.set(Math.fround(point.x), Math.fround(point.y), Math.fround(point.z));
      }
      if (pose !== undefined) {
        point.applyMatrix4(pose);
        error = error * scale + Math.hypot(point.x - Math.fround(point.x), point.y - Math.fround(point.y), point.z - Math.fround(point.z));
      }
      maximum = Math.max(maximum, error);
    }
  }
  return (tileError * scale + maximum) * positionErrorScale(source.frame);
}
function isMesh(node: Object3D): node is Mesh { return node instanceof Mesh; }
async function decode(bytes: Uint8Array): Promise<WholeGeometryPiece[]> {
  const { gltf } = await readSourceModel(bytes), meshes: Mesh[] = [];
  gltf.scene.traverse(node => { if (isMesh(node)) meshes.push(node); });
  try { return wholeGeometryPieces(meshes); }
  finally {
    const geometry = new Set(meshes.map(mesh => mesh.geometry)), materials = new Set(meshes.flatMap(mesh => [mesh.material].flat()));
    for (const item of geometry) item.dispose(); for (const material of materials) material.dispose();
  }
}
function options(chunk: Chunk, tile: number, index: number): GlbPrimitive {
  const geometry = chunk.part.geometry, normal = geometry.getAttribute('normal'), colour = geometry.getAttribute('color');
  const quantized = (normal === undefined || normal instanceof BufferAttribute && normal.itemSize === 3 && normal.array instanceof Int8Array && normal.normalized)
    && (colour === undefined || colour instanceof BufferAttribute && (colour.array instanceof Uint8Array || colour.array instanceof Uint16Array) && colour.normalized);
  // named as its key's material: a product with props.materials admits only named GLB materials (the runtime draws a chunk with
  // its anchor's material, never this one)
  const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 }); material.name = chunk.key.material;
  return { geometry, material, name: `${chunk.key.id}-chunk_${index}`, castShadow: chunk.key.castShadow, customAttributes: chunk.custom,
    nativeAttributes: true, nativeOnce: true, compactIndex: true, ...(quantized ? { quantizedChannels: true } : {}),
    extras: { slab: { key: chunk.key.id, tile, chunk: index } } };
}
function chunkRow(chunk: Chunk): WorldSceneSlabChunk {
  const box = chunk.part.geometry.boundingBox, sphere = chunk.part.geometry.boundingSphere;
  if (box === null || sphere === null) throw new Error('Slab chunk omits its frozen bounds');
  for (const point of [box.min, box.max]) if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Invalid slab chunk bounds');
  return { key: chunk.key.id, bytes: chunk.part.bytes, geometricError: chunk.error,
    box: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], sphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius] };
}
function encodeFiles(tile: number, chunks: readonly Chunk[], assets: Map<string, Uint8Array>): WorldSceneSlabFile[] {
  const result: WorldSceneSlabFile[] = [];
  const emit = (rows: readonly Chunk[]): void => {
    const primitives = rows.map((chunk, index) => options(chunk, tile, index));
    let bytes: Uint8Array;
    try { bytes = staticGlb(primitives, `slab_tile_${tile}`); }
    catch (error) {
      if (!(error instanceof Error) || !['GLB resource cap', 'invalid GLB header'].includes(error.message) || rows.length < 2) throw error;
      const mid = Math.floor(rows.length / 2); emit(rows.slice(0, mid)); emit(rows.slice(mid)); return;
    } finally { for (const primitive of primitives) primitive.material.dispose(); }
    const packed = compressGlb(bytes);
    if (packed.length < bytes.length) {
      try { parseGlb(packed); bytes = packed; }
      catch (error) { if (!(error instanceof Error) || error.message !== 'GLB resource cap') throw error; }
    }
    parseGlb(bytes);
    const hash = hashImmutableBytes(bytes); assets.set(hash, bytes);
    result.push({ file: hash, chunks: rows.map(chunkRow) });
  };
  let batch: Chunk[] = [], bytes = 0;
  for (const chunk of chunks) {
    if (batch.length > 0 && bytes + chunk.part.bytes > 12_000_000) { emit(batch); batch = []; bytes = 0; }
    batch.push(chunk); bytes += chunk.part.bytes;
  }
  if (batch.length > 0) emit(batch);
  if (result.length > 16) throw new Error('Slab tile exceeds its file budget');
  return result;
}

/** Validate cached slab metadata through its defining bounded grammar; author folders need no format/parser imports. */
export function readSlabLibrary(bytes: Uint8Array): WorldSceneSlabLibrary {
  return v.parse(WorldSceneSlabsSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

/** Prejoin the declared fine whole pieces in their original draw frames. The runtime is not activated by this writer.
 * Every source triangle is charged once; attribute copies are bit-checked before files enter the returned map. */
export async function bakeWholeSlabs(input: {
  readonly id: string; readonly library: WholeLibrary; readonly weld: unknown;
  readonly shardfile: Pick<Shardfile, 'tiles' | 'files' | 'ring'>; readonly assets: ReadonlyMap<string, Uint8Array>;
}): Promise<WholeSlabBake> {
  await prepareGlbBuffers();
  const weld = parseWorldSceneWeld(input.weld), draws = sources(input.library, weld), keys: GroupedKey[] = [], assets = new Map<string, Uint8Array>();
  const sourceKeys = new Map<string, WorldSceneSlabKey>(), output: WorldSceneSlabLibrary['tiles'] = [], report: SlabBakeTileReport[] = [];
  const wanted = new Set(draws.flatMap(source => source.model.files)), declared = new Map(input.shardfile.files.map(file => [file.hash, file]));
  const available = new Set(input.shardfile.tiles.filter(tile => tile.lod === 0).flatMap(tile => tile.files));
  for (const hash of wanted) if (!available.has(hash) || declared.get(hash)?.kind !== 'glb') throw new Error('Slab source needs a declared fine GLB');
  const fine = [...input.shardfile.tiles].filter(row => row.lod === 0 && row.files.some(hash => wanted.has(hash))).sort((a, b) => a.z - b.z || a.x - b.x);
  const owner = fine[0], cell = input.shardfile.ring === 'cell';
  // A resident cell retains the lowest owned tile from every viewing position. Ring worlds keep their individual
  // tile owners; grouping those would retire geometry still needed by another tile.
  const partitions = cell && owner !== undefined ? [{ ...owner, files: [...new Set(fine.flatMap(tile => tile.files))],
    geometricError: Math.max(...fine.map(tile => tile.geometricError)) }] : fine;
  for (const tile of partitions) {
    const files = tile.files.filter(hash => wanted.has(hash)); if (files.length === 0) continue;
    const pieces = new Map<string, readonly WholeGeometryPiece[]>(), staging: WholeGeometryPiece[] = [], chunks: Chunk[] = [];
    const groups = new Map<string, { key: WorldSceneSlabKey; geometries: BufferGeometry[]; frame: Matrix4; custom: Readonly<Record<string, string>>; error: number }>();
    let sourceTriangles = 0;
    try {
      for (const hash of files) {
        const bytes = input.assets.get(hash), file = declared.get(hash);
        if (bytes === undefined || file === undefined || bytes.length !== file.compressed || hashImmutableBytes(bytes) !== hash) throw new Error('Slab source bytes differ');
        const read = await decode(bytes); pieces.set(hash, read); staging.push(...read);
      }
      for (const source of draws) {
        const selected = source.model.files.flatMap(hash => pieces.get(hash) ?? []).filter(piece => piece.part === source.model.part);
        if (selected.length === 0) { if (source.model.files.some(hash => files.includes(hash))) throw new Error('Slab source file omits its declared part'); continue; }
        const geometry = joined(selected, source);
        try {
          const first = selected[0]; if (first === undefined) throw new Error('Slab source has no channels');
          const channels = v.parse(NativeAttributesSchema, JSON.parse(first.layout));
          const custom = Object.fromEntries(Object.entries(channels).filter(([name]) => !['position', 'normal', 'color', 'uv', 'uv1', 'tangent'].includes(name)).map(([name, row]) => [row.semantic, name]));
          let key = sourceKeys.get(source.node.id);
          if (key === undefined) {
            const signature = compatibleSignature(source, geometry, custom), known = keys.find(entry => entry.signature === signature && !entry.key.sources.includes(source.model.id));
            if (known === undefined) { key = drawKey(source, `k${keys.length}`); keys.push({ key, signature }); }
            else { key = known.key; key.sources.push(source.model.id); }
            sourceKeys.set(source.node.id, key);
          }
          const signature = compatibleSignature(source, geometry, custom);
          if (!keys.some(entry => entry.key === key && entry.signature === signature)) throw new Error('Slab draw key differs between tiles');
          const count = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
          sourceTriangles += count;
          const error = joinError(selected, source, tile.geometricError), group = groups.get(key.id);
          if (group === undefined) groups.set(key.id, { key, geometries: [geometry], frame: source.frame, custom, error });
          else { group.geometries.push(geometry); group.error = Math.max(group.error, error); }
        } catch (error) { geometry.dispose(); throw error; }
      }
      for (const group of groups.values()) {
        const geometry = concatenate(group.geometries);
        try {
          for (const part of partitionSlabGeometry(geometry, tile.z * 8 + tile.x, group.frame, GEOMETRY_UPLOAD_BYTES, cell)) chunks.push({ key: group.key, part, custom: group.custom, error: group.error });
        } finally { geometry.dispose(); }
      }
      if (chunks.length === 0 || chunks.length > 64) throw new Error('Slab tile exceeds its chunk budget');
      const triangles = chunks.reduce((sum, chunk) => sum + chunk.part.triangles.length, 0);
      if (triangles !== sourceTriangles) throw new Error('Slab triangle partition differs');
      const packed = encodeFiles(tile.z * 8 + tile.x, chunks, assets); output.push({ tile: tile.z * 8 + tile.x, files: packed });
      report.push({ tile: tile.z * 8 + tile.x, sourceTriangles, triangles, chunks: chunks.length, files: packed.length,
        bytes: chunks.reduce((sum, chunk) => sum + chunk.part.bytes, 0), maxHeight: Math.max(...chunks.map(chunk => chunk.part.worldHeight)), maxTriangleHeight: Math.max(...chunks.map(chunk => chunk.part.maxTriangleHeight)) });
    } finally { for (const piece of staging) piece.geometry.dispose(); for (const group of groups.values()) for (const geometry of group.geometries) geometry.dispose(); for (const chunk of chunks) chunk.part.geometry.dispose(); }
  }
  const library = v.parse(WorldSceneSlabsSchema, { id: input.id, kind: 'slabs', of: input.library.id, keys: keys.map(entry => entry.key), tiles: output });
  return { library, assets, report };
}
