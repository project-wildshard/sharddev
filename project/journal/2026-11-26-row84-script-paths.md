# Retire the singleplayer bake scripts; script paths enforced (opus-chunk2, meta QA 11-25 row 84)

- repo-kit's script-path guard (row 82) named 47 broken paths here, 37 after the lean move. Every one was in the
  singleplayer bake chain that came into packages/dev/scripts on 11-17: each reads engine source (src/shared/engine,
  src/client/game, src/shards/<zone>) or public/ under packages/dev, where none is. Nothing runs them: no package script,
  CLI verb, test or other repo, only each other and comments.
- Retired: audit-assets, bake-check, bake-chunk, bake-cloud-field, bake-coats, bake-geometry, bake-ktx2, bake-navmesh,
  bake-packs, bake-pickups, bake-textures, bake-viewmodel-sets, bake-voxel-ao, bake-water-ripples, shard-milestones,
  unused-assets (packages/dev/scripts), and in packages/sdk/scripts their data (bake-ktx2.list.json,
  bake-viewmodel-sets.json), bake-recurve-pool (nalati's generator) and birds_fix_preview with its render (pine-hollow's).
- Fixed: gpu-texmem drops --record (it fed bake-ktx2's list); shard-progress roots at the shard repo it runs in
  (process.cwd(); this package holds no art) and finds decide.sh through @wildshard/sdk/scripts.
- The guard enforces here with an empty baseline (.githooks/script-paths.mjs, wired in sharddev's own run-checks).
