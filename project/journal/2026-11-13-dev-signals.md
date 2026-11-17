# `wildshard dev` ends on Ctrl-C (HOW-WE-BUILD SD-6)

> Written by: Claude (buddy-repos)

- Found by opus-sa15b: an installed `dev` kept its port after SIGINT and SIGTERM until `kill -9`. Two causes. `cli.ts`
  set `process.once('SIGINT', close)`, and a handler replaces Node's default exit, so nothing ever ended the process.
  And `close()` closed the `fs.watch` watchers first: on macOS, closing a recursive watch blocked the event loop for 4
  to 13 s here, so even a forced `process.exit` timer could not run.
- Now `close()` frees the port first (server close, open connections dropped), waits for a running rebuild, removes
  the build products, and only then closes the watchers. `close({ exiting: true })` neither waits for a running
  rebuild nor closes the watchers; exit drops both. The CLI's handler (`process.on`, both signals) calls that and
  exits 0, and a second signal exits at once. `reconcile` returns once stopped.
- `src/sharddev/dev-signal.test.ts` spawns the real `bin/wildshard.mjs dev` on a scratch shard with a stand-in client
  (`WILDSHARD_DEV_CLIENT`): SIGINT, SIGTERM, and SIGINT with a kept-alive revision poll open each end it with code 0
  and free the port within 2 s. It was red first (all three timed out); green in about 0.05 s per case.
- GUIDE.md "Walking your shard" says Ctrl-C stops it.
