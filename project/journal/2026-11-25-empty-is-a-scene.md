# `new --empty` is a bare scene, not a gray void

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

A9. Jake: "change `wildshard new --empty` so the bare shard isn't a gray
void". It wrote `emptyShardfile()`: heights 0, colours 0.5, no sky. Now it
copies `packages/sdk/src/sharddev/empty-scene/` (shard-showcase 41ad9e7's
world, ported): `shard.config.ts`, `identity.json`, `generators/shard.ts`
(`defineShard`) and a 31-line `generators/world.ts` with a two-colour blue
`world.sky`, flat green `world.ground`, a hemisphere light, a sun and
`world.spawn`. Named `three` imports, because `import * as THREE` trips
`import/namespace`. The files are real TypeScript in the sdk, so the sdk's
own typecheck and lint cover them, the way Mossgate's are.

- The empty repo gets `pnpm watch` now: it is a scene like the default.
- `writeEmptyShardSource` / build's `newProject()` (the API the tests build
  fixtures on) still writes the bare `emptyShardfile` source. Two tests that
  used `new --empty` to get bare shard-file rows (`new-project.test.ts`,
  `author-errors.test.ts`) now swap `src/` for that fixture: a scene's
  generator returns its own output, so it can't take an `output.ts`
  sidecar. The CI authors that replace `shard.config.ts` wholesale remove
  `output.ts` with `force` and make their own `assets/`.
- Done-when, by hand: `wildshard new x --empty && wildshard check x` with
  the repo's lint set to shard-showcase's strictest (nursery error,
  type-aware, unused disables error) passes; `tsc -p .` is clean.
  Type-aware needs `oxlint-tsgolint`, which the test suite doesn't install,
  so `newProject-lint.test.ts` turns on only nursery and unused disables
  for the empty repo.
- `pnpm docs` locally rewrote thousands of lines of API docs (the local
  install has drifted), so only the two changed `SHARDDEV.md` rows are
  edited by hand.
- The sdk builds its own declarations isolated, so the copied
  `generators/shard.ts` names its type (`SceneShard`); the push hook said so.
