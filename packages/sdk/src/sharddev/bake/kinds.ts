import { Color, BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Matrix4, Material, NormalBlending, LessEqualDepth, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from 'three';
import { staticGlb, type GlbPrimitive } from './glb';
import { tileGridTransform, type TileGrid } from './worldGeometry';

/**
 * Build-time only (SHARD-PLATFORM SF72): a code-built world piece baked as instanced kinds. Each non-empty kind is one GLB
 * node (its geometry and EXT_mesh_gpu_instancing transforms, one draw each, never multi-draw); its row says how the client
 * draws it (`@wildshard/engine/game/shardfile/bakedKinds`). The colliders are the builder's own, as JSON keeps them (a `-0` yaw is
 * `0`, as the rows' JSON holds it). Promoted from Signal Dunes' baker; any shard's generators use it.
 */

/** A kind row's extra fields: plain JSON a shard's client reads back (a lit-by-fire flag, a named client material). */
export type KindExtra = Readonly<Record<string, string | number | boolean>>;
/** One baked instanced kind: the GLB node's name, its instance count and the material the client draws it in. */
export interface BakedKind {
  name: string; count: number; color: number; roughness: number; metalness: number; flat: boolean; emissive: number; emissiveIntensity: number;
  vertexColors: boolean; doubleSided: boolean;
  readonly [extra: string]: string | number | boolean;
}
/** A collider row as a piece declares it (the physics registry's descriptor shape); the bake keeps it as given. */
export interface KindCollider { readonly kind: string; readonly yaw?: number }
/** A piece's bake: the GLB bytes and its rows (`data/<piece>.json`, with the GLB's content hash). */
export interface PieceBake<C extends KindCollider = KindCollider> { glb: Uint8Array; kinds: BakedKind[]; colliders: C[] }

/** Optional immutable row metadata and custom vertex channels retained by the kind baker. */
export interface KindBakeOptions {
  /** Original typed channels in application accessors (see staticGlb); omitted preserves old bytes. */
  nativeAttributes?: true;
  /** Preserve float32 instance matrices and colours without a TRS round trip. */
  exactInstances?: true;
  /** Keep the original index type, including non-indexed shapes; omitted preserves old bytes. */
  compactIndex?: true;
  /** Plain application rows on each GLB node (source ordinals for exact library reconstruction). */
  nodeExtras?: (kind: string, mesh: InstancedMesh) => GlbPrimitive['extras'];
  /** The extra row fields a kind's material carries (a shard's own flags); equal extras are part of a kind's look. */
  extra?: (material: MeshStandardMaterial) => KindExtra;
  /** Custom vertex channels to keep, glTF semantic → geometry channel (`{ _SHK: 'shk' }`); a kind without the channel skips it. */
  attributes?: Readonly<Record<string, string>>;
  /** I3: a one-instance kind whose positions are already unnormalized Int16 on this grid (`gridPositions`): its node
   *  carries the instance times the grid's dequantizing transform and records the instance as its exact pose. */
  grid?: (kind: string, mesh: InstancedMesh) => TileGrid | undefined;
}

/** Colliders as the JSON rows keep them (a `-0` yaw is `0`). */
export const colliderRows = <C extends KindCollider>(colliders: readonly C[]): C[] => colliders.map((c) => c.yaw === 0 ? { ...c, yaw: 0 } : c);

const isInstancedMesh = (mesh: Mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh;

const custom = (geometry: BufferGeometry, attributes: Readonly<Record<string, string>> | undefined): Record<string, string> | undefined => {
  const kept = Object.entries(attributes ?? {}).filter(([, channel]) => geometry.hasAttribute(channel));
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
};

/** Bake named ordinary or instanced meshes into one GLB (`name` is its scene name, e.g. `sunscar.rocks`) and their kind rows. */
export function bakeKinds<C extends KindCollider>(name: string, meshes: readonly (readonly [string, Mesh])[], colliders: readonly C[], options: KindBakeOptions = {}): PieceBake<C> {
  const kinds: BakedKind[] = [], primitives: GlbPrimitive[] = [];
  for (const [kind, mesh] of meshes) {
    const instanced = isInstancedMesh(mesh), count = instanced ? mesh.count : 1;
    if (count === 0) continue;
    // The legacy byte path rejects tint; exact mode preserves the instance colour buffer.
    if (instanced && mesh.instanceColor !== null && options.exactInstances !== true) throw new Error(`${name}.${kind}: per-instance colours are not baked`);
    const instances = instanced ? Array.from({ length: count }, (_, i) => { const m = new Matrix4(); mesh.getMatrixAt(i, m); return m; }) : undefined;
    const instanceColours = instanced && options.exactInstances === true && mesh.instanceColor !== null ? Array.from({ length: count }, (_, i) => { const colour = new Color(); mesh.getColorAt(i, colour); return colour; }) : undefined;
    const material = Array.isArray(mesh.material) ? undefined : mesh.material;
    if (!(material instanceof MeshStandardMaterial) && !(material instanceof MeshBasicMaterial)) throw new Error(`${name}.${kind}: one standard or basic material per kind`);
    const nativeAttributes = instanced ? options.nativeAttributes : true, compactIndex = instanced ? options.compactIndex : true;
    if (material instanceof MeshBasicMaterial && instanced) throw new Error(`${name}.${kind}: unlit kinds require ordinary meshes`);
    if (!instanced && (material.transparent || material.opacity !== 1 || material.alphaTest !== 0 || material.wireframe || !material.depthTest || !material.depthWrite || !material.toneMapped || !material.fog)) throw new Error(`${name}.${kind}: unsupported ordinary material state`);
    if (!instanced) {
      if (mesh.type !== 'Mesh' || !mesh.visible || mesh.castShadow || mesh.receiveShadow || mesh.renderOrder !== 0 || mesh.layers.mask !== 1 || mesh.animations.length > 0 || Object.keys(mesh.geometry.morphAttributes).length > 0 || mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity) throw new Error(`${name}.${kind}: unsupported ordinary mesh state`);
      if (!['MeshStandardMaterial', 'MeshBasicMaterial'].includes(material.type) || !material.colorWrite || material.blending !== NormalBlending || material.depthFunc !== LessEqualDepth || material.alphaHash || material.alphaToCoverage || material.premultipliedAlpha || material.dithering || material.polygonOffset || material.stencilWrite || material.clippingPlanes !== null || material.precision !== null || material.side !== 0 && material.side !== DoubleSide) throw new Error(`${name}.${kind}: unsupported ordinary material state`);
      if (material.onBeforeCompile !== Material.prototype.onBeforeCompile) throw new Error(`${name}.${kind}: material callbacks are runtime code`);
      for (const [channel, attribute] of Object.entries(mesh.geometry.attributes)) {
        if (!['position', 'normal', 'color', 'uv', 'tangent'].includes(channel) || !(attribute instanceof BufferAttribute) || !(attribute.array instanceof Float32Array) || attribute.normalized) throw new Error(`${name}.${kind}: ordinary kinds require portable float32 channels`);
      }
      if (material.aoMap !== null || material.lightMap !== null || material.envMap !== null || (material instanceof MeshBasicMaterial && material.specularMap !== null)
        || (material instanceof MeshStandardMaterial && (material.emissiveMap !== null || material.bumpMap !== null || material.displacementMap !== null))) throw new Error(`${name}.${kind}: textures must be external KTX2 declarations`);
    }
    mesh.updateWorldMatrix(true, false);
    const explicit = custom(mesh.geometry, options.attributes);
    const automatic = nativeAttributes === true ? Object.fromEntries(Object.keys(mesh.geometry.attributes)
      .filter(key => !['position', 'normal', 'color', 'uv', 'tangent'].includes(key) && !Object.values(explicit ?? {}).includes(key))
      .map((key, index) => [`_WS_CHANNEL_${index}`, key])) : undefined;
    const customAttributes = automatic === undefined ? explicit : { ...automatic, ...explicit };
    const extras = instanced ? options.nodeExtras?.(kind, mesh) : undefined;
    const grid = instanced ? options.grid?.(kind, mesh) : undefined;
    if (grid !== undefined && (instances?.length !== 1 || instances[0] === undefined || instanceColours !== undefined)) throw new Error(`${name}.${kind}: a gridded kind has exactly one instance`);
    const placement = grid === undefined || instances?.[0] === undefined ? (instances === undefined ? { transform: mesh.matrixWorld } : { instances })
      : { transform: instances[0].clone().multiply(tileGridTransform(grid)), pose: instances[0], meshoptReady: true as const, quantizedChannels: true as const, nativeOnce: true as const };
    primitives.push({ geometry: mesh.geometry, material, ...placement, castShadow: false,
      ...(!instanced || grid !== undefined || options.exactInstances === undefined ? {} : { exactInstances: options.exactInstances }),
      ...(instanceColours === undefined ? {} : { instanceColours }),
      ...(nativeAttributes === undefined ? {} : { nativeAttributes }),
      ...(compactIndex === undefined ? {} : { compactIndex }),
      ...(extras === undefined ? {} : { extras }),
      ...(customAttributes === undefined ? {} : { customAttributes }) });
    kinds.push({ name: kind, count, color: material.color.getHex(), roughness: material instanceof MeshStandardMaterial ? material.roughness : 1, metalness: material instanceof MeshStandardMaterial ? material.metalness : 0, flat: material instanceof MeshStandardMaterial && material.flatShading,
      emissive: material instanceof MeshStandardMaterial ? material.emissive.getHex() : 0, emissiveIntensity: material instanceof MeshStandardMaterial ? material.emissiveIntensity : 1, vertexColors: material.vertexColors, doubleSided: material.side === DoubleSide,
      ...(material instanceof MeshStandardMaterial ? options.extra?.(material) : {}),
      ...(instanced ? {} : { mesh: true, colorR: material.color.r, colorG: material.color.g, colorB: material.color.b,
        ...(material instanceof MeshStandardMaterial ? { emissiveR: material.emissive.r, emissiveG: material.emissive.g, emissiveB: material.emissive.b } : {}) }),
      ...(material instanceof MeshBasicMaterial ? { unlit: true } : {}) });
  }
  return { glb: staticGlb(primitives, name), kinds, colliders: colliderRows(colliders) };
}

/** A material's look as the kind rows keep it: meshes in equal-looking materials share a kind. */
const look = (m: MeshStandardMaterial, extra: KindBakeOptions['extra']): string => JSON.stringify([m.color.getHex(), m.roughness, m.metalness, m.flatShading, m.emissive.getHex(),
  m.emissiveIntensity, m.vertexColors, m.side, extra?.(m) ?? {}]);
/** A geometry's shape: a box is the unit box (its size goes in the instance's scale); a parametric one by its parameters. */
const shape = (g: BufferGeometry): string => g instanceof BoxGeometry ? 'box' : 'parameters' in g ? `${g.type}${JSON.stringify(g.parameters)}` : g.uuid;

const isGeometry = (g: unknown): g is BufferGeometry => g instanceof BufferGeometry;

/**
 * A built group's meshes folded into instanced kinds, in first-seen order: every box of one look becomes an instance of
 * one unit box (its size in the instance's scale, the same vertices); any other geometry is one kind per shape and look.
 * Every instance keeps its mesh's world transform. Kinds are named `<n>-<geometry type>`.
 */
export function foldKinds(root: Object3D, options: Pick<KindBakeOptions, 'extra'> = {}): (readonly [string, InstancedMesh])[] {
  root.updateMatrixWorld(true);
  const unit = new BoxGeometry(1, 1, 1), groups = new Map<string, { geometry: BufferGeometry; material: MeshStandardMaterial; matrices: Matrix4[] }>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const material: unknown = node.material, geometry: unknown = node.geometry;
    if (!(material instanceof MeshStandardMaterial) || !isGeometry(geometry)) throw new Error('fold: one standard material per mesh');
    const key = `${shape(geometry)}|${look(material, options.extra)}`, matrix = node.matrixWorld.clone();
    if (geometry instanceof BoxGeometry) matrix.multiply(new Matrix4().makeScale(geometry.parameters.width, geometry.parameters.height, geometry.parameters.depth));
    const group = groups.get(key) ?? { geometry: geometry instanceof BoxGeometry ? unit : geometry, material, matrices: [] };
    group.matrices.push(matrix); groups.set(key, group);
  });
  return [...groups.values()].map((group, n) => {
    const mesh = new InstancedMesh(group.geometry, group.material, group.matrices.length);
    group.matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); });
    return [`${String(n)}-${group.geometry.type}`, mesh] as const;
  });
}
