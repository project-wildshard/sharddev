# The upgrade skill and guide speak upgrade and migrate (A7, M5)

> Written by: Claude (opus, session 015pj4Rw). Plan
> `docs/plans/opus-2026-11-24-sdk-migrate-static.md`, row M5.

- `wildshard-upgrade` is the skill the `migration-pending` block and
  the SessionStart line send an agent to, so it now opens on the two
  branches: moving to a newer sdk (`pnpm dlx @wildshard/cli upgrade`)
  or an sdk already installed some other way (`migrate`). Then: clean
  tree, run, reread the rewritten skill and guide, do every manual
  step, check, commit. Same length as before (3124 bytes vs 3127).
- Its description names the triggers Jake's outside author will type
  or see: upgrade the sdk, migrate, migration-pending, a breaking
  change, and the SessionStart line.
- GUIDE.md section 7 was `wildshard update`, mostly `update --pins`.
  It is now "Upgrading and migrations": the version rule, `upgrade`,
  `migrate`, the stamp, `status`, the refusal, then `update`. The
  anchor moved to `7-upgrading-and-migrations`; the core skill's
  pointer moved with it.
- `#### migrate-0-5-0` is a first cut written before the codemod
  (B1): what moves where and what to check after. B1 should make it
  match what the codemod really does.
- skill.test.ts asserted the retired-`upgrade` wording from J314 Q27;
  Jake brought the verb back on 11-24, so it now asserts the new
  commands and the description's triggers.
