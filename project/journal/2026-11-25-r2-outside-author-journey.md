# R2's outside-author journey, and a partial bump with no gate

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

R2's done-when line wanted the outside-author journey on a scratch copy,
and Driftwood's real upgrade hadn't run it on its own. I ran it on a
throwaway clone of Driftwood at 84dd6b7 (0.4.31, `public/` still there).

With the whole family hand-bumped to 0.5.0 (`sdk`, `cli`, `dev`, `kit`,
as Renovate would), it all holds. `dev` refuses with the migration
block, `check --json` carries `migration-pending`, and `status --brief`
prints its one line. `migrate` moves everything, names the manual steps
and stamps 0.5.0. A second `migrate` says "nothing to migrate",
`status --brief` goes silent and `check` passes.

With only `sdk` and `cli` bumped, `wildshard` still comes from
`@wildshard/dev` 0.4.31, which has no gate. `dev` just runs, `check`
fails on the old layout without naming the migration, and `status` is
unknown. That's plan row F5.
