# The sdk moves into packages/sdk (SDK-SPLIT SP2b)

- The repo root is now a private workspace (`@wildshard/sharddev-workspace`) that holds tooling only: land, worktree,
  agent sync, typecheck, lint dispatch, release and the dependency guard, plus repo-kit's stamped scripts. Its version
  is the one release version every package shares (D5); `release:stamp` copies it into kit, upload and the sdk.
- `@wildshard/sdk` moved, rename only, into `packages/sdk` with its source, bin, scripts, tests, sample shards and
  configs; a published tarball keeps the same layout (src/, bin/, lint/, scripts/), so shard repos see no path change.
- The sdk imports upload by name (`@wildshard/upload/...`, a workspace dependency) instead of `../../packages/upload`;
  upload is publishable now and releases before the sdk. Its first npm publish needs the placeholder and trusted
  publisher (SP12), as kit's does (ONE-FORMAT CC2b2b).
- Upload's provenance falls back to the installs of the caller's folder (`installDir`, the sdk), since upload does not
  depend on the engine.
- The sdk keeps byte copies of the four repo-kit scripts its shipped code imports (chromium-keychain, scratch-dir,
  vite-tmp, worktree-ignore); the root keeps the stamped originals.
- `project/` (this journal, archive, origins) stays at the root: it is the repo's history, not the sdk's.
