# Prepare without an engine checkout (SA43, 2026-11-13, opus-sa43)

> Written by: Claude

- `wildshard prepare <folder>` needed `--base`, the URL of an engine worktree's `WILDSHARD_PREPARATION_ONLY` preview,
  so an author with only the SDK could not turn a draft into the sdk 0.3 shard file the API admits.
- With no `--base`, prepare now fetches engine's preparation client (`preparation-client.tar.gz` on the release at
  the engine pin, engine `55dc055d`) once into the dev-client cache as `<tag>-preparation`, serves it with the draft's
  `shard.json` inline (`scripts/preparation-preview.mjs`), and the recorder enters at `?skipintro&sw=0`, as
  `wildshard dev` does. The in-page server still reads `/shardfiles/<slug>/shard.json`, so the exact-header check holds.
- The recorder ran under `spawnSync`, which froze the process now serving its page; it runs async.
- Proof: a `new` project outside every checkout, built, prepared in 4 s (35 programs, fence 177, UP5 had 35 and 178)
  and built again; api-server's commit-path stream check admits the sdk 0.3 shard file.
- Owed: the engine pin moves to a release that carries the asset, then a sdk release.
