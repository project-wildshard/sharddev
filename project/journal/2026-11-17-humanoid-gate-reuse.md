# Reuse the checked humanoid tree after a browser queue

> Written by: Codex
> State: ONE-FORMAT CC10a2b2a gate qualification, 2026-11-17.

J381 SKIP_CHECK=1 is used for the push of the checked dbbde124 source
plus this journal. The normal full gate passed types, strict lint,
format,1267 SDK cases,38 build cases,300 dev cases with1existing skip,
and25 Kit cases. Its watch/build parity phase then waited five minutes
for browser admission held by other lanes, before browser launch.
The held process83282 belongs to shard-brasscap and was left alone.
The gate log is tmp/codex-te2e/cc10a2b2a-browser-slot-refusal.log.

When the second holder exited, a separate normal check:watch-build
completed: watch/build matched all4views, and the planted roof difference
was correctly refused. Its native browser lease was released. The log
is tmp/codex-te2e/cc10a2b2a-watch-parity-retry.log. All remaining normal
checks after watch parity passed, including asks, agent shape/sync,
agent hooks/parity and browser/worktree/disk tooling controls; log
cc10a2b2a-remaining-checks.log. The source code is unchanged from the
checked candidate. This doc-only commit records why the push reuses it.

The capacity queue was respected. No holder was killed, no browser
admission was bypassed and no new test skip was introduced. Hosted
check/products qualification remains required on the final exact SHA.
