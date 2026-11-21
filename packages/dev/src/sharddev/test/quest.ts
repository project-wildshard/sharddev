import { QuestLine, QuestState, lineFor } from '@wildshard/engine/quest/core';
import { Flags } from '@wildshard/engine/world/interact/flags';

/**
 * SHARD-COMPAT CP18b (meta): quests over authored rows, with no built folder, from `@wildshard/dev`'s engine pin.
 * A shard's quest-content tests (Mirror Salt's cup, Nalati's chapters, Pine's lantern rows) used to construct engine's
 * `Flags` and `QuestState` themselves; they get the same objects here, so the shard lists no `@wildshard/engine`.
 */
type QuestDef = ConstructorParameters<typeof QuestState>[0];
type NpcDef = Parameters<typeof lineFor>[0];

/** A world's flag store for one test, never persisted. `set` the names a quest's `startWhen` needs to start it. */
export function questFlags(slot: string, set: readonly string[] = []): Flags {
  const flags = new Flags(slot, false);
  for (const name of set) flags.set(name);
  return flags;
}

/** One authored quest (a `quests.quests` row) judged by the real quest host over `flags`. Dispose it when done. */
export function authoredQuest(quest: QuestDef, flags: Flags): QuestState {
  return new QuestState(quest, flags);
}

/** Several authored quests run as one line, in order, over `flags`. */
export function authoredQuestLine(quests: readonly QuestDef[], flags: Flags): QuestLine {
  return new QuestLine([...quests], flags);
}

/** The line an NPC says given these flags, or null. */
export function npcLine(npc: NpcDef, flags: Readonly<{ has: (name: string) => boolean }>): ReturnType<typeof lineFor> {
  return lineFor(npc, flags);
}
