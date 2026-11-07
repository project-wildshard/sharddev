import { RowsSchema as GameRowsSchema, parseRows as gameParseRows, type ShardRows as GameShardRows } from '@wildshard/format/rows';
import type { DayClockRow } from '@wildshard/format/dayCycle';
import type { DayLookRow, DayLookSchema } from '@wildshard/format/dayLook';
import { isJsonData as gameIsJsonData } from '@wildshard/format/json';
import { parseItems as gameParseItems, type ShardItems as GameShardItems } from '@wildshard/format/items';
import { parseClientChannels as gameParseClientChannels, type ClientChannelProgram as GameClientChannelProgram } from '@wildshard/format/clientChannels';
import { parseEliteFeature as gameParseEliteFeature, type EliteFeatureRows as GameEliteFeatureRows, type ExternalEliteData } from '@wildshard/format/eliteFeature';
import { parseSpawnScript as gameParseSpawnScript, spawnScriptRegistries as gameSpawnScriptRegistries, type SpawnScriptRows as GameSpawnScriptRows } from '@wildshard/format/spawnScripts';
import type { DecisionRegistries as GameDecisionRegistries } from '@wildshard/format/decisionBindings';
import { JournalRowSchema as GameJournalRowSchema, journalRowRules as gameJournalRowRules, type JournalRow as GameJournalRow } from '@wildshard/format/compendiumRows';
import { parseContractCatalogue as gameParseContractCatalogue, parseContractBoardPage, type ContractCatalogue as GameContractCatalogue } from '@wildshard/format/contracts';
import { parseAmbientLife as gameParseAmbientLife, type AmbientLifeData as GameAmbientLife } from '@wildshard/format/ambientLife';
import { parsePageLife as gameParsePageLife, type PageLifeRows as GamePageLifeRows } from '@wildshard/format/pageLife';
import { PopulationEnvironmentSchema as GamePopulationEnvironmentSchema, type PopulationEnvironmentRows as GamePopulationEnvironment } from '@wildshard/format/populationEnvironment';
import { FigureCatalogueSchema as GameFigureCatalogueSchema, NpcFigureRowsSchema, type FigureCatalogueRow as GameFigureCatalogue, type FigureAtlasRow } from '@wildshard/format/figures';
import { RangedPageSchema, ForestWeatherObservationSchema } from '@wildshard/format/rangedPage';
import { RainPresentationSchema } from '@wildshard/format/rainPresentation';
import { parseAchievementCounterData } from '@wildshard/format/achievementCounters';
import { parseQuestStepRows, parseQuestHintRows, parseQuestServiceActions, parseCarriedQuest } from '@wildshard/format/questSteps';
import { parseQuestPageInteractions } from '@wildshard/format/questInteractions';
import { parseNativeQuestServiceSpots } from '@wildshard/format/nativeQuestComposition';
import { parseCoverAppearance } from '@wildshard/format/coverAppearance';
import { parseWeatherProgram } from '@wildshard/format/weatherProgram';
import { QuestPageCompositionSchema } from '@wildshard/format/questPageComposition';
import { CoverCompositionSchema } from '@wildshard/format/streamedCover';
import { ManifestMetadataSchema } from '@wildshard/format/minimap';
import * as v from 'valibot';
import { ItemCatalogue } from '@wildshard/engine/game/loadout/itemCatalogue';
import { parseExplorerCatalogue } from '@wildshard/format/explorerCatalogue';
import { QuestTraderSchema } from '@wildshard/format/namedJsonContracts';
import { parseBarterEconomy } from '@wildshard/format/lootEconomy';
import type { ExchangeRows } from '@wildshard/format/exchange';
import { parseGraphArms } from '@wildshard/format/graphArmsRows';
import { MountedLoadoutSchema } from '@wildshard/format/loadout';
import { BowVariantSchema } from '@wildshard/format/bowVariantRows';
import { parseHeldSlots, HeldArmsSchema } from '@wildshard/format/heldArms';
import { parseCollectionDisplays } from '@wildshard/format/collectionDisplay';

