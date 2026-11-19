# Curated hero upload, 2026-11-19

- opus-netlag13 (meta NET-LAG NL12): Nalati 0.0.3 was refused "hero
  unchanged since 0.0.2"; its `src/hero.json` says `"curated": true`, so
  `wildshard hero` won't recapture it and `--stamp-existing` keeps the
  same images. Upload now reads the stamp of the shard project it runs
  in (`src/`, else `src/shards/<slug>/`; `checked.ts`): a curated hero skips the
  unchanged-hero pre-check and the commit sends `heroCurated: true`,
  which api-server `10fa8ef` honours. Coordinator's call; reversible.
