// Format JSON Schema and named-row helpers. The projection (`formatJsonSchema`, `namedJsonSchema`, the registered and
// named roots) is shard-format's `@wildshard/format/jsonSchema` (FORMAT-PRUNE FP9); the SDK keeps the author
// composition and row admission (SHARD-AUTHORING SA26) built on it.
// oxlint-disable unicorn/prefer-string-raw -- Its patterns are schema bytes, kept as sharddev wrote them.


import * as format from '@wildshard/format/jsonSchema';
import { BakedTilesSchema } from '@wildshard/format/bakedTiles';
import { ClientRidingSessionSchema } from '@wildshard/format/riding';
import { ManifestMetadataSchema } from '@wildshard/format/minimap';
import { HEADLESS_ASSEMBLY_JSON_SCHEMA, ReturnProgramSchema, PageReturnRowsSchema, QuestTraderSchema, PosedLibrarySchema } from '@wildshard/format/namedJsonContracts';
import { NativeQuestCompositionSchema } from '@wildshard/format/nativeQuestComposition';
import { MixedPopulationSchema } from '@wildshard/format/mixedPopulation';
import { ResolvedIslandLibrarySchema, FixedGeometryGroupsSchema } from '@wildshard/format/islandLibrary';
import { CollectionDisplaysSchema } from '@wildshard/format/collectionDisplay';
import { SpecimenCatalogueSchema, PackedSpecimenSchema, SpecimenMaterialSchema, SpecimenAssetSchema } from '@wildshard/format/specimenCatalogue';
import { nativeBodySchema, nativeColliderRecordSchema, nativeGroundRecordSchema, type NativeColliderRecord, type NativeArrayStorage } from '@wildshard/format/nativePhysics';
import { ScalarLatticeSchema, ScalarTripletSchema } from '@wildshard/format/scalarChannel';
import { MountedSpecimenSeatSchema } from '@wildshard/format/mountedSpecimenRows';
import { SpeciesLookBookSchema, CreatureGuestSchema } from '@wildshard/format/speciesBookRows';
import { PaintedLookSchema } from '@wildshard/format/paintedLook';
import { MaterialsSchema } from '@wildshard/format/materials';
import { PopulationProjectionSchema, EnemyPlacementsSchema } from '@wildshard/format/populationProjection';
import { SceneScatterPageSchema, SceneDressingSchema, SceneBakedGeometrySchema, SceneFloorSchema, SceneDressingContactsSchema } from '@wildshard/format/sceneDressing';
import { LootBagSchema } from '@wildshard/format/lootBag';
import { CatalogueEconomySchema } from '@wildshard/format/catalogueEconomy';
import { ClaimedPickupSchema } from '@wildshard/format/lootEconomy';
import { ContractBoardPageSchema } from '@wildshard/format/contracts';
import { BodySlotsSchema } from '@wildshard/format/bodySlots';
import { PracticeSceneSchema, PracticeControllerSchema, FixedPracticeFileSchema } from '@wildshard/format/practiceCourseRows';
import { QuestNpcBindingsSchema, QuestPageTalksSchema } from '@wildshard/format/npcs';
import { finite, strictObject, object, looseObject, tuple, tupleWithRest, optional, array, literal as literalSchema, parse, safeParse as sourceSafeParse, pipe, check as sourceCheck, number, string, boolean, unknown, null as nullSchema, integer, minValue, maxValue, minLength, maxLength, startsWith, length, picklist, record, nullable, exactOptional, safeInteger, regex as sourceRegex, maxEntries, union, variant, assert, is as sourceIs, type VariantOptions, type SafeParseResult, type GenericSchema, type InferInput, type InferOutput } from 'valibot';
import { PopulationKeeperRowsSchema } from '@wildshard/format/populationKeeper';

import { GroundRowsSchema } from '@wildshard/format/terrain';
import { QuestContinuationSchema } from '@wildshard/format/questContinuation';
import { QuestFiguresSchema, KitFigureCardsSchema } from '@wildshard/format/questFigures';
import { QuestHostSchema } from '@wildshard/format/questHost';

import { PrivateSceneSchema } from '@wildshard/format/clientChannels';

