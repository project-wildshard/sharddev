# sharddev: design

Status: draft 2026-11-05: scaffold plus `pack` and `upload`; the rest arrives with the import.

Living doc: **how** this repo is built. What it does and why is
`docs/prd.md`. Keep this true as the code changes.

## Today

The scaffold, plus the two commands that get a built product to the server:

- `src/cli/`: the CLI (`--version`, `--help`, `serve`, `pack`, `upload`; more commands arrive with the import).
- `src/cli/pack/`: `wildshard pack` (below).
- `src/cli/upload/`: `sharddev upload` (below).
- `src/test/helpers/`: shared test helpers; `git.ts` makes real git repos in temp dirs.
- `src/server/`: the Hono app (`GET /api/health`) and `serve.ts`.
- `src/shared/`: valibot schemas used on both sides of the wire.
- `src/web/`: the Preact web app, with its own `tsconfig.json` (DOM lib).
- `src/tools/build-web.ts`: esbuild into `src/dist/web` (`--dev` watches and serves).
- `src/e2e/`: Playwright smoke test (CI).
- `src/scripts/`: repo tooling (asks, md-wrap), plain JS.

## Pack

`wildshard pack <product> [--out <file>]` turns a built product folder
into the tarball `api-server` takes (C0, J137). `wildshard` is the same
program as `sharddev`, a second name on the `bin`.

1. **Read.** Every file under the folder. A link or anything else that
   is not a regular file is refused.
2. **Tar.** Format's `writeTar`, so the writer and the server's strict
   `readTar` are one module. The same files give the same bytes: sorted
   paths, no directory entries, no times, no owners. A tarball's hash is
   its identity, so an unchanged product uploads nothing.
3. **Check.** The tarball itself goes through `validateShardfileProduct`,
   as the server's commit does. An unlisted file is refused, so nothing
   strays in, and a refusal writes no file.
4. **Write**, by rename, to `<slug>.tar` or `--out`. Over 300 MB
   (`api-server`'s D31) it warns and still writes: that cap is the
   server's to raise (J137).

Measured on this Mac on products under singleplayer's `out/`, read only:

| Shard | Files | Tarball | Time | Peak memory |
| --- | --- | --- | --- | --- |
| Signal Dunes | 199 | 16.9 MB | 0.5 s | 345 MB |
| Driftwood Isle | 474 | 112.7 MB | 0.9 s | 547 MB |
| Pine Hollow | 924 | 270.4 MB | 1.4 s | 902 MB |

Those products are not standalone yet: C0 still has to move shard-owned
`/assets` files into them, and Pine's 270.4 MB has 29.6 MB of room. The
optional author data (D5: `fence-reads.json`, `packs-set.json`, program
lists) needs format to admit it first, or the validator calls it
unlisted. Both are rows in `docs/plans/`.

## Upload

`sharddev upload <shardfile> [--server <url>] [--level <n>]` sends a
built shardfile to `api-server`, whose `docs/design.md` owns the
protocol. J96 puts the compression here; the server only checks and
stores.

1. **Check.** The tarball goes through format's
   `validateShardfileProduct`, as the server's commit does, so a bad
   shardfile costs seconds, not a Brotli pass and an upload.
2. **Sign.** Ed25519 over the raw 32 bytes of the tarball's SHA-256
   (J69), with `WILDSHARD_CREATOR_PRIVATE_KEY` (base64 PKCS#8).
3. **Already there?** `GET /api/shardfiles` lists stored hashes, so a
   re-upload prints the revision and sends nothing.
4. **Compress**, in memory. Below a 1% saving the plain tarball goes
   instead, with no `Content-Encoding`.
5. **Ticket, PUT, commit.** Always this path, whatever the size. A 5xx
   or a dropped connection retries the PUT, three attempts in all.

A deployment behind Vercel protection needs
`VERCEL_AUTOMATION_BYPASS_SECRET`, sent as `x-vercel-protection-bypass`
on the API calls only. The presigned PUT goes straight to R2 and never
carries it.

`POST /api/shardfiles` is not used, and with a Brotli body it could not
be: Vercel's edge answers `content-encoding: br` with its own 415 before
the function runs.

The tarball reader, the strip-types hook and the wire shapes come from
`@wildshard/format` (`tar`, `formatHook`, `uploadWire`), which `api-server`
uses too: neither repo depends on the other (J27). Format ships raw
.ts, so it never loads by a static import: `upload/wire.ts` installs the
hook and uses a top-level `await import`. A reply that does not parse
fails the upload rather than guess.

### The Brotli level

Default **6**. J84 said 11; these numbers replace that. Measured on this
Mac with no real shard available to read: a 271.2 MB ustar of real,
deduplicated game assets (KTX2, GLB, binary streams, JSON) mixed so
level 5 lands on what the real 270.4 MB Pine Hollow saved at level 5
(19.8% here, 20.1% there). Level 11 saved 22.0% here and 23% on the real
tarball.

| Level | Stored | Saved | Time |
| --- | --- | --- | --- |
| 1 | 222.8 MB | 17.9% | 0.5 s |
| 3 | 220.6 MB | 18.7% | 0.8 s |
| 5 | 217.5 MB | 19.8% | 1.4 s |
| **6** | **216.9 MB** | **20.0%** | **1.6-2.1 s** |
| 7 | 216.5 MB | 20.2% | 4.2 s |
| 9 | 215.9 MB | 20.4% | 10.1 s |
| 10 | 212.2 MB | 21.8% | 247.8 s |
| 11 | 211.5 MB | 22.0% | 278.0 s |
| 11, window 24 | 210.9 MB | 22.2% | 389.9 s |

Times are one run each on a busy machine, except level 6, repeated;
the real upload's level 6 took 3.9 s under load. Level 6 is the last
cheap step. Level 11 stores 5.4 MB less, about 1 s
of a 40 s upload, for 276 s more on every revision, and those bytes
are 0.05% of R2's free tier. Window 24 saved at most 0.1 MB over 22 at
levels 5 to 7 and took longer, so the window stays at 22.

### Already-compressed bytes

A tar member cannot skip Brotli: `Content-Encoding: br` needs one stream
over the whole tarball. Brotli does have raw meta-blocks, but Node's
encoder cannot be told to emit one, and joining separately encoded
streams is unsafe without `BROTLI_PARAM_STREAM_OFFSET`, which Node does
not expose.

It does not matter, because the encoder does this by itself: 35.8 MB of
KTX2 came through level 5 in 0.1 s, 0.0% saved. So the only skip here is
the whole-tarball one above.

## Dependencies

- `engine`, by git tag (`github:project-wildshard/<repo>#vX.Y.Z`)
- `shardfile` (`@wildshard/format`), by git tag (`github:project-wildshard/shardfile#v0.3.5`), locked with pnpm 10.26+

## Boundaries the checks enforce

- Imports only the engine's published exports, never its internals

## Coming with the import

- src/sdk/cli.ts (minus validate) and the in-tree sharddev package from P1 F4
- `src/sdk/bake/`
- `scripts/build-shardfiles.mjs`
- `scripts/shardfile-cache.mjs`
- `src/engine/explore/`
- `drafts/`
- `scripts/docs/author-project`
