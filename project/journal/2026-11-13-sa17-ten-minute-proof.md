# SA17, the ten-minute proof (opus-sa17)

- Timed a fresh folder outside every checkout on the packed SDK: `new`,
  `pnpm install`, `dev`, a walk, the author's own change (the hut renamed),
  `hero`, `check pass`, commit. 76 s with warm caches.
- Three blockers fixed on the way:
  - `hero` could not run without an engine checkout: the `dev` page's SHARD
    SELECT lists engine's shards, not yours. `hero` now knows a `dev` server
    (it answers `/__wildshard_dev_revision`) and enters by `?skipintro`; it
    takes the URL `dev` prints as `--base`.
  - `hero` refused `new`'s generated `data:` card. It now writes
    `card/<slot>.jpg` and names them in `manifest.json` and `data/card.json`
    (build refuses the pair when they differ).
  - Every `dev` page logged a 404 for `programs/<slug>.json`: a draft has no
    recorded programs. The page's boot bank now says
    `entryPrograms[slug] = false`, which engine reads as "none published".
- Still owed for SA17: `prepare` needs an engine preparation preview, so an
  upload still needs an engine checkout; and npm's 0.2.6 has no `dev`.
