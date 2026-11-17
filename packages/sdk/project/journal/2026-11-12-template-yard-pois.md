# 2026-11-12: Template 1's yard POIs

Meta TEMPLATE-E2E S-T1.0 (BUILD-MAX-APPROACH SD-3).

`_template`'s manifest named three places (hut, Greyback, Barrow
Warden). It now also names the blob, the moss gate, braziers A and C
and the Lamplighter, each on its `data/layout.json` point, so a
Template 1 spec can walk to `poseAt('mossgate')` instead of copying a
coordinate. Names only: no layout, content or look change (J281).

`generators/pois.test.ts` scans `layout.json` for every station within
25 m of spawn, checks each has a POI on it, and resolves each with a
`poseAt(id)` that puts it on the ground at spawn's standing height.
Brazier B (39.7 m) and the pond (32 m) are past 25 m and stay
unnamed; bringing them in is a layout move, so a content row.

Follow-up: CI's `build:shards` refused `_template` ("Authored manifest
differs from configured level metadata"). `generators/product.ts` ships
`data/card.json` as the shardfile's manifest, a second copy of the
manifest, so it needs the same POIs. Added, plus a test that the two
stay equal. `pnpm check` alone never builds the shards; run
`pnpm build:shards` and `test/ci/owned-journey.test.mjs` for a manifest
change.
