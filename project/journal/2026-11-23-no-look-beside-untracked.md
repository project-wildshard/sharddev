# No hero look recorded beside untracked inputs (opus-x86, meta QA 11-23-b row 14)

- opus-compat-w13, 19:13 UTC: Dunes and Sky publishes stopped on `src/hero.json` again. Their worktrees held untracked
  `public/` assets, which reach a local build but not CI's checkout, so the look recorded locally was not CI's.
- `heroLook` now asks git for untracked files under the repo's `src/` and `public/` before it writes a look. With any,
  it writes nothing and the cut says which files, to commit or remove them and build again. Outside git nothing
  changes. The x86/arm64 half of the row is `2026-11-23-same-bytes-x86-arm64.md`.
