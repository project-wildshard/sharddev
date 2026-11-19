/**
 * ONE-FORMAT OF27a: hull books and rigged hulls become a build step. A rigged-hull body (a hull family's `*.rigged.glb`)
 * is fitted to a kit skeleton (`importCreatureGlb`: the skeleton's own bone names by default, or a chain map), and
 * written as a `platform.skin` GLB look: the skin file, the species row with `body.skeleton`, and its look row, the
 * same `SceneCreature` `world.creature` makes. Every vertex and weight is kept; only joint names and order change.
 *
 * OF27b, `look`: the look the hull book drew, as data. The hull's base and normal KTX2 maps become its skin material's
 * maps; each species variant gets its own skin file (its own hull where it has one, its baked coat as its colour map, its
 * fur's sheen, rim and glow) in the look's variant table; a generator flap is pressed into the hull at build. `pbr` is the
 * hull book's fur material (Pine: sheen, backlit rim, normal map), `painterly` the shard's painterly surface over the coat
 * (Nalati). The embedded images leave the rig: the maps are separate files the skin depends on.
 */
import type { CreatureBody, CreatureSkeleton } from '@wildshard/format/creatureLayers';
import type { RiggedHullFlap } from '@wildshard/format/riggedHulls';
import { readRigDocument, writeRigDocument } from './rig';
import { pressHullFlap } from './hullFlap';
import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import type { ShardRows } from '@wildshard/format/rows';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';
import { CREATURE_BONE_CAP } from '../creatureCaps';
import { creatureSkin, type CreatureBinding } from '../scene/creature';
import { importCreatureGlb, type CreatureChainMap } from '../scene/creatureImport';
import type { SceneCreature } from '../scene/description';

type SpeciesRow = ShardRows['species'][number];

/** The species' sim rows, its size and the skin's binding; the skeleton the rig is fitted to. */
export interface HullCreatureOptions {
  readonly species: Omit<SpeciesRow, 'id' | 'body'>;
  readonly size: CreatureBody['size'];
  readonly scale?: number;
  readonly skeleton: CreatureSkeleton;
  /** Source bone names per kit chain; omitted, the rig already uses the skeleton's own names. */
  readonly map?: CreatureChainMap;
  readonly loops?: CreatureBinding['loops'];
  /** The skin's material entry; with `look`, derived per variant instead. */
  readonly material?: CreatureBinding['material'];
  readonly materials?: CreatureBinding['materials'];
  readonly family?: 'toon' | 'pbr' | 'painterly';
  /** The attack clip's length in seconds, as the clips recipe samples it (default 1). */
  readonly attackSpan?: number;
  /** OF27b: the hull book's look (maps, coats, fur, flaps); with it, `material` is derived per variant. */
  readonly look?: HullLook;
}

type Rgb = readonly [number, number, number];
/** The hull book's fur numbers (engine `FurStyle`, linear colours): the species' own, a variant's override on top. */
export interface HullFur {
  readonly roughness: number; readonly sheen: number; readonly sheenColor: Rgb; readonly envMapIntensity: number; readonly rim: Rgb;
  readonly emissive?: Rgb; readonly emissiveIntensity?: number;
}
/** A hull's base colour and tangent-space normal map, KTX2 bytes. */
export interface HullMaps { readonly base: Uint8Array; readonly normal?: Uint8Array }
export type HullSurface = { readonly family: 'pbr'; readonly fur: HullFur } | { readonly family: 'painterly'; readonly rim: number; readonly bands: number };
/** One variant's own hull, maps, flap, baked coat (KTX2) and fur override; absent fields are the look's. */
export interface HullVariant {
  readonly rig?: Uint8Array; readonly maps?: HullMaps; readonly flap?: RiggedHullFlap; readonly coat?: Uint8Array; readonly fur?: Partial<HullFur>;
}
export interface HullLook {
  readonly maps: HullMaps;
  readonly surface: HullSurface;
  readonly flap?: RiggedHullFlap;
  readonly variants?: Readonly<Record<string, HullVariant>>;
}

