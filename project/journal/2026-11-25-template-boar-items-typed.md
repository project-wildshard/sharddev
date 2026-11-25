# The template's boar items are typed; a new repo's tsc runs in the push lane

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

Main's `packed-install` went red at 661da3e7 and stayed red through four
pushes, including 302ede7c, whose Node 24 fix wasn't the cause. `tsc`
refused the new repo on the packed graph at
`src/generators/gameplay.ts(73,71)`. `BOAR_ITEMS` (creatures.ts) was an
untyped array, so its icons inferred as `string`, and the item catalogue
wants `CatalogueIconName`. Session 015pj4Rx cut 0.5.0 from 2bce4c7e,
before the break, so the release doesn't carry it; this fixes main
forward.

The fix: `BOAR_ITEMS` is typed as the shard's item catalogue.

Why nothing local caught it: the sdk's own tsconfig doesn't compile the
template. Only packed-install typechecks it, under the scaffold tsconfig
`new` writes, and that job runs only in CI.
`test/template-typecheck.test.ts` now does the same in the push lane. It
writes a reference repo the way `new` does, links the workspace's
node_modules and runs the sdk's `tsc6`. It took 8 s. Without the fix it
fails with the CI error, word for word.

I tried the packed-install script locally first. It needs `RUNNER_TEMP`
for its scratch, and this machine's pnpm then refuses the install
(`ERR_PNPM_IGNORED_BUILDS`), so it can't stand in for CI here; the
focused test can.
