# 2026-11-19: the hand-written seed leaves its creatures to the author

> Written by: Claude

Since TR-10 (`9b2edbe6`, J434) `writeHandwrittenSource` copies Brasscap Mesa's export, not Template 2. Template 2 held
one plain creature and no fight; Brasscap holds the Dust Wyrm's: an encounter naming its spawn and a named decision
guest naming its actors. An author who wrote creatures of their own (the GUIDE's plain JSON rabbit, shard-stranger's
`compose`) then failed to pack, first on "declared encounter actor", then on "Import signature outside ABI" (the
Wyrm's guest left in `files` with no section to give it a contract).

The seed now keeps Brasscap's place (world, look, items, quests, the player's scripts, the sand rings) and empties its
creature layer: species, creatures, strikes, looks and encounters are empty, `sim/scripts` and `actors/moves` go, and
every blob nothing names any more goes with them (the Wyrm's guest, two bodies and their skins). Test:
`handwritten-seed.test.ts`. Meta ONE-FORMAT OF25d.
