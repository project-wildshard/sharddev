> Written by: Claude (opus-pr6)

# 2026-11-24: a re-upload of held bytes carries on to the cook wait (QA-11-23-b row 45, J505)

Pine Hollow's republish run 45377272163 stopped at upload: `commit answered 409: these bytes are already pine-hollow
0.0.14`. The shard's bytes had not changed since 0.0.14 (a test-only commit), publish asked for 0.0.15, and the API's
`known` answered 409 for another version.

Now `sharddev upload` reads that 409 (exactly "these bytes are already <shard> <version>", no other channel named),
prints `these bytes are already <version>, not <asked>: carrying on with the upload that holds them`, and commits again
as the held version. The API answers that retry with the existing upload's id and status, so the run waits for its
verdict (or, with `--no-wait`, prints the same `queued: ... (upload <id>)` line publish.yml's cook job reads). A 409
naming another channel, pruned bytes or a taken version still refuses. It reaches shards with SDK 0.4.31. Tests:
`packages/upload/src/cli/upload/upload-async.test.ts` (row 45 rows) and `upload.test.ts`.