import { AmbientFlockSchema, AmbientPerchesSchema, ForagerContinuation } from '@wildshard/format/ambientLife';


// Each projection name is bound to the format's own (as engine `formatJsonSchema.ts` does), not re-exported (E434).
export const formatJsonSchema: typeof format.formatJsonSchema = format.formatJsonSchema;
export const formatJsonSchemas: typeof format.formatJsonSchemas = format.formatJsonSchemas;
export const namedFormatJsonSchema: typeof format.namedFormatJsonSchema = format.namedFormatJsonSchema;
export const namedFormatJsonSchemas: typeof format.namedFormatJsonSchemas = format.namedFormatJsonSchemas;
export const namedJsonSchema: typeof format.namedJsonSchema = format.namedJsonSchema;
export const registeredJsonSchema: typeof format.registeredJsonSchema = format.registeredJsonSchema;
export const schemaAt: typeof format.schemaAt = format.schemaAt;
export const schemaDeclaration: typeof format.schemaDeclaration = format.schemaDeclaration;
export type FormatJsonSchema = format.FormatJsonSchema;
export type SchemaDeclaration = format.SchemaDeclaration;
const { namedFormatSchema } = format;
/** Declarative author composition; named strings resolve only defining format roots. */
export type NamedJsonComposition = string | GenericSchema
  | { readonly kind: 'number'; readonly finite?: boolean; readonly integer?: boolean; readonly safeInteger?: boolean; readonly min?: number; readonly max?: number }
  | { readonly kind: 'string'; readonly min?: number; readonly max?: number; readonly startsWith?: string; readonly regex?: RegExp }
  | { readonly kind: 'boolean' | 'unknown' | 'null' }
  | { readonly kind: 'literal'; readonly value: string | number | boolean | null }
  | { readonly kind: 'picklist'; readonly values: readonly (string | number)[] }
  | { readonly kind: 'array'; readonly item: NamedJsonComposition; readonly min?: number; readonly max?: number; readonly length?: number }
  | { readonly kind: 'object'; readonly entries: Readonly<Record<string, NamedJsonComposition>>; readonly mode?: 'strict' | 'strip' | 'loose' }
  | { readonly kind: 'tuple'; readonly items: readonly NamedJsonComposition[] }
  | { readonly kind: 'tuple-rest'; readonly items: readonly NamedJsonComposition[]; readonly rest: NamedJsonComposition }
  | { readonly kind: 'record'; readonly key: { readonly kind: 'string'; readonly min?: number; readonly max?: number; readonly startsWith?: string; readonly regex?: RegExp }; readonly value: NamedJsonComposition; readonly maxEntries?: number }
  | { readonly kind: 'union'; readonly options: readonly NamedJsonComposition[] }
  | { readonly kind: 'variant'; readonly key: string; readonly options: readonly NamedJsonComposition[] }
  | { readonly kind: 'nullable' | 'exact-optional'; readonly item: NamedJsonComposition }
  | { readonly kind: 'optional'; readonly item: NamedJsonComposition; readonly default?: object | string | number | boolean | null };

type OptionalCompositionKeys<E extends Readonly<Record<string, NamedJsonComposition>>, M extends 'input' | 'output'> = {
  [K in keyof E]: E[K] extends { readonly kind: 'exact-optional' } ? K
    : E[K] extends { readonly kind: 'optional' } ? M extends 'input' ? K : E[K] extends { readonly default: unknown } ? never : K : never
}[keyof E];
type CompositionObjectValue<E extends Readonly<Record<string, NamedJsonComposition>>, M extends 'input' | 'output'> = {
  -readonly [K in Exclude<keyof E, OptionalCompositionKeys<E, M>>]: NamedRowValue<E[K], M>
} & { -readonly [K in OptionalCompositionKeys<E, M>]?: E[K] extends { readonly kind: 'exact-optional'; readonly item: infer I extends NamedJsonComposition } ? NamedRowValue<I, M> : NamedRowValue<E[K], M> };
type FlattenCompositionObject<T> = { [K in keyof T]: T[K] };

/** Mutable native output, retaining tuple lengths, exact optionality and literal
 * discriminants. A named format string stays opaque; an admitted native leaf
 * retains its complete defining output type. */
