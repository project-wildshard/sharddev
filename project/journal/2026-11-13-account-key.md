# 2026-11-13: upload sends the account key (meta SHARD-DELETE DEL6)

> Written by: Claude

- api-server v0.7.0 (DEL5) answers a keyless ticket or commit 401, so
  every sharddev upload was refused. Upload now sends
  `Authorization: Bearer wsk_…` on the ticket and the commit only (not
  the public reads, never to R2), from `WILDSHARD_API_KEY` or
  `~/.config/wildshard/sharddev-key`; no key refuses before any request
  (`account-key-missing`).
- `wildshard account <email>`: one `POST /api/accounts`. The key file
  is opened (a `.new` draft beside it, mode 600) before the request, so
  a key the API shows once is never lost to an unwritable folder; it is
  linked into place, or renamed over the old one with `--force`. A 409
  says a lost key needs an operator reset.
- `wildshard whoami`: api-server has no route that names a key's
  account, so it prints the key's source and first characters only.
- The key goes only to https or loopback; a malformed key is refused
  without echoing it. The test double (`auth-double.ts`) now checks the
  key and makes accounts; `main.test.ts` passes a dummy key so no test
  reads the real key file.
- CI reads the `WILDSHARD_API_KEY` repo secret on main pushes; Jake
  sets it (not set by this lane).
- Live: a ticket-only call through `requestTicket` with the key file's
  key on a stored hash answered 200 `{stored:true}`; no key and an
  unknown key 401. Nothing uploaded.
- `src/ci/installed.test.ts`'s SA3 upload test was already red on main
  (it uploads an unprepared draft); not this change.
