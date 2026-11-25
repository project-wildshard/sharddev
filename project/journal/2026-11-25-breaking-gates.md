# Gates for "every break is a minor" (A7, M6)

> Written by: Claude (opus, session 015pj4Rw). Plan
> `docs/plans/opus-2026-11-24-sdk-migrate-static.md`, row M6.

- Jake, 2026-11-24: *"0.4.$PATCH is non breaking, and 0.5.0 is for
  breaking, we bump the minor on every break."* A rule nobody has to
  remember is a test: `packages/sdk/test/codemod-gate.test.ts`, in
  `pnpm test`.
- Gate 1: a codemod from 0.5.0 on is `x.Y.0.mjs` and exports
  `title`, `pending`, `guide` (an anchor GUIDE.md has) and its
  default. 0.2.5 to 0.4.24 are exempt and never imported (0.4.24 pulls
  in the TypeScript compiler). A `.none.json` needs its reason.
- Gate 2: an sdk at `x.Y.0` from 0.5.0 on ships that migration or the
  `.none.json`. No tag needed: an `x.Y.0` always follows a lower minor.
- Gate 3: names (exports, bins, verbs, as `scripts/sdk-exports.mjs`
  `publicNames` lists them) gone since the last tag `git describe`
  finds. The tree's version only moves at release, and the release
  branch reuses main's ci run, so "version is a minor above the tag"
  can never hold on main during development. So a codemod for the
  next minor already in the tree also passes: it is the declaration
  that the next release is that minor. The gate cannot see the
  release number typed into `release.sh`; the skill says to check it.
  With no tag (a shallow clone) the test is skipped and says why.
- Fixtures prove the reds: 0.6.1.mjs, 0.6.0.mjs without `pending`, a
  guide anchor GUIDE.md lacks, an export removed at a patch.
- The policy text: CHANGELOG.md header, docs/dev.md "Releases and
  breaking changes", D29, and the `sdk-breaking-release` skill (the
  sdk side of engine's `breaking-release` §4, with the canary-then-
  roll order from the plan), plus one AGENTS.md line.
