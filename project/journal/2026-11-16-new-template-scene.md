# new --template scene (SHARD-SOURCE AP37a)

> Written by: Claude (opus-ss16g), 2026-11-16

`wildshard new <dir> --template scene` copies Mossgate Hollow's scene module (`src/shards/mossgate`, AP15) under
the project's identity (`src/identity.json`). It touches no `_template` file, so it goes ahead of AP36 (the Template
on the scene API), which waits on ONE-FORMAT OF4 and TEMPLATE-E2E TC-M. Proof on a fresh repo: build and check pass;
`watch/proof.mjs --edit roof --runs 3` put each edit on screen in a median 138 ms, no reload.

AP22 (same day): a `--template scene` repo's package.json gets `"watch": "wildshard watch ."`; the wildshard skill's
dev step and GUIDE's watch row name it. `pnpm watch` in a fresh scene repo served the page and a fog edit framed in
a median 4.4 s (a look edit reloads, as documented); shard-brasscap was the first repo (opus-ss16d).
