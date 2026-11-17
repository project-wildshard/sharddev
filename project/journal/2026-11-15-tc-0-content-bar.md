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

Final-land review fixes: accept the documented spaced bar flag as well as
its equals spelling. CLI tests allocate an owned scratch parent in a
fresh checkout and invoke the actual bin. Malformed sections fail with
exit 2, distinct from a measured content shortfall (3). Help and GUIDE
both list the command. All 28 CLI/help checks and four guide checks pass,
along with lint, types and formatting. The review's count-definition
improvements remain a follow-up; no content rows change here.
