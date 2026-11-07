import * as v from 'valibot';
import { parsePersistedQuestPage as parsePage, parseQuestStory, type PersistedQuestPage } from '@wildshard/format/questStory';
import { QuestDataSchema as schema, parseQuestData as parseData, type QuestData as Data } from '@wildshard/format/quests';
import { parseNativeQuestComposition } from '@wildshard/format/nativeQuestComposition';
import { NativeQuestPropsSchema } from '@wildshard/format/questInteractions';
import type { InteractDef } from '@wildshard/engine/world/interact/types';
import { parseCompletion } from '@wildshard/format/completion';
import type { QuestWorldRows } from '@wildshard/format/questWorld';
import { parseQuestHost } from '@wildshard/format/questHost';
import { parsePanelDefinition, type PanelTemplate, type PanelValue } from '@wildshard/format/panelTemplate';
import { parseChapterWake } from '@wildshard/format/chapterDirector';
import { parseDeclaredQuestPage } from '@wildshard/format/declaredQuestPage';

/** Admit native chapter cues and their complete encounter, effect and system ordering. */
export function chapterWakeRows(input: unknown): ReturnType<typeof parseChapterWake> { return parseChapterWake(input); }

/** Admit complete prompt/action/restore declarations before installing a quest page. */
export function declaredQuestPageRows(input: unknown): ReturnType<typeof parseDeclaredQuestPage> { return parseDeclaredQuestPage(input); }

/** Complete authored markup and expression grammar; no DOM or input owner is created. */
export type AuthorPanelTemplate = PanelTemplate;
/** Complete authored quest-world anchors and named sites, with native mutable row contracts. */
export type AuthorQuestWorld = QuestWorldRows;
/** A native read-only panel expression over caller-owned values. */
export type AuthorPanelValue = PanelValue;
/** Admit saved-state chapter presentation with its native bounded data grammar. */
export function questStoryRows(input: unknown): ReturnType<typeof parseQuestStory> { return parseQuestStory(input); }
/** Admit command priority, actor routes and graph references before a quest owner exists. */
export function questHostRows(input: unknown): ReturnType<typeof parseQuestHost> { return parseQuestHost(input); }
/** Admit static panel markup and all native expression/action checks without constructing UI. */
export function panelDefinitionRows(input: unknown): ReturnType<typeof parsePanelDefinition> { return parsePanelDefinition(input); }

/** Compile declared quest graphs and dialogue trees with bounded, serialisable script hook names. */
export const QuestDataSchema: v.SchemaWithPipe<readonly [typeof schema]> = v.pipe(schema);
/** Validated quest/dialogue declarations consumed by the platform runtime. */
export type QuestData = Data;
/** Compile TypeScript author data after checking declared flags and graph references. */
export function parseQuestData(input: unknown): Data { return parseData(input); }

/** Admit generated page policy for the shared saved-quest presenter. */
export function parsePersistedQuestPage(input: unknown): PersistedQuestPage { return parsePage(input); }

/** Admit native quest resource ownership and its defining cross-row checks without creating a page. */
export function nativeQuestCompositionRows(input: unknown): ReturnType<typeof parseNativeQuestComposition> { return parseNativeQuestComposition(input); }

/** Admit complete captured quest floors, drop identities and gate contacts before any physical owner exists. */
export function questPropRows(input: unknown): v.InferOutput<typeof NativeQuestPropsSchema> { return v.parse(NativeQuestPropsSchema, input); }

/** Admit complete completion card/stat/find policy with its original cross-row references and plain-data checks. */
export function completionCardRows(input: unknown): ReturnType<typeof parseCompletion> { return parseCompletion(input); }

/** Compile the shared table's automatic saved/transient flag; barrels own no automatic flag.
 * This policy allocates data only, without raising a flag or installing an interaction. */
export function questAutomaticFlag(row: Pick<InteractDef, 'kind' | 'id'>): string | null {
  switch (row.kind) {
    case 'chest': case 'door': return `open:${row.id}`;
    case 'key': case 'pickup': return `taken:${row.id}`;
    case 'lever': return `lever:${row.id}`;
    case 'plate': return `plate:${row.id}`;
    case 'beacon': return `lit:${row.id}`;
    case 'bench': case 'altar': return `used:${row.id}`;
    case 'barrel': return null;
    default: return null;
  }
}
