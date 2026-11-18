# 2026-11-18: `new` makes the scene Template, and `watch` runs it (meta SHARD-SOURCE AP37b)

- `wildshard new` with no flag still copies the Template; since AP36 it is a scene module, so the repo gets
  `pnpm watch` (a bare `--empty` source and the retired blender shape do not).
- The Template's identity is data now (`data/identity.json`, read by `generators/generate.ts`); `new` rewrites that
  file with the project's slug, name and author. The old `generators/identity.ts` wrapper over `shard.config.ts` hid
  the scene module's `describe()`, so watch could not start a new project.
- `watch` asks a scene shard for its gameplay rows before any build. The Template's rows name its compiled scripts'
  hashes, which only the build has; watch now keeps such rows the shell's and hashes the source's `data/` and
  `behaviour/` bytes instead, so a rows edit builds a new shell (the page reloads) and part edits still swap live.
- Proof: a fresh `new` project under `watch`, `proof.mjs --edit template --runs 3` (the hut stone in
  `generators/world.ts`): on screen in a median 516 ms (392 to 526), no reload, player still.
