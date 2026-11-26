# The push gate's watch parity red was the arrival caption, not the renderer (opus-parity149, meta QA 11-25 row 149)

- Three lanes pushed with `SKIP_CHECK=1` because the gate's `check:watch-build` read hut-front 16/255 over 33.6% of the
  frame while a local run read 3.2/255. Every other camera matched its baseline to the third decimal, so the renderer,
  the GPU flags, the engine pin and the dev client were the same on both sides.
- Reproduced the gate's way: a clean clone, `pnpm install --frozen-lockfile --prefer-offline`, the parity alone under
  `desktop-gpu.lock` at load 5 to 8, read the same 16.234/255 33.62%. The page text named it: the built frame had the
  grid arrival reveal's "Arriving at Authoring Slice / Tap to skip" caption over it. The reveal runs 3 s from the first
  gated frame; the first shot comes 2.5 s after the player exists, so a page that boots slower (a loaded machine, a
  cold clean copy) is still mid-reveal. A local run on a warm checkout was not.
- opus-lamp138's 6c415d40 (row 138) waits for `__wsReveal.endedMs` and hides the caption; after it the clean copy reads
  3.35/255 4.1% three times. No threshold or baseline moved here.
- What stops the next one: each page shoots its first camera again after the others and must match. A frame that
  changes while the camera stands still fails as "shot before it settled", naming the page text that came or went (the
  pre-fix parity now fails that way every run, 13.1/255 29%, on the watch page too). A red row names page text one
  frame has and the other lacks. Frames are always written, and the gate's copy writes them to
  `tmp/push-gate/watch-parity/` outside the copy it deletes.
- `node .githooks/push-gate-copy.mjs -- <command>` runs any step in a clean copy the gate's way, with its test.
- Left open: the slice's grass and motes move on their own clocks (0.3/255 over 0.6% between two shots of one camera),
  so two runs differ by up to 0.16/255 at hut-front against a 0.25 margin. Freezing them is the follow-up row.