/** Admit complete authored collection mounts, ranges and drop geometry before publication. */
export function collectionDisplayRows(input: unknown): ReturnType<typeof parseCollectionDisplays> { return parseCollectionDisplays(input); }

/** Complete authored day clock, including readonly schedules and fixed/preset selections. */
export type AuthorDayClock = DayClockRow;
/** Complete merged-atlas metadata; no skin, texture or figure is allocated. */
export type AuthorFigureAtlas = FigureAtlasRow;
/** Complete external elite declaration, including the script/herd discriminant. */
export type AuthorExternalElite = ExternalEliteData;
/** Native keyed-look grammar and its recursive, readonly value mapping. */
export type AuthorDayLook<Schema extends DayLookSchema> = DayLookRow<Schema>;

/** Admit the complete native mounted arsenal declaration before compiling its slot rows. */
export function mountedLoadoutRows(input: unknown): v.InferOutput<typeof MountedLoadoutSchema> { return v.parse(MountedLoadoutSchema, input); }
/** Admit the complete bounded reward-bow tuning, bindings and presentation policy. */
export function bowVariantRows(input: unknown): v.InferOutput<typeof BowVariantSchema> { return v.parse(BowVariantSchema, input); }
/** Admit JSON-only held slots with the original registration/equipment/refill/upgrade ownership checks. */
export function heldSlotsRows(input: unknown): ReturnType<typeof parseHeldSlots> { return parseHeldSlots(input); }
/** Admit the complete original toon rig, Explorer cards and world claims through their defining grammar. */
export function toonHeldArmsRows(input: unknown): v.InferOutput<(typeof HeldArmsSchema)['options'][0]> { return v.parse(HeldArmsSchema.options[0], input); }

const numberTriple = v.tuple([v.number(), v.number(), v.number()]);
const numberQuad = v.tuple([v.number(), v.number(), v.number(), v.number()]);
const numberFive = v.tuple([v.number(), v.number(), v.number(), v.number(), v.number()]);
const numberArray = v.array(v.number());
/** Admit native numeric record words; finiteness and geometry bounds remain the enclosing grammar's policy. */
export function numberArrayRows(input: unknown): number[] { return v.parse(numberArray, input); }
/** Admit native three/four/five-word author values, preserving signed zero and the tuple's extra-word policy. */
export function numberTupleRows(input: unknown, width: 3): [number, number, number];
export function numberTupleRows(input: unknown, width: 4): [number, number, number, number];
export function numberTupleRows(input: unknown, width: 5): [number, number, number, number, number];
export function numberTupleRows(input: unknown, width: 3 | 4 | 5): [number, number, number] | [number, number, number, number] | [number, number, number, number, number];
export function numberTupleRows(input: unknown, width: 3 | 4 | 5): number[] {
  if (width === 3) return v.parse(numberTriple, input);
  if (width === 4) return v.parse(numberQuad, input);
  if (width === 5) return v.parse(numberFive, input);
  throw new Error('Unsupported author numeric tuple width');
}

/** Admit ordered model references without installing a species, scene or Explorer owner. */
export function explorerCatalogueRows(input: unknown): ReturnType<typeof parseExplorerCatalogue> { return parseExplorerCatalogue(input); }

/** Admit authored NPC figure motion without creating a figure or loading a skeleton. */
export function npcFigureRows(input: unknown): v.InferOutput<typeof NpcFigureRowsSchema> { return v.parse(NpcFigureRowsSchema, input); }
/** Admit complete trader page policy before any shop or inventory owner exists. */
export function questTraderRows(input: unknown): v.InferOutput<typeof QuestTraderSchema> { return v.parse(QuestTraderSchema, input); }
/** Admit the native bounded barter grammar and its original cross-row checks. */
export function barterEconomyRows(input: unknown): ReturnType<typeof parseBarterEconomy> { return parseBarterEconomy(input); }
/** Complete author exchange tables; no affordability, storage or transaction service is lent. */
export type AuthorExchangeRows = ExchangeRows;
/** Admit held graph/rig bindings and native resource checks without constructing a view or material. */
export function graphArmsRows(input: unknown): ReturnType<typeof parseGraphArms> { return parseGraphArms(input); }

