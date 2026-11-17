import { parseWorldScenePage } from '@wildshard/format/worldScenePages';
import { SceneModelSourceSchema, SceneBakeSourceSchema } from '@wildshard/format/sceneSources';
import type { BakedPlacementPlan } from '@wildshard/format/bakedTiles';
import { isJsonData } from '@wildshard/format/json';
import { namedJsonSchema, registeredJsonSchema } from './formatJsonSchema';
import type { RegisteredScenePageJsonName, RegisteredPlacementPageJsonName } from '@wildshard/format/registeredJson';
import { parseWorldScene, parseWorldSceneBindings, parsePrivateScene, type WorldSceneRecipe } from '@wildshard/format/clientChannels';
import { CaveInteriorSchema, type CaveInteriorRows } from '@wildshard/format/caveInterior';
import { parseSceneBuffers } from '@wildshard/format/sceneBuffers';
import { WorldSceneWeldSchema, parseWorldSceneWeld, type WorldSceneWeld } from '@wildshard/format/worldSceneWeld';
import { parseWorldScenes, type WorldScenesSection } from '@wildshard/format/worldScenes';
import { parseWorldSceneModels } from '@wildshard/format/worldSceneModels';
import { WorldSceneSurfaceSchema, type WorldSceneSurface } from '@wildshard/format/worldSceneSurface';
import { parseWorldScenePlacement,parseWorldScenePlacementPage } from '@wildshard/format/worldScenePlacement';
import { parse, record, string, strictObject, array, boolean, object, exactOptional, picklist, pipe, unknown, transform, number, finite, regex, type GenericSchema, type ArraySchema, type StrictObjectSchema, type InferOutput } from 'valibot';
import { SceneDrawsSchema, type SceneDrawsRows } from '@wildshard/format/sceneDraws';
import type { SceneModelSource, SceneBakeSource } from '@wildshard/engine/game/shardfile/sceneSources';
import { nameBlob, type NamedBlob } from './blobs';
import { ForestPageSchema, LivingPageInputSchema, type LivingPageInputRows, type ForestPageRows } from '@wildshard/format/forestPage';
import { AdmissionLateSchema, type LateFile } from '@wildshard/format/admissionLate';
import { BakedBuildingLookSchema, parseBuildingLifeRows as nativeBuildingLifeRows, emptyBuildingLifeRows as nativeEmptyBuildingLifeRows,
  admitBuildingAssembly, type BuildingAssemblyRows, type BakedBuildingLookRows, type BuildingCloudRow } from '@wildshard/format/buildings';
import type { OutputFile } from '@wildshard/format/outputIndex';
import { WorldAssemblySchema } from '@wildshard/format/worldAssembly';
import { parseWorldEntry } from '@wildshard/format/worldEntry';
import { parseSceneMotion } from '@wildshard/format/sceneMotion';
import type { WorldUpdatesRows } from '@wildshard/format/worldUpdates';
import { parseToonLook } from '@wildshard/format/toonLook';
import { parseWorldTargets } from '@wildshard/format/worldTargets';
import { parseLightEmitters } from '@wildshard/format/lightEmitters';
import { parseEasedFields } from '@wildshard/format/easedFields';
import { parseColourFunction } from '@wildshard/format/colourFunction';

/** Admit complete authored toon presentation, keeping its native plain-data and resource checks. */
export function toonSceneLook(input: unknown): ReturnType<typeof parseToonLook> { return parseToonLook(input); }

/** Admit complete contact/scan laws before authoring world target bindings. */
export function worldTargetRows(input: unknown): ReturnType<typeof parseWorldTargets> { return parseWorldTargets(input); }
/** Admit ordered emitter draws, references and light waves without creating an effect owner. */
export function worldLightEmitters(input: unknown): ReturnType<typeof parseLightEmitters> { return parseLightEmitters(input); }
/** Admit bounded first-match field targets and their exact continuation/easing law. */
export function worldEasedFields(input: unknown): ReturnType<typeof parseEasedFields> { return parseEasedFields(input); }

/** Admit complete authored colour expressions through the native finite grammar. */
export function worldColourFunction(input: unknown): ReturnType<typeof parseColourFunction> { return parseColourFunction(input); }

