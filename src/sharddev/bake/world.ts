import { WebIO, type Accessor, type Material, type Primitive, type Texture, type TextureInfo } from '@gltf-transform/core';
import { Matrix3, Matrix4, Vector3 } from 'three';
import { CELL_ABOVE, CELL_BELOW, CHUNK_HALF } from '@wildshard/format/contentBounds';
import { parseWorldSource } from '../worldSource';
import { hashImmutableBytes } from '../immutable';
import { preflightWorldGlb } from './worldGlb';
import { worldImageInfo } from './worldImage';

/** Retained embedded raster input; the later pinned encoder owns its KTX2 conversion. */
export interface WorldImage { hash: string; mime: string; width: number; height: number; bytes: Uint8Array }
/** A material texture use preserves UV0 and sampler data rather than copying pixels into vertex colours. */
export interface WorldTexture {
  image: string; wrapS: number; wrapT: number; minFilter: number | null; magFilter: number | null;
  /** Authored Three texture intake only: raster rows must be flipped before encoding when true. glTF defaults false. */
  flipY?: boolean;
  /** Original sampler anisotropy; absent preserves the glTF default of one. */
  anisotropy?: number;
  /** Original atlas extent, when captured from a live authored producer. No crop/repack is permitted. */
  width?: number; height?: number;
}
/** Source glTF metallic/roughness surface with every supported texture slot and its explicit output material ID. */
export interface WorldMaterial {
  name: string; id: string; colour: number[]; metalness: number; roughness: number; emissive: number[];
  alpha: string; alphaCutoff: number; doubleSided: boolean; normalScale: number; occlusion: number;
  maps: { colour: WorldTexture | null; normal: WorldTexture | null; metallicRoughness: WorldTexture | null; occlusion: WorldTexture | null; emissive: WorldTexture | null };
}
/** Indexed triangle topology, world-local for static geometry and panel-root-local for interactive geometry. */
export interface WorldPrimitive {
  node: string; objectId: string | null; material: number; terrain: boolean;
  positions: Float64Array; normals: Float32Array | null; colours: Float32Array | null; uv: Float32Array | null; tangents: Float32Array | null; indices: Uint32Array;
}
/** Config-selected panel root, its exact world transform and independent local collision/render triangles. */
export interface WorldPanel { id: string; colliderId: string; node: string; transform: number[]; primitives: WorldPrimitive[] }
/** Fully normalized, memory-only build input; no GLB node is silently omitted or converted to a heightfield.
 *  `undrawn`: the collision primitives under the source's `undrawn` prefix (a baked-tiles row draws them); `far`: the
 *  primitives under its `far` prefix (only the far proxy draws them; they never collide). RM8.2 `detail`: the static
 *  primitives under its `detail` prefix (also in `static`, drawn only at L0); `coarse`: those under its `coarse` prefix
 *  (only the L1 tiles draw them; they never collide). */
export interface NormalizedWorld { static: WorldPrimitive[]; collision: WorldPrimitive[]; undrawn: WorldPrimitive[]; far: WorldPrimitive[]; detail: WorldPrimitive[]; coarse: WorldPrimitive[]; panels: WorldPanel[]; materials: WorldMaterial[]; images: WorldImage[] }

