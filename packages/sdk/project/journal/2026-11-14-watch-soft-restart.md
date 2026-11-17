# watch: gameplay soft restart (SHARD-SOURCE AP19)

opus-ss5b, 2026-11-14. A scene shard's quests, encounters, spawns and scripts come from `defineShard`'s `extend`, which `watch`
never looked at, so a quest edit did nothing. `sceneGameplay` now runs `extend` over an empty shardfile and splits what it adds:
the gameplay sections (`GAMEPLAY_SECTIONS`, the same list as engine's `DEV_GAMEPLAY_SECTIONS`) go to the page by hash and drive
the dev hook's v4 `restartGameplay` (the in-page server restarts from a save, the quest views are rebuilt); anything else it adds
is in the shell key, so a change there is a new shell. Ten quest objective edits on the slice: median 120.5 ms file write to
the new words on screen, server restart about 40 ms, no reload, the player moved under a millimetre.

Review fixes (claude -p, three MUSTs): the page asks for a new shell once per revision and never on a revision the server
refused, and the server ignores a reshell while its last shell build failed, so a source both sides refuse no longer rebuilds
in a loop. Every compile counts as an edit before the source can fail, so a texture recheck can't clear a compile error. A
save that changes nothing still runs the idle full build. `questNpcs` and `clientScripts` are a new shell (only the page reads
them), `extend` is compared with a snapshot of its input, the parity shots hide the watch panel (baseline re-recorded, same
drift) and the check also skips on a machine with no client or browser.
