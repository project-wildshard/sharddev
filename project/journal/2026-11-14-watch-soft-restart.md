# watch: gameplay soft restart (SHARD-SOURCE AP19)

opus-ss5b, 2026-11-14. A scene shard's quests, encounters, spawns and scripts come from `defineShard`'s `extend`, which `watch`
never looked at, so a quest edit did nothing. `sceneGameplay` now runs `extend` over an empty shardfile and splits what it adds:
the gameplay sections (`GAMEPLAY_SECTIONS`, the same list as engine's `DEV_GAMEPLAY_SECTIONS`) go to the page by hash and drive
the dev hook's v4 `restartGameplay` (the in-page server restarts from a save, the quest views are rebuilt); anything else it adds
is in the shell key, so a change there is a new shell. Ten quest objective edits on the slice: median 120.5 ms file write to
the new words on screen, server restart about 40 ms, no reload, the player moved under a millimetre.
