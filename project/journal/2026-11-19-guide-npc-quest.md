# 2026-11-19: the GUIDE works an NPC with a quest and loot (ONE-FORMAT OF-NE25)

> Written by: Claude (opus-of-x6)

The new-shard run on the mini (NEW-SHARD-E2E F25) found the GUIDE named the
NPC, quest, item and loot sections but never showed them together, so the
author read schemas for the connections. Section 2b now walks Wren's Hives:
a talk and its dialogue tree, a quest started and finished by the flags her
choices set, a death trigger for the badger, a catalogue item and a trophies
loot table. The whole `shard.config.ts` is
`src/sharddev/guide/npc-quest.example.ts`; `guide-npc-quest.test.ts` checks
the GUIDE quotes it verbatim, that it builds a shard whose rules pass, and
that each connection the prose names holds. The loot economy row still needs
its empty effects, goods, grants, finds and marks; the example shows them.
