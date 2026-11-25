# The watch e2e waits for each step of a new shell

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

Main's `products (browser)` was red on 8 of the last 27 runs, always on
author-world.spec.ts:218, "watch applies ground and collider edits and
restarts the world for gameplay edits", even after the ci retry. Jake:
"can you fix forward ?".

It is not a dropped edit. The traces of run 45557997235 (both
attempts) show the watch doing everything right: the quest edit
rebuilt the shell (revision 4, 16.7 s), the world restarted, the page
reloaded, read the release (serial 2) and dialed the new world. It was
just late. A reload is a full cold page boot, about 18 s on hosted ci's
software GL, the same shape as the first boot (release read, ~15 to 23
s of loading, a fresh read, the dial).

The test counted all of that against one 25 s clock that starts when
the release serial moves, and the serial moves in `dev-world.mjs`
`start()` when the old world stops, before the new one is ready or the
page is told to reload. On top of that the whole test had 120 s and
spends about 116 s before its last checks on hosted ci: install and
first build 29 s, a cold boot 27 s, two live edits 41 s, the new shell
17 s, the second boot 18 s.

Now the test waits for each signal in turn: the serial (45 s, a full
rebuild), the page's reload, the player in the restarted world (45 s,
a cold boot), then the new quest text (25 s, as before). The test
budget is 180 s. It stays strict about the outcome: the old quest text
must be gone and the new one shown.

It passes 3 of 3 locally before and 5 of 5 after; the slow ci path
does not reproduce on a Mac, so main's next runs are the proof.