function samples(accessor: Accessor, width: number, count: number): Float32Array {
  if (accessor.getElementSize() !== width || accessor.getCount() !== count) throw new Error('World GLB mismatched attribute shape');
  const values = new Float32Array(width * count), row: number[] = [];
  for (let i = 0; i < count; i++) {
    accessor.getElement(i, row);
    if (row.some((value) => !Number.isFinite(value))) throw new Error('World GLB nonfinite attribute');
    values.set(row, i * width);
  }
  return values;
}
function geometry(primitive: Primitive, matrix: Matrix4, world: Matrix4, node: string, material: number, objectId: string | null, terrain: boolean): WorldPrimitive {
  const position = primitive.getAttribute('POSITION');
  if (position?.getType() !== 'VEC3' || position.getComponentType() !== 5126 || position.getCount() === 0 || position.getCount() > 4_000_000) throw new Error(`World GLB node ${node} needs bounded float positions`);
  if (primitive.listSemantics().some((semantic) => !['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0', 'TANGENT'].includes(semantic))) throw new Error(`World GLB node ${node} has unsupported vertex attributes`);
  const n = position.getCount(), source = samples(position, 3, n), positions = new Float64Array(n * 3), normalMatrix = new Matrix3().getNormalMatrix(matrix), mirrored = matrix.determinant() < 0;
  for (let i = 0; i < n; i++) {
    const point = new Vector3().fromArray(source, i * 3), placed = point.clone().applyMatrix4(world);
    if (![placed.x, placed.y, placed.z].every(Number.isFinite) || Math.abs(placed.x) > CHUNK_HALF || Math.abs(placed.z) > CHUNK_HALF || placed.y < -CELL_BELOW || placed.y > CELL_ABOVE) throw new Error(`World GLB node ${node} lies outside the cell`);
    point.applyMatrix4(matrix); positions.set(point.toArray(), i * 3);
  }
  const attribute = (semantic: string, width: number) => {
    const value = primitive.getAttribute(semantic);
    if (value === null) return null;
    if (value.getComponentType() !== 5126 && (semantic !== 'TEXCOORD_0' || !value.getNormalized() || ![5121, 5123].includes(value.getComponentType()))) throw new Error(`World GLB node ${node} has unsupported ${semantic} encoding`);
    return samples(value, width, n);
  };
  const normals = attribute('NORMAL', 3), uv = attribute('TEXCOORD_0', 2), colour = primitive.getAttribute('COLOR_0');
  const colours = colour === null ? null : samples(colour, colour.getElementSize(), n), tangents = attribute('TANGENT', 4);
  if (colours !== null && (colour === null || ![3, 4].includes(colour.getElementSize()) || (colour.getComponentType() !== 5126 && (!colour.getNormalized() || ![5121, 5123].includes(colour.getComponentType()))) || colours.some((value) => value < 0 || value > 1))) throw new Error(`World GLB node ${node} needs RGB/RGBA colours`);
  if (normals !== null) for (let i = 0; i < n; i++) {
    const normal = new Vector3().fromArray(normals, i * 3).applyMatrix3(normalMatrix);
    if (normal.lengthSq() === 0 || ![normal.x, normal.y, normal.z].every(Number.isFinite)) throw new Error(`World GLB node ${node} has a zero or nonfinite normal`);
    normals.set(normal.normalize().toArray(), i * 3);
  }
  if (tangents !== null) for (let i = 0; i < n; i++) {
    const tangent = new Vector3().fromArray(tangents, i * 4).transformDirection(matrix);
    if (normals === null || Math.abs(tangents[i * 4 + 3] ?? 0) !== 1) throw new Error(`World GLB node ${node} needs normals and signed tangents`);
    const normal = new Vector3().fromArray(normals, i * 3); tangent.addScaledVector(normal, -tangent.dot(normal));
    if (tangent.lengthSq() === 0) throw new Error(`World GLB node ${node} has a degenerate tangent`);
    tangents.set(tangent.normalize().toArray(), i * 4); tangents[i * 4 + 3] = (tangents[i * 4 + 3] ?? 1) * (mirrored ? -1 : 1);
  }
  const index = primitive.getIndices();
  if (index !== null && (index.getType() !== 'SCALAR' || ![5121, 5123, 5125].includes(index.getComponentType()) || index.getNormalized())) throw new Error(`World GLB node ${node} has unsupported triangle indices`);
  const count = index?.getCount() ?? n;
  if (count === 0 || count % 3 !== 0 || count > 12_000_000) throw new Error(`World GLB node ${node} triangle cap`);
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) { const at = index?.getScalar(i) ?? i; if (!Number.isInteger(at) || at < 0 || at >= n) throw new Error(`World GLB node ${node} index outside positions`); indices[i] = at; }
  if (mirrored) for (let i = 0; i < count; i += 3) { const a = indices[i + 1] ?? 0; indices[i + 1] = indices[i + 2] ?? 0; indices[i + 2] = a; }
  return { node, objectId, material, terrain, positions, normals, colours, uv, tangents, indices };
}