export type NamedRowValue<C extends NamedJsonComposition, M extends 'input' | 'output' = 'output'> = NamedJsonComposition extends C ? unknown : C extends GenericSchema ? M extends 'input' ? InferInput<C> : InferOutput<C>
  : C extends { readonly kind: 'number' } ? number
  : C extends { readonly kind: 'string' } ? string
  : C extends { readonly kind: 'boolean' } ? boolean
  : C extends { readonly kind: 'null' } ? null
  : C extends { readonly kind: 'literal'; readonly value: infer L } ? L
  : C extends { readonly kind: 'picklist'; readonly values: readonly (infer L)[] } ? L
  : C extends { readonly kind: 'array'; readonly item: infer I extends NamedJsonComposition } ? NamedRowValue<I, M>[]
  : C extends { readonly kind: 'tuple'; readonly items: infer I extends readonly NamedJsonComposition[] } ? { -readonly [K in keyof I]: NamedRowValue<I[K], M> }
  : C extends { readonly kind: 'tuple-rest'; readonly items: infer I extends readonly NamedJsonComposition[]; readonly rest: infer R extends NamedJsonComposition } ? [...{ -readonly [K in keyof I]: NamedRowValue<I[K], M> }, ...NamedRowValue<R, M>[]]
  : C extends { readonly kind: 'object'; readonly entries: infer E extends Readonly<Record<string, NamedJsonComposition>> } ? C extends { readonly mode: 'loose' } ? FlattenCompositionObject<CompositionObjectValue<E, M>> & Record<string, unknown> : FlattenCompositionObject<CompositionObjectValue<E, M>>
  : C extends { readonly kind: 'record'; readonly value: infer V extends NamedJsonComposition } ? Record<string, NamedRowValue<V, M>>
  : C extends { readonly kind: 'union' | 'variant'; readonly options: infer O extends readonly NamedJsonComposition[] } ? NamedRowValue<O[number], M>
  : C extends { readonly kind: 'nullable'; readonly item: infer I extends NamedJsonComposition } ? NamedRowValue<I, M> | null
  : C extends { readonly kind: 'exact-optional'; readonly item: infer I extends NamedJsonComposition } ? NamedRowValue<I, M> | undefined
  : C extends { readonly kind: 'optional'; readonly item: infer I extends NamedJsonComposition } ? NamedRowValue<I, M> | (M extends 'output' ? C extends { readonly default: unknown } ? never : undefined : undefined)
  : unknown;

/** Original assertion input, including native leaves that transform on parse. */
export type NamedRowInput<C extends NamedJsonComposition> = NamedRowValue<C, 'input'>;

