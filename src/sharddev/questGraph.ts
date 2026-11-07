import * as v from 'valibot';
import type { InteractTable } from '@wildshard/engine/world/interact/types';
import { NpcRowSchema as npcSchema, parseNpcRow as parseNpc, parseNpcDialogueRow as parseDialogue, type NpcDialogueRow as Dialogue, type NpcRow as Npc } from '@wildshard/format/npcs';
import { compileQuestTable as compileTable } from '@wildshard/engine/game/plugin/quests';
import { QuestGraphSchema as graphSchema, parseQuestGraph as parseGraph, type QuestGraphRow as Graph } from '@wildshard/format/questGraph';


/** A quest-giver NPC row (SF27): who it is, where it stands, what it says and how its pivot figure moves. */
export const NpcRowSchema: v.GenericSchema<unknown, Npc> = v.pipe(npcSchema);
/** A validated quest-giver NPC row. */
export type NpcRow = Npc;
/** Compile an authored NPC row; an unknown field or an empty dialogue refuses. */
export function parseNpcRow(input: unknown): Npc { return parseNpc(input); }
/** A quest graph's runtime row (SF27): its interaction actor, its marks' step id and its actions (`summon` a boss). */
export const QuestGraphSchema: v.SchemaWithPipe<readonly [typeof graphSchema]> = v.pipe(graphSchema);
/** A validated quest graph runtime row. */
export type QuestGraphRow = Graph;
/** Compile an authored quest graph runtime row; an unknown field refuses. */
export function parseQuestGraph(input: unknown): Graph { return parseGraph(input); }

/** Compile dialogue for a skinned or pivot NPC while its existing view owns the figure. */
export function parseNpcDialogueRow(input: unknown): Dialogue { return parseDialogue(input); }

/** Compile supported table flag actions while the current renderer and modal owner keep their side effects. */
export function compileQuestTable(table: InteractTable, bindings: readonly { readonly id: string; readonly act: number }[]): ReturnType<typeof compileTable> { return compileTable(table, bindings); }
