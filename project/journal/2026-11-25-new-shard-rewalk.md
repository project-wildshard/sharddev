# New-shard re-walk on sdk 0.4.34 (meta QA 11-25 row 20)

- opus-fast walked `new`, `check`, `dev`, `watch`, `hero`, `prepare`, `build` and a staging upload of a `proof-*` slug
  on the published 0.4.34, to settle the old QA 11-16 mini friction rows F34 to F41.
- F38: `build public/shardfiles/<slug>` looked for the hero under `public/src/shards/<slug>` ("not checked"). The hero
  check now finds the repo root above `public/shardfiles` and reads `src/shards/<slug>` or a single-shard `src/`.
- F40: prepare printed `-> tmp/wildshard-prepare-*/recording.json`, a folder it deletes before it exits. Prepare now
  passes `--scratch` to the recorder, whose line then says `recorded` with no path.