const srgb = (c: number): number => Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
/** the hull book's fur material (engine `AnimalFactory`'s hull branch) as a PBR family entry */
function furMaterial(fur: HullFur, colour: string, normal: string | undefined): Record<string, unknown> {
  return { family: 'pbr', colour: [1, 1, 1], roughness: fur.roughness, metalness: 0, envStrength: fur.envMapIntensity,
    // eslint-disable-next-line unicorn/no-null -- a PBR entry names an absent map as null
    maps: { colour, normal: normal ?? null, orm: null }, normalScale: 1,
    sheen: { amount: Math.max(0.01, fur.sheen), colour: [...fur.sheenColor], roughness: 0.7 }, rim: [...fur.rim],
    ...(fur.emissive === undefined ? {} : { emissive: fur.emissive.map(srgb), emissiveIntensity: fur.emissiveIntensity ?? 1 }) };
}

/** the rig without its embedded images (its maps are separate files), with its generator flap pressed in */
async function hullRig(glb: Uint8Array, flap: RiggedHullFlap | undefined): Promise<Uint8Array> {
  const document = await readRigDocument(glb), root = document.getRoot();
  for (const material of root.listMaterials()) { material.setBaseColorTexture(null); material.setNormalTexture(null); material.setMetallicRoughnessTexture(null); material.setOcclusionTexture(null); material.setEmissiveTexture(null); }
  for (const texture of root.listTextures()) texture.dispose();
  if (flap !== undefined) for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), indices = primitive.getIndices();
    const pos = position?.getArray(), index = indices?.getArray();
    if (!(pos instanceof Float32Array) || normal === null || index === null || index === undefined) throw new Error('hull flap: float positions, normals and an index');
    // the normals as the loader reads them (a quantized channel dequantized, as the engine's `floatAttr` did)
    const p = pos.slice(), n = new Float32Array(normal.getCount() * 3), element: number[] = [];
    for (let i = 0; i < normal.getCount(); i++) { normal.getElement(i, element); n.set(element.slice(0, 3), i * 3); }
    if (pressHullFlap(p, n, index, flap) !== null) { position?.setArray(p); normal.setNormalized(false).setArray(n); }
  }
  for (const extension of root.listExtensionsUsed()) if (['KHR_texture_basisu', 'EXT_texture_webp'].includes(extension.extensionName)) extension.dispose();
  return writeRigDocument(document);
}

/** The look's files beside the default skin: every variant rig GLB, KTX2 map and skin file, and the variant table. */
export interface HullLookFiles {
  readonly glbs: readonly Uint8Array[];
  readonly textures: readonly Uint8Array[];
  readonly skins: readonly Uint8Array[];
  readonly table: Uint8Array;
}
export interface HullCreature extends SceneCreature { readonly files?: HullLookFiles }

/** A kit skeleton's chain map in its own names: a rig that already follows the contract maps to itself. */
export function kitChainMap(skeleton: CreatureSkeleton): CreatureChainMap {
  // A serpent's bones come from its trail row, so it has no fixed chain map (format 0.40.0 CC23).
  if (skeleton === 'serpent') throw new Error('chain root: a serpent has no kit chain map');
  const contract = CREATURE_SKELETONS[skeleton];
  return { root: contract.root, chains: Object.fromEntries(Object.entries(contract.chains).map(([key, chain]) => [key, [...chain.bones]])) };
}

/** Fit a rigged-hull GLB to a kit skeleton and write it as a skin look, its species row and its look row. */
export async function hullCreature(id: string, rig: Uint8Array, options: HullCreatureOptions): Promise<HullCreature> {
  if (options.look !== undefined) return lookedHull(id, rig, options, options.look);
  const imported = await importCreatureGlb(rig, { skeleton: options.skeleton, map: options.map ?? kitChainMap(options.skeleton) });
  if (imported.bones.length > CREATURE_BONE_CAP) throw new Error(`hull ${id}: ${imported.bones.length} bones, over the cap of ${CREATURE_BONE_CAP}`);
  if (options.material === undefined) throw new Error(`hull ${id}: a material, or a look`);
  const binding: CreatureBinding = { loops: options.loops ?? [], material: options.material,
    ...(options.materials === undefined ? {} : { materials: options.materials }) };
  const skin = creatureSkin(imported, { id, ...(options.family === undefined ? {} : { family: options.family }), binding });
  const bytes = new TextEncoder().encode(encodeCanonicalJson(skin));
  const lookId = `${id}.look`;
  const species: SpeciesRow = { ...options.species, id,
    body: { size: options.size, scale: options.scale ?? 1, look: lookId, skeleton: options.skeleton } };
  const look: ShardRows['looks'][number] = { id: lookId, species: id, recipe: 'platform.skin', material: null,
    parameters: { skin: hashImmutableBytes(bytes) }, animation: { recipe: 'platform.clips', parameters: { attackSpan: options.attackSpan ?? 1 } } };
  return { id, glb: imported.glb, skin: bytes, species, look, bones: imported.bones.length, triangles: parseGlb(imported.glb).triangles };
}

