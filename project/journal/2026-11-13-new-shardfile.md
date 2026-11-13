# New project's shard file (2026-11-13, lane opus-newfix)

- `wildshard new` copied Template's `shardfile: /shardfiles/_template/shard.json`
  into the new `manifest.json` and `data/card.json`. The page loads that path, so
  a new shard booted Template's file and hung at "Preparing application services"
  (UP5 found it; meta SHARD-AUTHORING SA16). It now writes
  `/shardfiles/<slug>/shard.json`; `newProject-shardfile.test.ts` pins it and that
  no `_template` string is left in either file.
- The copy also skips `_template/public/shardfiles/` (a checkout's gitignored built
  Template output), which a new project never needs.
- Still SA16's: `--template sdk|blender`, the whole single-shard repo at `src/`,
  a `package.json` (with the pnpm 10.34.9 pin SA39 wants). Also seen: `new <dir>
  <slug>` with a slug unlike the folder name makes a project `build` refuses
  (`project-folder-slug`).
