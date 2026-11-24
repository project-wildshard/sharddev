# Fast release: the release branch reuses main's green run

> Written by: Claude (opus-relfast), 2026-11-24.

Jake asked why SDK releases take forever (0.4.32: about 41 minutes from prepare to the npm listing). Most of it was
duplicate work: the release branch reran main's full suite (21.5 min with a slow-runner rerun), and the pre-push gate ran
`pnpm check` for the release branch and again for the tag (about 6 min each), on a commit that only stamps versions and
adds changelog lines over a cut main's ci already passed.

`scripts/release-reuse.mjs` now proves that from git and the Actions API. ci.yml's `release-gate` job asks it; `check`
and `products` skip when it says reuse, and `packed-install` (pack, install outside the checkout, CLI, real-shard
typecheck) always runs on the exact SHA. Anything it cannot prove (a hotfix pick, a stamp that writes code, an API
error) runs the full suite as before. The pre-push hook asks the same module and skips the push lane for release-only
pushes. Every one of v0.4.29 to v0.4.32 would have qualified.

Playwright now retries once on CI, reported as flaky: the 0.4.32 timeout was a slow runner, green on main.

Plan: meta docs/plans/FAST-RELEASE-PLAN.md.
