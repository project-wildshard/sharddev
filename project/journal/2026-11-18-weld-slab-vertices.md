# Weld byte-identical slab vertices

> Written by: Codex
>
> **State:** qualified locally, 2026-11-18. ENGINE-MEMORY EM28.

The slab cook can share vertices when every stored channel word matches.
Weld within a gridded chunk after packing. Replay the same triangles in the
same order under the same material. Signed zero and distinct half-float
words remain distinct. The row budgets the four-word Metal position stride.

On Nine, the combined cook with packed shader channels and this weld reduced
1,152,400 stored vertices to 1,092,553. Both arms carry 704,230 triangles.
The five compact slab files total 16,738,872 bytes and their aligned upload
budget is 47,809,494 bytes. The float cook had 25,622,560 wire bytes and
77,961,734 planned upload bytes.

Six alternating shared-lock Phone Low pairs on native WebKit reproduce
110,671,586 to 84,831,404 control WebGL buffer bytes on engine `28f7e96c`.
All six passed the native Nine ledger guard. The nine-view board was sent
before landing. This source change has no effect on existing pinned slabs.
