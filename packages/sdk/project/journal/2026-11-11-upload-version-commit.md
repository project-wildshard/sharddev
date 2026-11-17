# `wildshard upload` sends the shard version and commit

Meta API-CLOUDFLARE AC16 (J275 V1, V2). The new API on Cloudflare
refuses a commit without `version` and `commit` (422 "pass `--version
X.Y.Z` and `--commit <sha>`"), so every sharddev before this one can
no longer upload. AC8 re-uploads every live shard with this release.

`--version` defaults to the shard project's package.json (the nearest
one at or above where the command runs) and `--commit` to its git HEAD.
A HEAD with uncommitted changes to tracked files is refused, because it
does not describe the bytes; untracked files such as the packed tarball
are not dirt, as in `git describe --dirty`. With `--commit` given, git
is not asked at all, which is what AC8's backfill from pin tarballs
needs. Both are checked here with the API's own patterns.

The commit is now sent for bytes the server already holds too, so the
API says which version holds them: the same version is a retry (200,
`created: false`) and another is its 409. Before, held bytes printed
"already stored" whatever version the author meant. The answer's
`version`, `formatVersion` and `migrations` are printed; format's wire
schema predates them, so sharddev reads those three itself.

`--version` still prints sharddev's version, except after `upload`.

Proved on the deployed Worker (workers.dev; this Mac has no R2 keys to
presign from `wrangler dev`): v0.1.0 gets the 422, a dirty project is
refused before any request, a clean one is admitted 201 with its
package.json version and HEAD, a rerun answers 200, and the same bytes
as 0.0.2 get the 409. The proof row, pointers, R2 object and KV keys
were removed.
