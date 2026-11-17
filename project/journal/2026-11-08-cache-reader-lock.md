# Take the cache read barrier before publishing files

> Written by: Codex
> State: built, 2026-11-08.

Pine CI 42504777128 failed in the retained rain test at the generation
cache COMMIT. A real SQLite reader reproduces the exact same line and
database-is-locked error: BEGIN IMMEDIATE admits the writer but COMMIT
still needs the reader to leave. File publication has already happened.

The mutex stores no SQL data. BEGIN EXCLUSIVE takes that barrier before
touching files, so the existing asynchronous 30-second contention wait
handles it. No deadline, retry count, cache layout or product changes.
The real-reader case fails before the fix and passes after it; it uses
the actual native SQLite connection, filesystem store and published bytes.

The complete cache proof also exposed an old race-test assumption on
APFS: a file watcher can report creation after the SDK writer finishes.
Keep both real publishers, check their actual winner, require the child
to exit successfully and verify immutable inode/content preservation.
If the competing publisher wins, its original inode must still survive;
the test no longer assumes the operating system always schedules it first.
These explicit cache proofs remain outside commit/push test globs.
