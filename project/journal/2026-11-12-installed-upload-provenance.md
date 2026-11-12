# Installed upload tests after AC16 (opus-ts16c)

- `ci` on main was red from v0.2.1 (run 43206503030) to `54ec2c4`
  (43256733188): two CI-only tests still expected AC16's old upload.
- `a090757` made `wildshard upload` send a version (nearest package.json)
  and commit (git HEAD), and the upload double started recording
  `{ revision, version }`. Neither CI-only test was updated: `check`'s
  `src/ci/installed.test.ts` still wanted `[1]` (and read sharddev's own
  0.2.2 from the cwd), and `products`' outside author had no package.json.
- Fix is in the fixtures, not the CLI: the installed test passes
  `--version`/`--commit` explicitly; the outside author's app gets a
  package.json and a one-commit git repo, so the real defaults run.
- Lesson: a change to the upload double needs `pnpm test:ci` and the
  products proofs run locally; `pnpm check` doesn't cover them (meta
  TEST-SPEED TS16c).
