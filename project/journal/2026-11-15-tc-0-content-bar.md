# TC-0: content bar

> Written by: Codex

`wildshard content <built-shard-dir>` counts the content that players can
actually receive from a built shard's format-2 sections. It deliberately reads
both the familiar row envelopes and the native platform sections, rather than
source folders, so the reported bar is also what a release would contain.

`--bar templates` checks the J357 template minimums and exits non-zero while
naming every short line. The current Mossgate build demonstrates the intended
failure: it has weapons, quests and dialogue, but remains short on pickups,
enemy breadth, hostile strikes, the boss move set, an NPC and a mover.
