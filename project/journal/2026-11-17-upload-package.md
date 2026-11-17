# The upload package (SDK-SPLIT SP2a)

> Written by: Claude (opus-sdksplit2)

- Prep: `refusals.ts` imported the engine only for a type
  (`ShardfileCheckFailure['code']`, a plain string); it is a local type
  now. Upload's provenance read the sdk's version from the root
  package.json through `cli/version.ts`; main.ts now reads it and hands
  it to `runUpload`, so upload never reaches out of its package for it.
- Move: `packages/upload` is a private workspace package
  (`@wildshard/upload`, deps format and valibot only). It keeps the
  `cli/` and `sharddev/` layout inside its `src/`, so the moved files'
  own relative imports did not change; the rename is its own commit.
  It took the five verb folders plus what they import: report, args,
  the hero stamp check (hero, stamp, scene-card), refusals, draft and
  shardSource. Root callers import those by relative path (the author
  lint bans re-export stubs); the sdk ships `packages/upload/src` in its
  `files` until SP12 publishes the new name. Test helpers stay in
  `src/test/helpers` (root test infrastructure; tests do not ship).
- The guard gained `escapes`: relative imports in a package's shipped
  source that leave its folder. `packages/upload` reports none, no
  engine import and no forbidden name. Author-lint files moved with
  their rules (lint:author, .prettierignore); kit lint lets
  `packages/*/src/cli/**` import node: modules like `src/cli`.