/** Normalize one embedded static world GLB without files, renderer allocation, baking or platform collision. */
export async function normalizeWorldGlb(bytes: Uint8Array, input: unknown, materialIds: readonly string[]): Promise<NormalizedWorld> {
  const source = parseWorldSource(input), intake = preflightWorldGlb(bytes);
  // The binary view requires aligned input; the caller retains its bytes unchanged.
  const document = await new WebIO().readBinary(Uint8Array.from(bytes)), root = document.getRoot(), nodes = root.listNodes();
  if (nodes.length !== intake.matrices.length) throw new Error('World GLB node inventory changed during decode');
  const byName = new Map<string, number>();
  nodes.forEach((node, index) => { const name = node.getName(); if (name !== '') { if (byName.has(name)) throw new Error(`World GLB duplicate node name ${name}`); byName.set(name, index); } });
  const images: WorldImage[] = [], imageHashes = new Map<Texture, string>();
  for (const texture of root.listTextures()) {
    const image = texture.getImage(), mime = texture.getMimeType();
    if (image === null) throw new Error(`World GLB image ${texture.getName()} has missing bytes`);
    const info = await worldImageInfo(image);
    if (info.mime !== mime) throw new Error(`World GLB image ${texture.getName()} has mismatched bytes`);
    const size: [number, number] = [info.width, info.height];
    const hash = hashImmutableBytes(image); imageHashes.set(texture, hash);
    if (!images.some((entry) => entry.hash === hash)) images.push({ hash, mime, width: size[0], height: size[1], bytes: Uint8Array.from(image) });
  }
  const textureUse = (texture: Texture | null, info: TextureInfo | null): WorldTexture | null => {
    if (texture === null) return null;
    const image = imageHashes.get(texture);
    if (image === undefined || info?.getTexCoord() !== 0) throw new Error('World GLB textures require embedded images and UV0');
    const sampler = { image, wrapS: info.getWrapS(), wrapT: info.getWrapT(), minFilter: info.getMinFilter(), magFilter: info.getMagFilter() };
    if (![33071, 33648, 10497].includes(sampler.wrapS) || ![33071, 33648, 10497].includes(sampler.wrapT) || (sampler.minFilter !== null && ![9728, 9729, 9984, 9985, 9986, 9987].includes(sampler.minFilter)) || (sampler.magFilter !== null && ![9728, 9729].includes(sampler.magFilter))) throw new Error('World GLB unsupported texture sampler');
    return sampler;
  };
  const materials: WorldMaterial[] = [], materialIndices = new Map<Material, number>();
  for (const material of root.listMaterials()) {
    const name = material.getName(), id = source.materials[name];
    if (materials.some((row) => row.name === name)) throw new Error(`World GLB duplicate material name ${name}`);
    if (id === undefined || !materialIds.includes(id)) throw new Error(`World GLB material ${name || '(unnamed)'} is unmapped or its output ID is not admitted`);
    const row: WorldMaterial = { name, id, colour: material.getBaseColorFactor(), metalness: material.getMetallicFactor(), roughness: material.getRoughnessFactor(), emissive: material.getEmissiveFactor(), alpha: material.getAlphaMode(), alphaCutoff: material.getAlphaCutoff(), doubleSided: material.getDoubleSided(), normalScale: material.getNormalScale(), occlusion: material.getOcclusionStrength(), maps: {
      colour: textureUse(material.getBaseColorTexture(), material.getBaseColorTextureInfo()), normal: textureUse(material.getNormalTexture(), material.getNormalTextureInfo()), metallicRoughness: textureUse(material.getMetallicRoughnessTexture(), material.getMetallicRoughnessTextureInfo()), occlusion: textureUse(material.getOcclusionTexture(), material.getOcclusionTextureInfo()), emissive: textureUse(material.getEmissiveTexture(), material.getEmissiveTextureInfo()),
    } };
    if (![...row.colour, row.metalness, row.roughness, ...row.emissive, row.occlusion, row.alphaCutoff].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || !Number.isFinite(row.normalScale) || typeof row.doubleSided !== 'boolean' || !['OPAQUE', 'MASK', 'BLEND'].includes(row.alpha)) throw new Error(`World GLB material ${name} has unsupported factors`);
    materialIndices.set(material, materials.length); materials.push(row);
  }
  for (const name of Object.keys(source.materials)) if (!materials.some((row) => row.name === name)) throw new Error(`World GLB material mapping ${name} has no source material`);
  const selected = (name: string): number => { const id = byName.get(name); if (id === undefined) throw new Error(`World GLB selected node ${name} is missing`); return id; };
  const panelRoots = source.interactive.map((row) => selected(row.node)), stableRoots = Object.keys(source.objects).map(selected);
  const ancestry = (id: number): number[] => { const result = [id]; let parent = intake.parents[id]; while (parent !== undefined) { result.push(parent); parent = intake.parents[parent]; } return result; };
  const ownedRoots = [...panelRoots, ...stableRoots];
  if (ownedRoots.some((id) => ancestry(id).slice(1).some((parent) => ownedRoots.includes(parent)))) throw new Error('World GLB selected object/interactive hierarchies overlap');
  const panels: WorldPanel[] = source.interactive.map((row, i) => ({ ...row, transform: [...(intake.matrices[panelRoots[i] ?? -1]?.elements ?? [])], primitives: [] }));
  const collisionPrefix = source.colliders === 'mesh' ? null : source.colliders.slice(6), collisionRoots = nodes.flatMap((node, index) => collisionPrefix !== null && node.getName().startsWith(collisionPrefix) ? [index] : []);
  if (collisionPrefix !== null && collisionRoots.length === 0) throw new Error(`World GLB collision prefix ${collisionPrefix} matches no nodes`);
  if (collisionRoots.some((id) => ancestry(id).some((parent) => panelRoots.includes(parent))) || panelRoots.some((id) => ancestry(id).some((parent) => collisionRoots.includes(parent)))) throw new Error('World GLB collision-only and interactive hierarchies overlap');
  const normalized: NormalizedWorld = { static: [], collision: [], undrawn: [], far: [], detail: [], coarse: [], panels, materials, images }, undrawnPrefix = source.undrawn, farPrefix = source.far;
  const detailPrefix = source.detail, coarsePrefix = source.coarse, under = (chain: number[], prefix: string | undefined) => prefix !== undefined && chain.some((ancestor) => nodes[ancestor]?.getName().startsWith(prefix));
  let vertices = 0, indices = 0;
  nodes.forEach((node, id) => {
    const mesh = node.getMesh(); if (mesh === null) return;
    const chain = ancestry(id), panelIndex = panelRoots.findIndex((panel) => chain.includes(panel)), panel = panels[panelIndex], world = intake.matrices[id];
    if (world === undefined || node.getName() === '') throw new Error(`World GLB mesh node ${id} needs a unique name`);
    const matrix = panel === undefined ? world : new Matrix4().fromArray(panel.transform).invert().multiply(world);
    const owner = stableRoots.find((selectedId) => chain.includes(selectedId)), objectId = owner === undefined ? null : source.objects[nodes[owner]?.getName() ?? ''] ?? null;
    const collisionOnly = chain.some((ancestor) => collisionRoots.includes(ancestor)), terrain = chain.some((ancestor) => nodes[ancestor]?.getName().startsWith('ws_terrain'));
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial(), materialIndex = material === null ? undefined : materialIndices.get(material);
      if (materialIndex === undefined) throw new Error(`World GLB node ${node.getName()} lacks a mapped material`);
      vertices += primitive.getAttribute('POSITION')?.getCount() ?? 0; indices += primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
      if (vertices > 4_000_000 || indices > 12_000_000) throw new Error('World GLB expanded geometry cap');
      const output = geometry(primitive, matrix, world, node.getName(), materialIndex, panel?.id ?? objectId, terrain);
      const maps = materials[materialIndex]?.maps;
      if (maps !== undefined && Object.values(maps).some((map) => map !== null) && output.uv === null) throw new Error(`World GLB textured node ${node.getName()} needs UV0`);
      if (panel !== undefined) panel.primitives.push(output);
      else if (collisionOnly) normalized.collision.push(output);
      else if (farPrefix !== undefined && chain.some((ancestor) => nodes[ancestor]?.getName().startsWith(farPrefix))) normalized.far.push(output);
      else if (under(chain, coarsePrefix)) normalized.coarse.push(output);
      else if (undrawnPrefix !== undefined && chain.some((ancestor) => nodes[ancestor]?.getName().startsWith(undrawnPrefix))) { normalized.undrawn.push(output); normalized.collision.push(output); }
      else { normalized.static.push(output); if (under(chain, detailPrefix)) normalized.detail.push(output); if (collisionPrefix === null) normalized.collision.push(output); }
    }
  });
  if (undrawnPrefix !== undefined && normalized.undrawn.length === 0) throw new Error(`World GLB undrawn prefix ${undrawnPrefix} matches no meshes`);
  if (farPrefix !== undefined && normalized.far.length === 0) throw new Error(`World GLB far prefix ${farPrefix} matches no meshes`);
  if (detailPrefix !== undefined && normalized.detail.length === 0) throw new Error(`World GLB detail prefix ${detailPrefix} matches no meshes`);
  if (coarsePrefix !== undefined && normalized.coarse.length === 0) throw new Error(`World GLB coarse prefix ${coarsePrefix} matches no meshes`);
  if (normalized.static.length === 0 || normalized.collision.length === 0 || panels.some((panel) => panel.primitives.length === 0)) throw new Error('World GLB needs static render geometry, selected collision geometry and nonempty interactive panels');
  for (const name of Object.keys(source.objects)) if (![...normalized.static, ...normalized.collision].some((primitive) => primitive.objectId === source.objects[name])) throw new Error(`World GLB selected object ${name} has no geometry`);
  images.sort((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
  return normalized;
}
