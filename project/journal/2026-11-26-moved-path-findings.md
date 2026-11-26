# The moved-path guard's findings, fixed

> Written by: Claude (opus-kit), 2026-11-26, meta QA 11-25 row 97.

repo-kit's moved-path check (2172d3e, 0df7330) found 13 places the
lean move left pointing at the old root `scripts/`. sharddev has a
baseline, so the stamp would have refused its next push. Fixed at the
cause:

- ci.yml ran `pnpm test:agent-hooks`, a script the lean package.json
  dropped; it runs the hook tests with `node --test` directly.
- ci21-sdk-source.yml's paths filter still named the root `src/`,
  `lint/`, `test/` and `scripts/` from before the SDK split; it names
  packages/sdk's.
- package.json's lint ignored a root `scripts/**` that is gone.
- dev-world.mjs imports the engine package's dev-world and
  rig-listeners from `src/scripts/` on a lean engine, `scripts/` on the
  pinned one cut before it.
- The sdk-exports gate message names `src/scripts/sdk-exports.mjs`.
- agent-sync takes the kit's fix (a hook script under `src/scripts/`).

The rest were packages/sdk and packages/dev naming their own `scripts/`
(the kit now reads those as the package's) and test fixtures building
a shard source's `scripts/.kit`, marked `script-paths:`.
