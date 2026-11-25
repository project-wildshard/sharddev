# Pastel Plain's map names retiredSections.ts

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

Main's `check` went red at 3b79b2ad on the ci21-source case
"pastel-plain map names exactly the SDK files its generators reach".
FP20 (c1a2da13) added `src/sharddev/retiredSections.ts` and
`projectOutput.ts` imports it, so Pastel Plain's generators reach it,
but its `data/map.json` inputs did not name it. Added. The sdk 0.5.0 cut
(R1, A7) waits for a green main with t16's format-override fix, so this
was fixed forward here rather than waiting on FP20's session.
