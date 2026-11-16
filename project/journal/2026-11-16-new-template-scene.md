# new --template scene (SHARD-SOURCE AP37a)

> Written by: Claude (opus-ss16g), 2026-11-16

`wildshard new <dir> --template scene` copies Mossgate Hollow's scene module (`src/shards/mossgate`, AP15) under
the project's identity (`src/identity.json`). It touches no `_template` file, so it goes ahead of AP36 (the Template
on the scene API), which waits on ONE-FORMAT OF4 and TEMPLATE-E2E TC-M. Proof on a fresh repo: build and check pass;
`watch/proof.mjs --edit roof --runs 3` put each edit on screen in a median 138 ms, no reload.