/** A source geometry's ordered tile files and its resident ownership flag. */
export interface AuthorSceneTileGroup { files: string[]; resident: boolean }
/** Admit owned source tile groups before constructing model aliases or borrowing geometry. */
export function worldSceneTileGroups(input: unknown): Record<string, AuthorSceneTileGroup> {
  return parse(record(string(), strictObject({ files: array(string()), resident: boolean() })), input);
}

/** Ordered source geometry file ownership before publication; unrelated tile metadata is stripped. */
export interface AuthorSceneTileFiles { file: string; additionalFiles?: string[] }
/** Admit main/additional source files without deduplicating or borrowing any byte payload. */
export function worldSceneTileFiles(input: unknown): AuthorSceneTileFiles[] {
  return parse(array(object({ file: string(), additionalFiles: exactOptional(array(string())) })), input);
}

/** Admit ordered entry blocks and their native resource/variant checks before constructing a world. */
export function worldEntryRows(input: unknown): ReturnType<typeof parseWorldEntry> { return parseWorldEntry(input); }

/** Admit ordered world construction stages and their original resource/variant rules.
 * The result is data only; no scene, lifetime or runtime handle is constructed. */
export function worldAssemblyRows(input: unknown): ReturnType<typeof parse<typeof WorldAssemblySchema>> {
  return parse(WorldAssemblySchema, input);
}

/** Source-owned effect declarations retain the platform field contract. */
export interface SceneEffectField {
  readonly name: string;
  readonly shape: 'point' | 'streak' | 'flake';
  readonly count: number;
  readonly palette?: readonly number[];
  readonly life?: number;
}

/** Admit a bounded private world recipe before source publication; no runtime is installed. */
export function worldSceneRecipe(input: unknown): WorldSceneRecipe { return parseWorldScene(input); }

/** Admit complete private scene nodes and material ports before publication, without a scene host. */
export function privateSceneRows(input: unknown): ReturnType<typeof parsePrivateScene> { return parsePrivateScene(input); }

/** Admit finite typed transform/material/anchor ports using the defining platform grammar. */
export function worldSceneBindings(input: unknown): ReturnType<typeof parseWorldSceneBindings> { return parseWorldSceneBindings(input); }

/** Admit the complete data-only scene section with its original identity and reference checks. */
export function worldSceneRows(input: unknown): ReturnType<typeof parseWorldScenes> { return parseWorldScenes(input); }

/** Authored scene sections before admission fills lent resources and uniform defaults. */
export type AuthorWorldScenes = WorldScenesSection;
/** Complete native private hierarchy and materials before runtime installation. */
export type AuthorPrivateScene = ReturnType<typeof parsePrivateScene>;
/** Complete scene recipe, including imports and reference/placement contracts. */
export type AuthorWorldSceneRecipe = WorldSceneRecipe;
/** Complete admitted copy placement, including drawn-elsewhere ownership. */
export type AuthorWorldScenePlacement = ReturnType<typeof parseWorldScenePlacement>;
/** Ordered construction/checkpoint metadata before a world is installed. */
export type AuthorWorldConstruction = NonNullable<InferOutput<typeof WorldAssemblySchema>['construction']>;
/** Complete entry block map and one native ordered step. */
export type AuthorWorldEntry = ReturnType<typeof parseWorldEntry>;
export type AuthorWorldEntryStep = AuthorWorldEntry['blocks'][string][number];
/** Complete rope-deck site metadata accepted by native assembly. */
export type AuthorRopeDeckSite = Extract<InferOutput<typeof WorldAssemblySchema>['stages'][number], { kind: 'rope-deck' }>['site'];
/** Complete ordered native update declarations; clocks and owners stay runtime-side. */
export type AuthorWorldUpdates = WorldUpdatesRows;
/** Complete detached native motion/channel binding declaration. */
export type AuthorSceneMotion = ReturnType<typeof parseSceneMotion>;
/** Admit original native scene motion, retaining plain-data and owner/target checks. */
export function worldSceneMotion(input: unknown): AuthorSceneMotion { return parseSceneMotion(input); }

/** Admit a static model catalogue with the original identity, choice, LOD and plain-data checks. */
export function worldSceneModels(input: unknown): ReturnType<typeof parseWorldSceneModels> { return parseWorldSceneModels(input); }