function resolveNamedComposition(node: NamedJsonComposition): GenericSchema {
  if (typeof node === 'string') {
    const root = namedFormatSchema(node);
    if (root === undefined) throw new Error(`Missing named format contract: ${node}`);
    return root;
  }
  switch (node.kind) {
    case 'schema': return node;
    case 'number': {
      let schema: GenericSchema<unknown, number> = number();
      if (node.finite === true) schema = pipe(schema, finite());
      if (node.integer === true) schema = pipe(schema, integer());
      if (node.safeInteger === true) schema = pipe(schema, safeInteger());
      if (node.min !== undefined) schema = pipe(schema, minValue(node.min));
      if (node.max !== undefined) schema = pipe(schema, maxValue(node.max));
      return schema;
    }
    case 'string': {
      let schema: GenericSchema<unknown, string> = string();
      if (node.min !== undefined) schema = pipe(schema, minLength(node.min));
      if (node.max !== undefined) schema = pipe(schema, maxLength(node.max));
      if (node.startsWith !== undefined) schema = pipe(schema, startsWith(node.startsWith));
      if (node.regex !== undefined) schema = pipe(schema, sourceRegex(node.regex));
      return schema;
    }
    case 'boolean': return boolean();
    case 'unknown': return unknown();
    case 'null': return nullSchema();
    case 'literal': {
      if (typeof node.value === 'number' && !Number.isFinite(node.value)) throw new Error('Named JSON literal must be finite');
      return node.value === null ? nullSchema() : literalSchema(node.value);
    }
    case 'picklist': return picklist(node.values);
    case 'array': {
      let schema: GenericSchema<unknown, unknown[]> = array(resolveNamedComposition(node.item));
      if (node.min !== undefined) schema = pipe(schema, minLength(node.min));
      if (node.max !== undefined) schema = pipe(schema, maxLength(node.max));
      if (node.length !== undefined) schema = pipe(schema, length(node.length));
      return schema;
    }
    case 'tuple': return tuple(node.items.map(resolveNamedComposition));
    case 'tuple-rest': return tupleWithRest(node.items.map(resolveNamedComposition), resolveNamedComposition(node.rest));
    case 'object': {
      const entries = Object.fromEntries(Object.entries(node.entries).map(([name, item]) => [name, resolveNamedComposition(item)]));
      return node.mode === 'strip' ? object(entries) : node.mode === 'loose' ? looseObject(entries) : strictObject(entries);
    }
    case 'record': {
      const schema = record(resolveNamedComposition(node.key) as GenericSchema<string, string>, resolveNamedComposition(node.value));
      return node.maxEntries === undefined ? schema : pipe(schema, maxEntries(node.maxEntries));
    }
    case 'union': return union(node.options.map(resolveNamedComposition));
    case 'variant': return variant(node.key, node.options.map(resolveNamedComposition) as VariantOptions<string>);
    case 'nullable': return nullable(resolveNamedComposition(node.item));
    case 'exact-optional': return exactOptional(resolveNamedComposition(node.item));
    case 'optional': return optional(resolveNamedComposition(node.item), node.default);
    default: throw new Error('Unknown named row composition');
  }
}

/** One compiled source contract, with complete native admission and the exact
 * wire schema from that same grammar. Custom checks stay author-side; asking
 * for their wire schema still refuses unless the defining bridge knows them. */
export interface NamedRows<T = unknown, I = T> {
  readonly schema: GenericSchema<I, T>;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly parse: (input: unknown) => T;
  /** Preserve native non-throwing parsed output and complete validation issues. */
  readonly safeParse: (input: unknown) => SafeParseResult<GenericSchema<I, T>>;
  /** Validate and retain the original object, including unknown stripped fields. */
  readonly admit: (input: unknown) => I;
  /** Non-throwing native admission for callers retaining their own error text. */
  readonly accepts: (input: unknown) => input is I;
}

/** Compile a source-owned finite grammar once, before validating or emitting
 * any rows. The recursive output mapping mirrors each native compiler branch;
 * no input value is cast to its admitted output type. */
export function defineNamedRows<const C extends NamedJsonComposition>(composition: C,
  refinement?: (value: NamedRowValue<C>) => boolean, message?: string): NamedRows<NamedRowValue<C>, NamedRowInput<C>> {
  const native = resolveNamedComposition(composition) as GenericSchema<NamedRowInput<C>, NamedRowValue<C>>;
  const schema = refinement === undefined ? native : pipe(native, sourceCheck(refinement, message));
  return { schema, parse: rowsValue => parse(schema, rowsValue), safeParse: rowsValue => sourceSafeParse(schema, rowsValue), admit: rowsValue => { assert(schema, rowsValue); return rowsValue; },
    accepts: (rowsValue): rowsValue is NamedRowInput<C> => sourceIs(schema, rowsValue), get jsonSchema() { return namedJsonSchema(schema); } };
}

/** Compose defining roots and local structural leaves without exporting runtime consumer schemas.
 * Conversion keeps the ordinary unknown-check/transform refusals and never infers a contract from data. */
export function composeNamedJsonSchema(composition: NamedJsonComposition): Readonly<Record<string, unknown>> {
  return namedJsonSchema(resolveNamedComposition(composition));
}