/** whether any primitive of a GLB carries COLOR_0 (the hull book drew a colourless hull white under its atlas) */
function carriesColour(glb: Uint8Array): boolean {
  const length = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length))) as { meshes?: { primitives: { attributes: Record<string, number> }[] }[] };
  return (doc.meshes ?? []).some((mesh) => mesh.primitives.some((primitive) => primitive.attributes['COLOR_0'] !== undefined));
}

/** OF27b: every variant's skin file, its rig, its maps and the variant table (the default skin is the first variant's). */
async function lookedHull(id: string, rig: Uint8Array, options: HullCreatureOptions, look: HullLook): Promise<HullCreature> {
  const variants = options.species.variants.map((variant) => variant.id), first = variants[0];
  if (first === undefined) throw new Error(`hull ${id}: a species with no variants`);
  for (const key of Object.keys(look.variants ?? {})) if (!variants.includes(key)) throw new Error(`hull ${id}: no species variant ${key}`);
  const rigs = new Map<string, Promise<Awaited<ReturnType<typeof importCreatureGlb>>>>(), textures = new Map<string, Uint8Array>();
  const texture = (bytes: Uint8Array): string => { const hash = hashImmutableBytes(bytes); textures.set(hash, bytes); return hash; };
  const made = await Promise.all(variants.map(async (variantId) => {
    const own = look.variants?.[variantId] ?? {}, source = own.rig ?? rig, flap = own.flap ?? (own.rig === undefined ? look.flap : undefined);
    const key = `${hashImmutableBytes(source)}:${JSON.stringify(flap ?? null)}`;
    let imported = rigs.get(key);
    if (imported === undefined) {
      imported = hullRig(source, flap).then((bytes) => importCreatureGlb(bytes, { skeleton: options.skeleton, map: options.map ?? kitChainMap(options.skeleton) }));
      rigs.set(key, imported);
    }
    const fitted = await imported;
    if (fitted.bones.length > CREATURE_BONE_CAP) throw new Error(`hull ${id}: ${fitted.bones.length} bones, over the cap of ${CREATURE_BONE_CAP}`);
    const maps = own.maps ?? look.maps, colour = texture(own.coat ?? maps.base), normal = maps.normal === undefined ? undefined : texture(maps.normal);
    const material = look.surface.family === 'pbr' ? furMaterial({ ...look.surface.fur, ...own.fur }, colour, normal)
      : { family: 'painterly', rim: look.surface.rim, bands: look.surface.bands, map: colour, vertexColours: carriesColour(fitted.glb) };
    const binding: CreatureBinding = { loops: options.loops ?? [], material };
    const skin = new TextEncoder().encode(encodeCanonicalJson(creatureSkin(fitted, { id, family: 'pbr', binding })));
    return { variantId, fitted, skin };
  }));
  const table = new TextEncoder().encode(encodeCanonicalJson({ version: 1, skins: Object.fromEntries(made.map((row) => [row.variantId, hashImmutableBytes(row.skin)])) }));
  const head = made[0];
  if (head === undefined) throw new Error(`hull ${id}: no skins`);
  const lookId = `${id}.look`;
  const species: SpeciesRow = { ...options.species, id,
    body: { size: options.size, scale: options.scale ?? 1, look: lookId, skeleton: options.skeleton } };
  const lookRow: ShardRows['looks'][number] = { id: lookId, species: id, recipe: 'platform.skin', material: null,
    parameters: { skin: hashImmutableBytes(head.skin), variants: hashImmutableBytes(table) },
    animation: { recipe: 'platform.clips', parameters: { attackSpan: options.attackSpan ?? 1 } } };
  const glbs = [...new Map(made.map((row) => [hashImmutableBytes(row.fitted.glb), row.fitted.glb])).values()];
  const skins = [...new Map(made.map((row) => [hashImmutableBytes(row.skin), row.skin])).values()];
  return { id, glb: head.fitted.glb, skin: head.skin, species, look: lookRow, bones: head.fitted.bones.length,
    triangles: parseGlb(head.fitted.glb).triangles, files: { glbs, textures: [...textures.values()], skins, table } };
}