/** Admit an original PBR/graph surface, including its explicit resident/placement intake hint. */
export function worldSceneSurface(input: unknown): WorldSceneSurface { return parse(WorldSceneSurfaceSchema, input); }

/** Admit an authored placement through the same finite layout and collider grammar as the client. */
export function worldScenePlacement(input: unknown): ReturnType<typeof parseWorldScenePlacement> { return parseWorldScenePlacement(input); }

/** Admit a forest page through its existing finite plant, building and landmark grammar. */
export function forestPageRows(input: unknown): ForestPageRows { return parse(ForestPageSchema, input); }

/** Schedule explicitly off-view material variants without changing inventory,
 * costs or tier choice. Any critical or otherwise selected alias stays early. */
export function lateSceneMaterialFiles(files: readonly Pick<OutputFile, 'hash' | 'variantOf' | 'critical'>[],
  hints: readonly { readonly variantOf: string; readonly at: readonly [number, number] }[]): readonly LateFile[] {
  const sites = new Map(hints.map(row => [row.variantOf, row.at]));
  if (sites.size !== hints.length || hints.some(row => row.variantOf.length === 0 || !files.some(file => file.variantOf === row.variantOf)))
    throw new Error('Late material variants require unique declared groups');
  const early = new Set(files.filter(file => file.critical || file.variantOf === undefined || !sites.has(file.variantOf)).map(file => file.hash));
  const selected = new Map<string, LateFile>();
  for (const file of files) {
    const at = file.variantOf === undefined ? undefined : sites.get(file.variantOf);
    if (at === undefined || early.has(file.hash)) continue;
    const prior = selected.get(file.hash);
    if (prior !== undefined && (prior.at?.[0] !== at[0] || prior.at[1] !== at[1])) throw new Error('Late material aliases require one position');
    selected.set(file.hash, { hash: file.hash, at: [at[0], at[1]] });
  }
  return parse(AdmissionLateSchema, [...selected.values()]);
}

/** Admit named typed channels, shared attributes and ordered buffered draws before publication. */
export function worldSceneBuffers(input: unknown): ReturnType<typeof parseSceneBuffers> { return parseSceneBuffers(input); }

/** Admit frozen scene topology, exact transform words and ordered hosted cull lanes. */
export function worldSceneWeldRows(input: unknown): ReturnType<typeof parseWorldSceneWeld> { return parseWorldSceneWeld(input); }

/** Admit an owned author draft with the same grammar, before runtime admission freezes it. */
export function worldSceneWeldData(input: unknown): ReturnType<typeof parseWorldSceneWeld> { return parse(WorldSceneWeldSchema, input); }

/** Publish the complete native weld without rewriting authored JSON or lending an owner. */
export function worldSceneWeldFile(name: string, input: unknown): NamedBlob {
  parseWorldSceneWeld(input);
  return nameBlob(name, 'json', new TextEncoder().encode(JSON.stringify(input)), {
    jsonSchema: namedJsonSchema(WorldSceneWeldSchema, { provenance: true }),
  });
}

/** Admit the defining finite surface properties without inventing a material or resource owner. */
export function worldSceneSurfaceProperties(input: unknown): WorldSceneSurface['properties'] { return parse(WorldSceneSurfaceSchema.entries.properties, input); }

/** Admit bounded cave ownership, frame, packed roof and material ports before publication. */
export function caveInteriorRows(input: unknown): CaveInteriorRows { return parse(CaveInteriorSchema, input); }

/** Complete authored building assembly grammar; no building instance or resource service is lent. */
export type AuthorBuildingAssembly<K extends string = string, P extends string = string> = BuildingAssemblyRows<K, P>;
/** Numeric cloud geometry/material references before any particle owner is constructed. */
export type AuthorBuildingCloud = BuildingCloudRow;
/** Check complete building resource bindings through the native strict grammar, without assembling it. */
export function checkBuildingAssembly(input: unknown): void { admitBuildingAssembly(input); }

/** Admit original building material, particle, door and lantern policy before baking. */
export function buildingLookRows(input: unknown): BakedBuildingLookRows { return parse(BakedBuildingLookSchema, input); }