/** Exact defining pure-format objects for checked author compositions. */
interface AuthorFormatObjects {
  readonly 'nativePhysics.nativeGroundRecordSchema': typeof nativeGroundRecordSchema;
  readonly 'ambientLife.ForagerContinuation': typeof ForagerContinuation;
  readonly 'riding.ClientRidingSessionSchema': typeof ClientRidingSessionSchema;
  readonly 'mountedSpecimenRows.MountedSpecimenSeatSchema': typeof MountedSpecimenSeatSchema;
  readonly 'lootEconomy.ClaimedPickupSchema': typeof ClaimedPickupSchema;
  readonly 'lootBag.LootBagSchema': typeof LootBagSchema;
  readonly 'questContinuation.QuestContinuationSchema': typeof QuestContinuationSchema;
  readonly 'npcs.QuestNpcBindingsSchema': typeof QuestNpcBindingsSchema;
  readonly 'questHost.QuestHostSchema': typeof QuestHostSchema;
  readonly 'speciesBookRows.CreatureGuestSchema': typeof CreatureGuestSchema;
  readonly 'speciesBookRows.SpeciesLookBookSchema': typeof SpeciesLookBookSchema;
  readonly 'paintedLook.PaintedLookSchema': typeof PaintedLookSchema;
  readonly 'materials.MaterialsSchema': typeof MaterialsSchema;
  readonly 'sceneDressing.SceneDressingSchema': typeof SceneDressingSchema;
  readonly 'sceneDressing.SceneScatterPageSchema': typeof SceneScatterPageSchema;
  readonly 'sceneDressing.SceneBakedGeometrySchema': typeof SceneBakedGeometrySchema;
  readonly 'sceneDressing.SceneFloorSchema': typeof SceneFloorSchema;
  readonly 'sceneDressing.SceneDressingContactsSchema': typeof SceneDressingContactsSchema;
  readonly 'specimenCatalogue.SpecimenCatalogueSchema': typeof SpecimenCatalogueSchema;
  readonly 'specimenCatalogue.PackedSpecimenSchema': typeof PackedSpecimenSchema;
  readonly 'specimenCatalogue.SpecimenMaterialSchema': typeof SpecimenMaterialSchema;
  readonly 'specimenCatalogue.SpecimenAssetSchema': typeof SpecimenAssetSchema;
  readonly 'ambientLife.AmbientFlockSchema': typeof AmbientFlockSchema;
  readonly 'ambientLife.AmbientPerchesSchema': typeof AmbientPerchesSchema;
  readonly 'clientChannels.PrivateSceneSchema': typeof PrivateSceneSchema;
  readonly 'collectionDisplay.CollectionDisplaysSchema': typeof CollectionDisplaysSchema;
  readonly 'bodySlots.BodySlotsSchema': typeof BodySlotsSchema;
  readonly 'bakedTiles.BakedTilesSchema': typeof BakedTilesSchema;
  readonly 'populationProjection.PopulationProjectionSchema': typeof PopulationProjectionSchema;
  readonly 'populationProjection.EnemyPlacementsSchema': typeof EnemyPlacementsSchema;
  readonly 'populationKeeper.PopulationKeeperRowsSchema': typeof PopulationKeeperRowsSchema;
  readonly 'scalarChannel.ScalarTripletSchema': typeof ScalarTripletSchema;
  readonly 'scalarChannel.ScalarLatticeSchema': typeof ScalarLatticeSchema;
  readonly 'terrain.GroundRowsSchema': typeof GroundRowsSchema;
  readonly 'questFigures.KitFigureCardsSchema': typeof KitFigureCardsSchema;
  readonly 'questFigures.QuestFiguresSchema': typeof QuestFiguresSchema;
  readonly 'catalogueEconomy.CatalogueEconomySchema': typeof CatalogueEconomySchema;
  readonly 'minimap.ManifestMetadataSchema': typeof ManifestMetadataSchema;
  readonly 'islandLibrary.ResolvedIslandLibrarySchema': typeof ResolvedIslandLibrarySchema;
  readonly 'islandLibrary.FixedGeometryGroupsSchema': typeof FixedGeometryGroupsSchema;
  readonly 'practiceCourseRows.FixedPracticeFileSchema': typeof FixedPracticeFileSchema;
  readonly 'mixedPopulation.MixedPopulationSchema': typeof MixedPopulationSchema;
  readonly 'nativeQuestComposition.NativeQuestCompositionSchema': typeof NativeQuestCompositionSchema;
  readonly 'namedJsonContracts.HEADLESS_ASSEMBLY_JSON_SCHEMA': typeof HEADLESS_ASSEMBLY_JSON_SCHEMA;
  readonly 'namedJsonContracts.ReturnProgramSchema': typeof ReturnProgramSchema;
  readonly 'namedJsonContracts.PageReturnRowsSchema': typeof PageReturnRowsSchema;
  readonly 'namedJsonContracts.QuestTraderSchema': typeof QuestTraderSchema;
  readonly 'namedJsonContracts.PosedLibrarySchema': typeof PosedLibrarySchema;
  readonly 'npcs.QuestPageTalksSchema': typeof QuestPageTalksSchema;
  readonly 'contracts.ContractBoardPageSchema': typeof ContractBoardPageSchema;
  readonly 'practiceCourseRows.PracticeSceneSchema': typeof PracticeSceneSchema;
  readonly 'practiceCourseRows.PracticeControllerSchema': typeof PracticeControllerSchema;
  readonly 'nativePhysics.nativeBodySchema': typeof nativeBodySchema;
  readonly 'nativePhysics.nativeColliderRecordSchema': typeof nativeColliderRecordSchema;
}
const authorFormats: AuthorFormatObjects = {
  'nativePhysics.nativeGroundRecordSchema': nativeGroundRecordSchema,
  'ambientLife.ForagerContinuation': ForagerContinuation,
  'riding.ClientRidingSessionSchema': ClientRidingSessionSchema,
  'mountedSpecimenRows.MountedSpecimenSeatSchema': MountedSpecimenSeatSchema,
  'lootEconomy.ClaimedPickupSchema': ClaimedPickupSchema,
  'lootBag.LootBagSchema': LootBagSchema,
  'questContinuation.QuestContinuationSchema': QuestContinuationSchema,
  'npcs.QuestNpcBindingsSchema': QuestNpcBindingsSchema,
  'questHost.QuestHostSchema': QuestHostSchema,
  'speciesBookRows.CreatureGuestSchema': CreatureGuestSchema,
  'speciesBookRows.SpeciesLookBookSchema': SpeciesLookBookSchema,
  'paintedLook.PaintedLookSchema': PaintedLookSchema,
  'materials.MaterialsSchema': MaterialsSchema,
  'sceneDressing.SceneDressingSchema': SceneDressingSchema,
  'sceneDressing.SceneScatterPageSchema': SceneScatterPageSchema,
  'sceneDressing.SceneBakedGeometrySchema': SceneBakedGeometrySchema,
  'sceneDressing.SceneFloorSchema': SceneFloorSchema,
  'sceneDressing.SceneDressingContactsSchema': SceneDressingContactsSchema,
  'specimenCatalogue.SpecimenCatalogueSchema': SpecimenCatalogueSchema,
  'specimenCatalogue.PackedSpecimenSchema': PackedSpecimenSchema,
  'specimenCatalogue.SpecimenMaterialSchema': SpecimenMaterialSchema,
  'specimenCatalogue.SpecimenAssetSchema': SpecimenAssetSchema,
  'ambientLife.AmbientFlockSchema': AmbientFlockSchema,
  'ambientLife.AmbientPerchesSchema': AmbientPerchesSchema,
  'clientChannels.PrivateSceneSchema': PrivateSceneSchema,
  'collectionDisplay.CollectionDisplaysSchema': CollectionDisplaysSchema,
  'bodySlots.BodySlotsSchema': BodySlotsSchema,
  'bakedTiles.BakedTilesSchema': BakedTilesSchema,
  'populationProjection.PopulationProjectionSchema': PopulationProjectionSchema,
  'populationProjection.EnemyPlacementsSchema': EnemyPlacementsSchema,
  'populationKeeper.PopulationKeeperRowsSchema': PopulationKeeperRowsSchema,
  'scalarChannel.ScalarTripletSchema': ScalarTripletSchema,
  'scalarChannel.ScalarLatticeSchema': ScalarLatticeSchema,
  'terrain.GroundRowsSchema': GroundRowsSchema,
  'questFigures.KitFigureCardsSchema': KitFigureCardsSchema,
  'questFigures.QuestFiguresSchema': QuestFiguresSchema,
  'catalogueEconomy.CatalogueEconomySchema': CatalogueEconomySchema,
  'minimap.ManifestMetadataSchema': ManifestMetadataSchema,
  'islandLibrary.ResolvedIslandLibrarySchema': ResolvedIslandLibrarySchema,
  'islandLibrary.FixedGeometryGroupsSchema': FixedGeometryGroupsSchema,
  'practiceCourseRows.FixedPracticeFileSchema': FixedPracticeFileSchema,
  'mixedPopulation.MixedPopulationSchema': MixedPopulationSchema,
  'nativeQuestComposition.NativeQuestCompositionSchema': NativeQuestCompositionSchema,
  'namedJsonContracts.HEADLESS_ASSEMBLY_JSON_SCHEMA': HEADLESS_ASSEMBLY_JSON_SCHEMA,
  'namedJsonContracts.ReturnProgramSchema': ReturnProgramSchema,
  'namedJsonContracts.PageReturnRowsSchema': PageReturnRowsSchema,
  'namedJsonContracts.QuestTraderSchema': QuestTraderSchema,
  'namedJsonContracts.PosedLibrarySchema': PosedLibrarySchema,
  'npcs.QuestPageTalksSchema': QuestPageTalksSchema,
  'contracts.ContractBoardPageSchema': ContractBoardPageSchema,
  'practiceCourseRows.PracticeSceneSchema': PracticeSceneSchema,
  'practiceCourseRows.PracticeControllerSchema': PracticeControllerSchema,
  'nativePhysics.nativeBodySchema': nativeBodySchema,
  'nativePhysics.nativeColliderRecordSchema': nativeColliderRecordSchema,
};
/** Select a defining validator, pure grammar factory or structural document by its finite module/export identity.
 * The original object, exact type, custom checks and metadata identity are retained;
 * no engine/game runtime binding or unregistered dynamic grammar is borrowed. */
