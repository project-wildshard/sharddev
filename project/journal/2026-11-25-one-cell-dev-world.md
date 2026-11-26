# `wildshard dev` and `wildshard prepare` serve a one-cell world (opus-chunk2, CHUNK-PARAM-REMOVAL CP11, J522)

- Jake's J522: no zone in any address. `clientPage` now rewrites the client's `ws-catalogue` grid to one cell, the
  author's shard at (0, 0), beside its `ws-shardfile`. `wildshard prepare` goes through the same `clientPage`
  (scripts/preparation-preview.mjs), so it follows; dev-world's own `authorCatalogue` stamp writes the same cell and stays.
- The page boots its inline shard on `/` with no `chunk`. Engine CP10 (88865e789) first put such a page on the grid
  path, which stopped `wildshard dev` at boot (a doubled home claim, then a grid that admits only a cooked product's
  build-owned residency); engine 1c33e235f keeps an inline shard's page on its own boot. The grid path for builder dev
  is CHUNK-PARAM-REMOVAL CP25.
- The dev e2e now checks the page: `/`, a one-cell catalogue, a source edit that reloads into it, and no page address
  naming `chunk`. The world socket still carries `?chunk=` until engine CP5.
- Proof against engine 1c33e235f's devserver client, linked: author-world.spec.ts both tests green, installed-author
  21 of 21.