/** Admit bounded moving doors, wheels, lights and site bindings through their defining checks. */
export function buildingLifeRows(input: unknown): ReturnType<typeof nativeBuildingLifeRows> { return nativeBuildingLifeRows(input); }

/** A fresh native empty life batch; authored assembly owns every returned list. */
export function emptyBuildingLifeRows(): ReturnType<typeof nativeEmptyBuildingLifeRows> { return nativeEmptyBuildingLifeRows(); }

/** Admit complete authored effect draws through their existing geometry/material port grammar. */
export function sceneDrawRows(input: unknown): SceneDrawsRows { return parse(SceneDrawsSchema, input); }

/** Publish source-owned model/rig/held declarations with the native inventory limits.
 * Preserve JSON property order and numeric spelling; runtime resource admission stays authoritative. */
export function modelSceneSourceFile(name: string, input: SceneModelSource): NamedBlob {
  if (input.rows.meshes.length > 256 || input.rows.hd.length > 256) throw new Error('Invalid declared model source');
  return nameBlob(name, 'json', new TextEncoder().encode(JSON.stringify(input)), { jsonSchema: namedJsonSchema(SceneModelSourceSchema, { provenance: true }) });
}
/** Publish source-owned baked kinds, bindings and contacts with the native kind-table limit. */
export function bakedSceneSourceFile(name: string, input: SceneBakeSource): NamedBlob {
  if (Object.keys(input.rows).length > 128) throw new Error('Invalid declared bake source');
  return nameBlob(name, 'json', new TextEncoder().encode(JSON.stringify(input)), { jsonSchema: namedJsonSchema(SceneBakeSourceSchema, { provenance: true }) });
}

/** Complete admitted living-scene profile, before any geometry or door owner is installed. */
export interface AuthorLivingSceneProfile {
  tier: 'phone' | 'desktop'; shadow: boolean; shared: boolean; file: string;
  graph: ReturnType<typeof worldSceneWeldData>;
  life: ReturnType<typeof buildingLifeRows>;
  geometry: { key: string; id: string; source: { library: string; model: string } }[];
}
/** Admit ordered living-scene bake metadata through the defining graph and life
 * grammars. Unused bake hashes strip as before; no resource reader is lent. */
export function worldSceneLivingBakeRows(input: unknown): {
  blobs: { name: string; kind: 'glb' | 'json'; source: string }[];
  profiles: AuthorLivingSceneProfile[];
  geometry: { id: string; library: string; file: string; attributes: Record<string, string> }[];
} {
  const id = string(), geometry = object({ key: id, id, source: object({ library: id, model: id }) });
  const profile = object({ tier: picklist(['phone', 'desktop']), shadow: boolean(), shared: boolean(), file: id,
    graph: pipe(unknown(), transform(worldSceneWeldData)), life: pipe(unknown(), transform(buildingLifeRows)), geometry: array(geometry) });
  return parse(object({ blobs: array(object({ name: id, kind: picklist(['glb', 'json']), source: id })),
    profiles: array(profile), geometry: array(object({ id, library: id, file: id, attributes: record(id, id) })) }), input);
}

/** Admit a complete source row book with finite word records and hashed tile
 * ownership. The caller's defining row grammar still owns every local field. */
export function worldSceneSourceRecords<Schema extends GenericSchema>(schema: Schema, input: unknown): InferOutput<StrictObjectSchema<{
  readonly rows: Schema;
  readonly records: ArraySchema<GenericSchema<unknown, number>, undefined>;
  readonly wholeTiles: GenericSchema<unknown, Record<string, AuthorSceneTileGroup>>;
}, undefined>> {
  return parse(strictObject({ rows: schema, records: array(pipe(number(), finite())),
    wholeTiles: record(string(), strictObject({ files: array(pipe(string(), regex(/^[a-f0-9]{64}$/u))), resident: boolean() })) }), input);
}


/** Ordered placement references over small complete native pages. Pages never mix
 * device membership, so the original tier filter also excludes their transport.
 * Admission checks every original row; encoding retains its authored key order. */