export function authorFormatSchema<Name extends keyof AuthorFormatObjects>(name: Name): AuthorFormatObjects[Name] {
  if (!Object.hasOwn(authorFormats, name)) throw new Error(`Unknown author format: ${name}`);
  return authorFormats[name];
}

/** Finite validator identities; factories and structural documents are not admission grammars. */
type AuthorSchemaName = { [Name in keyof AuthorFormatObjects]: AuthorFormatObjects[Name] extends GenericSchema ? Name : never }[keyof AuthorFormatObjects];

/** Admit author data through its original defining validator, preserving defaults,
 * custom checks, transforms and issue ordering. No ad-hoc schema or runtime service is accepted. */
export function authorFormatRows<Name extends AuthorSchemaName>(name: Name, rowsValue: unknown): InferOutput<AuthorFormatObjects[Name]> {
  const schema = authorFormatSchema(name);
  if (schema.kind !== 'schema') throw new Error('Author admission requires a validator');
  return parse(schema, rowsValue);
}

/** Admit every explicitly named catalogue member through its defining format.
 * Key order and native member defaults/checks remain; missing or extra members refuse. */
export function authorCatalogueRows<Name extends AuthorSchemaName, const Keys extends readonly string[]>(name: Name, keys: Keys,
  rowsValue: unknown): Record<Keys[number], InferOutput<AuthorFormatObjects[Name]>>;
export function authorCatalogueRows(name: AuthorSchemaName, keys: readonly string[], rowsValue: unknown): Record<string, unknown> {
  if (keys.length > 1024 || new Set(keys).size !== keys.length
    || keys.some(key => typeof key !== 'string' || key === '' || ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Invalid author catalogue keys');
  const schema = authorFormatSchema(name);
  if (schema.kind !== 'schema') throw new Error('Author catalogue requires a validator');
  const entries = Object.fromEntries<GenericSchema>(keys.map(key => [key, schema]));
  return parse(strictObject(entries), rowsValue);
}

/** Admit authored native collider arrays with the defining shape/provenance
 * checks and original file-slice storage. No decoding or runtime service. */
export function nativeColliderSourceRows<const S extends readonly (1 | 2 | 6 | 9)[]>(rowsValue: unknown, shapes: S,
  owner: 'piece' | 'tagged'): NativeColliderRecord<S[number], NativeArrayStorage>[] {
  return parse(array(nativeColliderRecordSchema(shapes, owner, true)), rowsValue);
}
