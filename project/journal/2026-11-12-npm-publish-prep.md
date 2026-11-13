# 2026-11-12: npm publish prep (NPM-PUBLISH NP1)

- Jake, 23:10 Cancún: "publish stuff to npm so it can be installed without git
  links". Plan: meta `docs/plans/NPM-PUBLISH-PLAN.md`.
- `@wildshard/sharddev` drops `"private": true` and
  gains `license` (UNLICENSED, today's all-rights-reserved state until Jake picks
  one), `repository` (trusted publishing matches it exactly) and
  `publishConfig.access: public`, and its first `files` list: bin, src minus
  tests, e2e and the two sample shards, scripts minus tests and docs, lint and the
  tsconfigs. `_template` stays: `wildshard new` copies it. Nothing is
  built, the TypeScript ships raw as J53/J82 already require.
- `.github/workflows/npm-publish.yml`: a `vX.Y.Z` tag publishes sharddev by
  OIDC with no token. It checks the tag is the
  package.json version and every bin and export is in the tarball, and skips
  with a notice while the package does not exist yet: npm only trusts a
  publisher for a package that exists, so Jake publishes each first version.
- Measured with `npm pack --dry-run`: 879 files, 4.2 MB packed (10.3 MB and 1,435
  files with no list). `test/ci/installed-author.test.mjs` packs it and runs the
  real CLI from the tarball: 11 of 11 pass.
