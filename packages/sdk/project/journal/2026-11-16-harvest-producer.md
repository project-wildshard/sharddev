# Emit harvest through the ordinary build

> Written by: Codex
> **State:** candidate integration built, 2026-11-16; OF31b2b remains
> pending released dependencies. Format edf5464, engine M1 source.

Kit boar/bear content declares its former ordered harvest. The helpers
return referenced item rows as well as gameplay and assets. The item's
metadata is copied from engine ec71dd0365's starterItems.json and
shard-driftwood cf35349's src/generators/questInventory.ts: labels, icons
and travel flags stay exact. Existing authored metadata wins.

The normal project build and handwritten settlement expand older rows,
write species and item sections together and admit the resulting product.
Native species-program sections also gain explicit drops, including
spawn-only variants, without requiring or changing a hunting owner. No
runtime table or pack policy is changed. Explicit empty harvest stays
empty. At most 128 native variants become non-overlapping groups of 64.

Fourteen SDK controls cover the real build, section rehashing, handwritten
settlement, kit assets and retained gameplay. Sixteen kit controls include
independent old-law results, mutation/RNG checks and a full native roster.
All three normal SDK products build against the recorded candidate
contract. Full types, author lint and API generation pass. Final released
format/engine pins and publication remain open; no candidate link lands.
