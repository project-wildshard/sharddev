# 2026-11-13 pack folds into build (SHARD-AUTHORING SA3)

- meta SHARD-AUTHORING SA3 (J170, approved J317 "before the guide"):
  `wildshard build <project>` now writes the shard file itself,
  `<slug>.shardfile` beside the folder, and runs what `pack` ran: the
  stale-hero refusal, format's validator on the tarball, AU5's audio
  lines. `check`'s build step does it too and names the file. The
  author loop is new, dev, check, hero, upload.
- The hero check now reads the project `build` named. Before, a default
  `public/shardfiles/<slug>` folder never matched the `out/<name>`
  layout, so the check never ran from an author build. Today
  `wildshard build src/shards/_template` refuses: the template's hero
  (captured 2026-11-12 22:39) is older than its content. Recapturing
  needs a served build and a GPU, outside this row.
- `--folder-only` (old name `--product-only`, kept so shard repos and
  shard-format's rebake behave as before) writes no shard file:
  build-shards caches its folders and `prepare` edits them before
  `pack-all.mjs` tars them with `wildshard build <folder> <file>`.
- `pack` stays as a deprecated alias with one line naming `build`.
  Shard repos' own `scripts/pack-all.mjs` still say `pack` until their
  next sdk bump; it keeps working.
- Bytes: `_template` fc8092c6 from old build + pack and from the new
  build; a clean shard-dunes clone 3eac9c09 from its pinned pack and
  from `build <folder>`.