/** Resolve admitted equipment presentation without lending a catalogue or weapon service. */
export function equipmentRows(input: unknown, id: string): ReturnType<ItemCatalogue['equipment']> { return new ItemCatalogue(input).equipment(id); }

/** Numeric row declarations and registered view/presentation recipes. */
export type ShardRows = GameShardRows;
/** Validate row declarations without renderer or runtime code. */
export const RowsSchema: typeof GameRowsSchema = GameRowsSchema;
/** Parse author rows before JSON serialization can erase invalid closures. */
export function parseRows(input: unknown): ShardRows { return gameParseRows(input); }
/** Independent data-only check for functions, accessors, cycles and lossy JSON values. */
export function isJsonData(input: unknown): boolean { return gameIsJsonData(input); }
/** An admitted item catalogue (the `items` section). */
export type ShardItems = GameShardItems;
/** Validate an item catalogue before it is serialized (GR8: a shard program calls this instead of a bake script). */
export function parseItems(input: unknown): ShardItems { return gameParseItems(input); }
/** One admitted client channel program. */
export type ClientChannelProgram = GameClientChannelProgram;
/** Validate client channel programs before they are serialized. */
export function parseClientChannels(input: unknown): ClientChannelProgram[] { return gameParseClientChannels(input); }
/** One admitted elite encounter feature (its fights and their spawn programs). */
export type EliteFeature = GameEliteFeatureRows;
/** Validate an elite feature before it is serialized or its fights compiled. */
export function parseEliteFeature(input: unknown): EliteFeature { return gameParseEliteFeature(input); }
/** The registry ids a spawn program's generated ABI header uses (GR8: a shard program compiles its guests with them). */
export function spawnRegistries(program: Parameters<typeof gameSpawnScriptRegistries>[0]): DecisionRegistries { return gameSpawnScriptRegistries(program); }
/** A spawn script's admitted rows (its ABI-1 script, slots, sites, strikes and moves), as the decision compiler reads them. */
export type SpawnScript = GameSpawnScriptRows;
/** Admit an authored spawn script; the decision compiler builds its module from these rows (spawnRegistries). */
export function parseSpawnScript(input: unknown): SpawnScript { return gameParseSpawnScript(input); }
/** A decision script's registry ids by kind. */
export type DecisionRegistries = GameDecisionRegistries;
/** One admitted compendium journal row. */
export type JournalRow = GameJournalRow;
/** Validate a journal row and its cross references before it is serialized (GR8: a shard program calls this). */
export function parseJournalRow(input: unknown): JournalRow {
  const row = v.parse(GameJournalRowSchema, input), errors = gameJournalRowRules(row);
  if (errors.length > 0) throw new Error(errors.join(', '));
  return row;
}
/** One admitted contract catalogue (the board's rows and its programme row). */
export type ContractCatalogue = GameContractCatalogue;
/** Validate a contract catalogue before it is serialized (GR8: a shard program calls this instead of a bake script). */
export function parseContractCatalogue(input: unknown): ContractCatalogue { return gameParseContractCatalogue(input); }
/** Admit board catalogue, panel and store ownership through every defining cross-row check. */
export function contractBoardPageRows(input: unknown): ReturnType<typeof parseContractBoardPage> { return parseContractBoardPage(input); }
/** One admitted forest community (a shard's ambient life policy). */
export type AmbientLife = GameAmbientLife;
/** Validate an ambient life policy before its page rows are built. */
export function parseAmbientLife(input: unknown): AmbientLife { return gameParseAmbientLife(input); }
/** One page's admitted life rows (flocks, foragers, carcasses, guide, harvest). */
export type PageLifeRows = GamePageLifeRows;
/** Validate a page's life rows before they are serialized (GR8: a shard program calls this). */
export function parsePageLife(input: unknown): PageLifeRows { return gameParsePageLife(input); }
/** One admitted population environment (the habitat a roster's herds read). */
export type PopulationEnvironment = GamePopulationEnvironment;
/** Validate a population environment before it is serialized (GR8: a shard program calls this). */
export function parsePopulationEnvironment(input: unknown): PopulationEnvironment { return v.parse(GamePopulationEnvironmentSchema, input); }
/** One admitted figure catalogue (people's figures, anchors, skins and cards). */
export type FigureCatalogue = GameFigureCatalogue;
/** Validate a figure catalogue before it is serialized (GR8: a shard program calls this). */
export function parseFigureCatalogue(input: unknown): FigureCatalogue { return v.parse(GameFigureCatalogueSchema, input); }