export function worldScenePlacementPages(id: string, input: readonly unknown[]): {
  files: NamedBlob[]; placements: { id: string; file: string; member: number; tier?: 'phone' | 'desktop' }[];
} {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,140}$/u.test(id) || input.length > 128)
    throw new Error('Placement pages require a bounded id and at most 128 placements');
  const rows = input.map(parseWorldScenePlacement);
  const sources = new Map(rows.map((row, index) => [row.id, input[index]]));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Placement identities must be unique');
  const files: NamedBlob[] = [], references = new Map<string, { id: string; file: string; member: number; tier?: 'phone' | 'desktop' }>();
  for (const tier of [undefined, 'phone', 'desktop'] as const) {
    const active = rows.filter(row => row.tier === tier);
    for (let at = 0, part = 0; at < active.length; part++) {
      // Match individual JSON files: matrix arithmetic's signed zeros encode as 0.
      let count = Math.min(16, active.length - at);
      let encodedPage = JSON.stringify({ version: 1, rows: active.slice(at, at + count) });
      let wirePage: unknown = JSON.parse(encodedPage);
      while (count > 1 && !isJsonData(wirePage)) {
        count--;
        encodedPage = JSON.stringify({ version: 1, rows: active.slice(at, at + count) });
        wirePage = JSON.parse(encodedPage);
      }
      const page = parseWorldScenePlacementPage(wirePage);
      const name: RegisteredPlacementPageJsonName = `world/placement-pages/${id}.${tier ?? 'shared'}.${part}.json`;
      const wire = { version: 1, rows: page.rows.map(row => sources.get(row.id)) };
      files.push(nameBlob(name, 'json', new TextEncoder().encode(JSON.stringify(wire)), { jsonSchema: registeredJsonSchema(name) }));
      for (const [member, row] of page.rows.entries()) references.set(row.id, { id: row.id, file: name, member, ...(tier === undefined ? {} : { tier }) });
      at += count;
    }
  }
  return { files, placements: rows.map(row => {
    const reference = references.get(row.id);
    if (reference === undefined) throw new Error('Missing placement page member');
    return reference;
  }) };
}

/** Complete authored baked placement data; no geometry or collider is allocated. */
export type AuthorBakedPlacementPlan = BakedPlacementPlan;

/** Pack complete native variants into streamed pages. Equal nodes share storage;
 * loading expands the original ordered graphs before native admission. */
export function worldSceneGraphPages(id: string, kind: 'weld' | 'living', input: readonly { name: string; row: WorldSceneWeld | LivingPageInputRows }[]): {
  files: NamedBlob[]; references: ReadonlyMap<string, { file: string; member: number }>;
} {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,140}$/u.test(id) || input.length > 128 || new Set(input.map(row => row.name)).size !== input.length)
    throw new Error('Native graph pages require bounded unique identities');
  const rows = input.map(entry => {
    if (kind === 'weld') parseWorldSceneWeld(entry.row); else parse(LivingPageInputSchema, entry.row);
    return entry;
  });
  const pack = (entries: typeof rows): unknown => {
    const nodes: WorldSceneWeld['nodes'] = [], identities = new Map<string, number>();
    const graph = (value: WorldSceneWeld) => ({ ...value, nodes: value.nodes.map(node => {
      const key = JSON.stringify(node), previous = identities.get(key);
      if (previous !== undefined) return previous;
      const at = nodes.length; nodes.push(node); identities.set(key, at); return at;
    }) });
    const members = entries.map(({ row }) => 'graph' in row ? { ...row, graph: graph(row.graph) } : graph(row));
    return { version: 1, kind, nodes, rows: members };
  };
  const files: NamedBlob[] = [], references = new Map<string, { file: string; member: number }>();
  for (let at = 0, part = 0; at < rows.length; part++) {
    let count = Math.min(16, rows.length - at), wire = pack(rows.slice(at, at + count));
    while (count > 1 && !isJsonData(wire)) { count--; wire = pack(rows.slice(at, at + count)); }
    parseWorldScenePage(wire);
    const name: RegisteredScenePageJsonName = `world/scene-pages/${id}.${part}.json`;
    files.push(nameBlob(name, 'json', new TextEncoder().encode(JSON.stringify(wire)), { jsonSchema: registeredJsonSchema(name) }));
    for (let member = 0; member < count; member++) {
      const entry = rows[at + member]; if (entry === undefined) throw new Error('Missing native graph page member');
      references.set(entry.name, { file: name, member });
    }
    at += count;
  }
  return { files, references };
}
