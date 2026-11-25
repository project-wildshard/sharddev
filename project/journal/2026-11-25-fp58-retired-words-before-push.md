# FP58: SDK notes pass the retired-words ceiling before they push

v0.4.31's CHANGELOG used a retired word, and shard-format's one-way test (`sdk.retired-vocabulary`, ceiling 0) reads
sharddev main, so every shard-format push went red until a sharddev fix. `scripts/retired-vocabulary.mjs` repeats that
count, with the same words, files and exceptions, over each main or release branch push (`.githooks/pre-push`, so
`release.sh --prepare` passes through it too) and in `pnpm check`, naming each line. `ALLOW_RETIRED_WORDS=1` overrides.