/** Admit data-only equipment, collection and ambience page composition. */
export function parseRangedPage(input: unknown): v.InferOutput<typeof RangedPageSchema> { return v.parse(RangedPageSchema, input); }

/** Admit a declared page/audio/guide observation binding without installing a service. */
export function parseForestWeatherObservation(input: unknown): v.InferOutput<typeof ForestWeatherObservationSchema> { return v.parse(ForestWeatherObservationSchema, input); }

/** Admit bounded rain presentation, ordered roof polygons and native bake rows. */
export function parseRainPresentation(input: unknown): v.InferOutput<typeof RainPresentationSchema> { return v.parse(RainPresentationSchema, input); }

/** Admit bounded achievement policy without borrowing progress or storage. */
export function achievementCounterRows(input: unknown): ReturnType<typeof parseAchievementCounterData> { return parseAchievementCounterData(input); }
/** Admit portable ordered quest steps with their defining cross-row checks. */
export function questStepRows(input: unknown): ReturnType<typeof parseQuestStepRows> { return parseQuestStepRows(input); }
/** Admit bounded control hints and their existing observation grammar. */
export function questHintRows(input: unknown): ReturnType<typeof parseQuestHintRows> { return parseQuestHintRows(input); }
/** Admit quest service actions without installing page services. */
export function questServiceRows(input: unknown): ReturnType<typeof parseQuestServiceActions> { return parseQuestServiceActions(input); }
/** Admit borrowed page interaction identities and their original restore rules. */
export function questPageInteractionRows(input: unknown): ReturnType<typeof parseQuestPageInteractions> { return parseQuestPageInteractions(input); }
/** Admit native quest service spots through their defining composition grammar. */
export function nativeQuestServiceSpotRows(input: unknown): ReturnType<typeof parseNativeQuestServiceSpots> { return parseNativeQuestServiceSpots(input); }
/** Admit cover appearance rows without constructing a material. */
export function coverAppearanceRows(input: unknown): ReturnType<typeof parseCoverAppearance> { return parseCoverAppearance(input); }
/** Admit a weather program's detached rows without starting weather. */
export function weatherProgramRows(input: unknown): ReturnType<typeof parseWeatherProgram> { return parseWeatherProgram(input); }
/** Admit complete quest composition data, including caller-owned entry resources. */
export function questPageCompositionRows(input: unknown): v.InferOutput<typeof QuestPageCompositionSchema> { return v.parse(QuestPageCompositionSchema, input); }
/** Admit cover ownership references without constructing ground or geometry. */
export function coverCompositionRows(input: unknown): v.InferOutput<typeof CoverCompositionSchema> { return v.parse(CoverCompositionSchema, input); }

/** Admit a complete carried-quest continuation with native state/event ownership checks. */
export function carriedQuestRows(input: unknown): ReturnType<typeof parseCarriedQuest> { return parseCarriedQuest(input); }

/** Admit only explicitly selected native manifest fields, retaining their full
 * defaults, nested grammars and issue paths without lending unrelated metadata. */
export function manifestFieldRows<const Keys extends v.ObjectKeys<typeof ManifestMetadataSchema>>(keys: Keys, input: unknown):
  v.InferOutput<ReturnType<typeof v.pick<typeof ManifestMetadataSchema, Keys>>> {
  return v.parse(v.pick(ManifestMetadataSchema, keys), input);
}
