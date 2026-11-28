# sharddev main gets its own watch

Main sat red unseen twice on 11-26, three hours the second time,
because engine's main-watch only ever read engine. Now the push gate
hands every main push it passes to src/scripts/main-watch.mjs, which
waits for main's ci and writes the verdict to the lanes' receipts:
green (a LIFT after a red), or MAIN RED naming the lanes whose commits
are in the range. It stays small on purpose: no budgets, no nightly,
one receipt per run, gh polled once a minute.
