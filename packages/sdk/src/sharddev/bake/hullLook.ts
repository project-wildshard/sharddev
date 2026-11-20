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
 *
 * OF27c, `parts`: a variant's rigid parts (Pine's thrall extras, the hull book's `RiggedHullUrls.parts`) join its rig as
 * two more primitives on the hull's bones, drawn in their own colour by the look materials `<id>.parts` and (glowing, as
 * the hull book's `aOvergrown` glow) `<id>.parts.glow` through the skin binding's `materials`. A variant table shares one
 * material contract, so every variant of a look with parts has its own.
 */
import type { CreatureBody, CreatureSkeleton } from '@wildshard/format/creatureLayers';
import type { RiggedHullFlap } from '@wildshard/format/riggedHulls';
import type { Document, TypedArray } from '@gltf-transform/core';
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
/** OF27c: one node of a parts GLB whose primitive carries POSITION, NORMAL, TEXCOORD_0, COLOR_0, `_BONE` (the hull's
 * joint index) and `_GLOW` (0 or 1): the hull book's rigid parts for one variant. */
export interface HullParts { readonly glb: Uint8Array; readonly node: string }
/** One variant's own hull, maps, flap, baked coat (KTX2), fur override and rigid parts; absent fields are the look's. */
export interface HullVariant {
  readonly rig?: Uint8Array; readonly maps?: HullMaps; readonly flap?: RiggedHullFlap; readonly coat?: Uint8Array; readonly fur?: Partial<HullFur>;
  readonly parts?: HullParts;
}
/** OF23f: one variant's phone hull and maps; a desktop variant with its own coat or maps needs its phone ones. */
export interface HullPhoneVariant { readonly rig?: Uint8Array; readonly maps?: HullMaps; readonly coat?: Uint8Array }
/** OF23f: the phone tier of a looked hull: a lighter rig (default: the desktop one), its maps, and each variant's own.
 *  Flaps, fur and parts are the desktop variant's: a phone skin keeps its variant's rig and material contract. */
