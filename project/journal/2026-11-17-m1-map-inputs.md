# M1 map keys cover the native source helpers

> Written by: Codex
> State: corrected before M1 land, 2026-11-17.

The additional nongraphics CI21 source gate failed both owned generator
closure controls: Template and pastel omitted nativeHuntSource.ts and
nativeLookSource.ts from their declared map inputs after M1 introduced
those helpers. Both inputs now participate in the existing map cache key.
The original closure equality and invalidation assertions are unchanged.
All61cases/eight files in the restored CI21 source gate pass, with its
compiler assertions and source lint. No generated map was restamped.
