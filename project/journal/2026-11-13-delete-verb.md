# 2026-11-13: `wildshard delete <slug>` (meta SHARD-DELETE DEL10)

> Written by: Claude

- api-server v0.9.0 (DEL8) lets the owner's `wsk_` key make DEL1's two
  delete calls. `wildshard delete <slug>` makes them back to back, as
  J307 asks: start, print the summary (versions, channels pointing at
  it, grid cells placing it, and start's `note`, which says whether a
  signed release still plays the shard), ask the author to type the
  slug, then finalize with the confirm token. Anything but the slug, or
  no input at all, finalizes nothing and exits 1
  (`delete-not-confirmed`); `--yes` skips the typing for scripts.
- An expired or spent token (finalize's 409) says how to start again
  (`delete-expired`). 403, 404 and the grid 409 have their own rules;
  the step's catch-all is `delete-refused`. GUIDE.md: "Deleting a
  shard" in section 1, "Delete" in section 6.
- The key comes from `WILDSHARD_API_KEY` or the key file, as upload's
  (DEL6), and goes only to https or localhost; a slug that is not
  shard-format's slug shape refuses before any request. The key and the
  confirm token are never printed. The glue lives in
  `src/cli/account/command.ts` beside account and whoami (main.ts is at
  its import limit); the calls are `src/cli/delete/delete.ts`.
- Finalize's answer gains `cells` once api-server frees grid cells on
  delete (SA31, in progress there); the CLI prints it when present.
- Tests (`src/cli/delete/delete.test.ts`) run the real CLI against the
  upload double, which now answers the two delete calls
  (`delete-double.ts`); `runCli` can type on stdin.
- Live: the operator key on the already-deleted, operator-owned proof
  slug `upload-proof-20261113` (owner start and finalize on a deleted
  slug leave `deletedAt` unchanged and touch no channel, DEL8). A wrong
  typed slug exited 1 with nothing finalized; the typed slug finalized
  200 with `deletedAt` unchanged and no channel touched; the five public
  reads were byte-identical before and after. No live shard was touched.
