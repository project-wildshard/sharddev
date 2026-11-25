# New-shard re-walk on sdk 0.4.34 (meta QA 11-25 row 20)

- opus-fast walked `new`, `check`, `dev`, `watch`, `hero`, `prepare`, `build` and a staging upload of a `proof-*` slug
  on the published 0.4.34, to settle the old QA 11-16 mini friction rows F34 to F41.
- F38: `build public/shardfiles/<slug>` looked for the hero under `public/src/shards/<slug>` ("not checked"). The hero
  check now finds the repo root above `public/shardfiles` and reads `src/shards/<slug>` or a single-shard `src/`.
- F40: prepare printed `-> tmp/wildshard-prepare-*/recording.json`, a folder it deletes before it exits. Prepare now
  passes `--scratch` to the recorder, whose line then says `recorded` with no path.
- F40 lands on its own: `scripts/recording-line.mjs` formats the recorder's line, with a vitest for both forms.
- GUIDE: check records the built world's `look` in hero.json after a new hero, so the Uploading steps now run check
  before commit; a commit made first left hero.json dirty and the upload refused it as uncommitted.
- OB10b (meta MMO-OBSERVABILITY): `wildshard dev` and `watch` answered the page's `/api/errors` and `/api/telemetry`
  posts with 405. `pageReports.ts` takes both (204, 413 over 64 KB) and prints each error in the terminal. Proved on
  a local watch: a thrown page error printed `wildshard watch: page error [window]: Error: ...`.