export interface HullPhone {
  readonly rig?: Uint8Array;
  readonly maps: HullMaps;
  readonly variants?: Readonly<Record<string, HullPhoneVariant>>;
}
export interface HullLook {
  readonly maps: HullMaps;
  readonly surface: HullSurface;
  readonly flap?: RiggedHullFlap;
  readonly variants?: Readonly<Record<string, HullVariant>>;
  /** OF23f: the phone tier's skins (`phone` and `phoneVariants` on the look row); without it the look is untiered. */
  readonly phone?: HullPhone;
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

type PartKind = 'parts' | 'parts.glow';
/** OF27c: the parts node's triangles as two primitives on the hull's skinned mesh, rigid on their `_BONE` joint: `parts`
 * and `parts.glow` (a triangle glows where its first vertex does). The hull's own primitives take a white colour channel
 * so the merged skin carries one set of channels. Returns the GLB material names it added. */
async function addHullParts(document: Document, parts: HullParts): Promise<PartKind[]> {
  const node = (await readRigDocument(parts.glb)).getRoot().listNodes().find((value) => value.getName() === parts.node);
  const source = node?.getMesh()?.listPrimitives()[0];
  if (source === undefined) throw new Error(`hull parts: no node ${parts.node}`);
  const read = (name: string, size: number): Float32Array => {
    const accessor = source.getAttribute(name);
    if (accessor === null) throw new Error(`hull parts ${parts.node}: no ${name}`);
    const out = new Float32Array(accessor.getCount() * size), element: number[] = [];
    for (let i = 0; i < accessor.getCount(); i++) { accessor.getElement(i, element); out.set(element.slice(0, size), i * size); }
    return out;
  };
  const channels = { POSITION: read('POSITION', 3), NORMAL: read('NORMAL', 3), TEXCOORD_0: read('TEXCOORD_0', 2), COLOR_0: read('COLOR_0', 3) };
  const bone = read('_BONE', 1), glow = read('_GLOW', 1), count = bone.length;
  const index = source.getIndices()?.getArray() ?? Uint32Array.from({ length: count }, (_, i) => i);
  const root = document.getRoot(), mesh = root.listNodes().find((value) => value.getSkin() !== null && value.getMesh() !== null)?.getMesh();
  const buffer = root.listBuffers()[0];
  if (mesh === null || mesh === undefined || buffer === undefined) throw new Error('hull parts: a skinned hull mesh');
  const accessor = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', array: TypedArray) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  for (const primitive of mesh.listPrimitives()) if (primitive.getAttribute('COLOR_0') === null) {
    primitive.setAttribute('COLOR_0', accessor('VEC3', new Float32Array((primitive.getAttribute('POSITION')?.getCount() ?? 0) * 3).fill(1)));
  }
  const added: PartKind[] = [];
  for (const kind of ['parts', 'parts.glow'] as const) {
    const remap = new Map<number, number>(), triangles: number[] = [];
    for (let t = 0; t + 2 < index.length; t += 3) {
      if (((glow[index[t] ?? 0] ?? 0) >= 0.5) !== (kind === 'parts.glow')) continue;
      for (let k = 0; k < 3; k++) { const v = index[t + k] ?? 0; let at = remap.get(v); if (at === undefined) { at = remap.size; remap.set(v, at); } triangles.push(at); }
    }
    if (triangles.length === 0) continue;
    const used = [...remap.keys()], take = (from: Float32Array, size: number): Float32Array<ArrayBuffer> => {
      const out = new Float32Array(used.length * size);
      used.forEach((v, i) => { out.set(from.subarray(v * size, v * size + size), i * size); });
      return out;
    };
    const joints = new Uint16Array(used.length * 4), weights = new Float32Array(used.length * 4);
    used.forEach((v, i) => { joints[i * 4] = Math.round(bone[v] ?? 0); weights[i * 4] = 1; });
    const material = document.createMaterial(kind).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
    const primitive = document.createPrimitive().setMaterial(material).setIndices(accessor('SCALAR', Uint32Array.from(triangles)))
      .setAttribute('POSITION', accessor('VEC3', take(channels.POSITION, 3))).setAttribute('NORMAL', accessor('VEC3', take(channels.NORMAL, 3)))
      .setAttribute('TEXCOORD_0', accessor('VEC2', take(channels.TEXCOORD_0, 2))).setAttribute('COLOR_0', accessor('VEC3', take(channels.COLOR_0, 3)))
      .setAttribute('JOINTS_0', accessor('VEC4', joints)).setAttribute('WEIGHTS_0', accessor('VEC4', weights));
    mesh.addPrimitive(primitive);
    added.push(kind);
  }
  return added;
}

/** OF27c: the look materials a look's parts draw with: their own vertex colour under the hull's fur sheen and rim, and the
 * hull book's overgrown glow (linear (0.45, 0.95, 1.1) x 2.6) on the glowing ones. */
function partMaterials(id: string, kinds: readonly PartKind[], fur: HullFur): Record<string, Record<string, unknown>> {
  const plain = { family: 'pbr', colour: [1, 1, 1], vertexColours: true, roughness: fur.roughness, metalness: 0, envStrength: fur.envMapIntensity,
    sheen: { amount: Math.max(0.01, fur.sheen), colour: [...fur.sheenColor], roughness: 0.7 }, rim: [...fur.rim] };
  return Object.fromEntries(kinds.map((kind) => [`${id}.${kind}`, kind === 'parts' ? plain
    : { ...plain, emissive: [0.45 / 1.1, 0.95 / 1.1, 1].map(srgb), emissiveIntensity: 2.6 * 1.1 }]));
}

/** the rig without its embedded images (its maps are separate files), with its generator flap pressed in */
async function hullRig(glb: Uint8Array, flap: RiggedHullFlap | undefined, parts?: HullParts): Promise<{ glb: Uint8Array; parts: PartKind[] }> {
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
  const added = parts === undefined ? [] : await addHullParts(document, parts);
  return { glb: await writeRigDocument(document), parts: added };
}

