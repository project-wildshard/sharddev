# Declare the SDK runtime kit in production

> Written by: Codex
> State: red-first hosted packaging correction, 2026-11-17.

Exact SDK CI44108459898 could not resolve kit legacySpecies/legacyHarvest
when its real packed CLI ran outside this checkout. SDK source imports
those kit modules at runtime, but package.json declared kit dev-only.
Local lane scratch inherited the ancestor workspace and hid the missing
production edge. The new packed-manifest test fails before the fix and
also demands an actual kit in the installed production graph. Normal
pnpm add --save-prod moves the existing workspace dependency and lock
entry without changing any versions. pnpm pack rewrites its exact version.

The original map/nav product checks now pass. Paired review reports NO
MUST. Normal Template check passes with the actual Opus capture unchanged.
Frozen install and types pass. Initial kit publication remains its separate
Needs Jake gate; this change publishes nothing. The prior obsolete CI run
and its waiting land were cancelled/stopped before editing its source.

The quick installed CLI proof initially hit its unchanged8s scaffold cap
twice, then cascaded missing-source failures. The newly real production
closure makes cold compiler preparation material. Add an explicit normal
--prepare-compiler case with a bounded55s child, before the original quick
commands; its cold proof took7.49s. Keep every existing8s child/9.5s case
and byte/gameplay assertion unchanged. The prepared installed suite then
passes21cases; original map/nav contracts pass10. No source hero changed.
