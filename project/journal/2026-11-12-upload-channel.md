# `wildshard upload --channel`, and the versions it sends (opus-up3)

Meta SHARD-AUTHORING UP3 (J301, J306). Ships before api-server's UP1 and
UP2: today's API parses the commit with valibot's `object`, which drops
the new keys.

- `--channel staging|prod` is required and has no default. Missing or any
  other value refuses in `uploadSettings` before the file is read or a
  request is made. `prod` goes on the wire as `production`.
- The commit carries `channel`, `sharddev`, `engine` and `shardFormat`.
  Engine and shard-format come from the nearest `node_modules` at or above
  the cwd (`@wildshard/shard-format` first, then the `@wildshard/format`
  alias), else from the copy this sharddev carries. Non-X.Y.Z refuses.
- The hero pre-check reads `GET /api/catalogue` after validation and
  before the PUT. When the slug's `heroHash` (UP4) equals this card's
  digest and the version differs, it refuses and names `wildshard hero`.
  Before UP4 the catalogue has no `heroHash`, so it passes.
- The channel CLI tests are in `src/cli/upload/upload-cli.test.ts`, not
  `upload.test.ts`: they spawn the real CLI, and the lint caps (300
  lines, 10 imports) forced a split. The shared run helpers are in
  `src/test/helpers/upload-run.ts`.
- CI-only callers needed `--channel` too: `src/ci/installed.test.ts` and
  `test/ci/installed-author.test.mjs`. Both pass locally.