/** The look's files beside the default skin: every variant rig GLB, KTX2 map and skin file, and the variant table. */
export interface HullLookFiles {
  readonly glbs: readonly Uint8Array[];
  readonly textures: readonly Uint8Array[];
  readonly skins: readonly Uint8Array[];
  readonly table: Uint8Array;
  /** OF23f: the phone variant table (its skins, rigs and maps are in the lists above). */
  readonly phoneTable?: Uint8Array;
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

/** one variant's baked skin: its fitted rig, the skin file and the parts it carries */
interface Baked { readonly variantId: string; readonly fitted: Awaited<ReturnType<typeof importCreatureGlb>>; readonly skin: Uint8Array; readonly parts: PartKind[] }

/** OF23f: a variant's phone hull and maps. A desktop variant with its own hull keeps it unless the phone names one; a
 *  variant with its own coat or maps must name its phone coat or maps (a phone skin is never the desktop's art). */
function phoneMesh(id: string, { rig, look, variantId }: { rig: Uint8Array; look: HullLook; variantId: string }): { source: Uint8Array; maps: HullMaps; coat: Uint8Array | undefined } {
  const phone = look.phone, own = look.variants?.[variantId] ?? {}, mine = phone?.variants?.[variantId] ?? {};
  if (phone === undefined) throw new Error(`hull ${id}: no phone look`);
  if ((own.coat !== undefined || own.maps !== undefined) && mine.coat === undefined && mine.maps === undefined)
    throw new Error(`hull ${id}: phone variant ${variantId} needs its own coat or maps`);
  return { source: mine.rig ?? own.rig ?? phone.rig ?? rig, maps: mine.maps ?? phone.maps, coat: mine.coat };
}

/** OF27b: every variant's skin file, its rig, its maps and the variant table (the default skin is the first variant's). */
async function lookedHull(id: string, rig: Uint8Array, options: HullCreatureOptions, look: HullLook): Promise<HullCreature> {
  const variants = options.species.variants.map((variant) => variant.id), first = variants[0];
  if (first === undefined) throw new Error(`hull ${id}: a species with no variants`);
  for (const key of Object.keys(look.variants ?? {})) if (!variants.includes(key)) throw new Error(`hull ${id}: no species variant ${key}`);
  const withParts = variants.filter((variantId) => look.variants?.[variantId]?.parts !== undefined);
  if (withParts.length > 0 && withParts.length !== variants.length)
    throw new Error(`hull ${id}: a variant table shares one material contract, so parts go on every variant (give ${withParts.join(', ')} its own species)`);
  if (withParts.length > 0 && look.surface.family !== 'pbr') throw new Error(`hull ${id}: parts draw under a pbr fur surface`);
  const rigs = new Map<string, Promise<{ imported: Awaited<ReturnType<typeof importCreatureGlb>>; parts: PartKind[] }>>(), textures = new Map<string, Uint8Array>();
  const texture = (bytes: Uint8Array): string => { const hash = hashImmutableBytes(bytes); textures.set(hash, bytes); return hash; };
  const bake = (tier: 'desktop' | 'phone'): Promise<Baked[]> => Promise.all(variants.map(async (variantId) => {
    const own = look.variants?.[variantId] ?? {}, flap = own.flap ?? (own.rig === undefined ? look.flap : undefined);
    const mesh = tier === 'desktop' ? { source: own.rig ?? rig, maps: own.maps ?? look.maps, coat: own.coat } : phoneMesh(id, { rig, look, variantId });
    const source = mesh.source;
    const key = `${hashImmutableBytes(source)}:${JSON.stringify(flap ?? null)}:${own.parts === undefined ? '' : `${hashImmutableBytes(own.parts.glb)}:${own.parts.node}`}`;
    let imported = rigs.get(key);
    if (imported === undefined) {
      imported = hullRig(source, flap, own.parts).then(async (rigged) => ({ parts: rigged.parts,
        imported: await importCreatureGlb(rigged.glb, { skeleton: options.skeleton, map: options.map ?? kitChainMap(options.skeleton) }) }));
      rigs.set(key, imported);
    }
    const { imported: fitted, parts } = await imported;
    if (fitted.bones.length > CREATURE_BONE_CAP) throw new Error(`hull ${id}: ${fitted.bones.length} bones, over the cap of ${CREATURE_BONE_CAP}`);
    const maps = mesh.maps, colour = texture(mesh.coat ?? maps.base), normal = maps.normal === undefined ? undefined : texture(maps.normal);
    const material = look.surface.family === 'pbr' ? furMaterial({ ...look.surface.fur, ...own.fur }, colour, normal)
      : { family: 'painterly', rim: look.surface.rim, bands: look.surface.bands, map: colour, vertexColours: carriesColour(fitted.glb) };
    const materials = Object.fromEntries(parts.map((kind) => [kind, `${id}.${kind}`]));
    const binding: CreatureBinding = { loops: options.loops ?? [], material, ...(parts.length === 0 ? {} : { materials }) };
    const skin = new TextEncoder().encode(encodeCanonicalJson(creatureSkin(fitted, { id, family: 'pbr', binding })));
    return { variantId, fitted, skin, parts };
  }));
  const made = await bake('desktop');
  const kinds = made[0]?.parts ?? [];
  if (made.some((row) => row.parts.join(',') !== kinds.join(','))) throw new Error(`hull ${id}: every variant's parts need the same glowing and plain halves`);
  const tableOf = (rows: readonly Baked[]): Uint8Array =>
    new TextEncoder().encode(encodeCanonicalJson({ version: 1, skins: Object.fromEntries(rows.map((row) => [row.variantId, hashImmutableBytes(row.skin)])) }));
  const table = tableOf(made);
  const head = made[0];
  if (head === undefined) throw new Error(`hull ${id}: no skins`);
  // OF23f: each phone skin draws at most its desktop variant's triangles (the format refuses more)
  const phones = look.phone === undefined ? [] : await bake('phone');
  for (const [index, row] of phones.entries()) {
    const desktop = made[index];
    if (desktop !== undefined && parseGlb(row.fitted.glb).triangles > parseGlb(desktop.fitted.glb).triangles)
      throw new Error(`hull ${id}: phone variant ${row.variantId} draws more triangles than its desktop skin`);
  }
  const phoneTable = phones.length === 0 ? undefined : tableOf(phones), phoneHead = phones[0];
  const lookId = `${id}.look`;
  const species: SpeciesRow = { ...options.species, id,
    body: { size: options.size, scale: options.scale ?? 1, look: lookId, skeleton: options.skeleton } };
  const lookRow: ShardRows['looks'][number] = { id: lookId, species: id, recipe: 'platform.skin', material: null,
    parameters: { skin: hashImmutableBytes(head.skin), variants: hashImmutableBytes(table),
      ...(phoneTable === undefined || phoneHead === undefined ? {} : { phone: hashImmutableBytes(phoneHead.skin), phoneVariants: hashImmutableBytes(phoneTable) }) },
    animation: { recipe: 'platform.clips', parameters: { attackSpan: options.attackSpan ?? 1 } } };
  const all = [...made, ...phones];
  const glbs = [...new Map(all.map((row) => [hashImmutableBytes(row.fitted.glb), row.fitted.glb])).values()];
  const skins = [...new Map(all.map((row) => [hashImmutableBytes(row.skin), row.skin])).values()];
  return { id, glb: head.fitted.glb, skin: head.skin, species, look: lookRow, bones: head.fitted.bones.length,
    triangles: parseGlb(head.fitted.glb).triangles,
    files: { glbs, textures: [...textures.values()], skins, table, ...(phoneTable === undefined ? {} : { phoneTable }) },
    ...(kinds.length === 0 || look.surface.family !== 'pbr' ? {} : { materials: partMaterials(id, kinds, look.surface.fur) }) };
}
