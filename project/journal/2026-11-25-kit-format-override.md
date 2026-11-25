# upgrade moves kit's format override; check refuses a mixed format

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

Found during the 0.5.0 roll's 0.4.33 baseline (R3, run by session
015pj4Rx): Nalati refused its build with "Named JSON provenance requires
a defining shared format root". It wasn't the dressing pages, and it
wasn't the engine's bundled format. Nalati's package.json has
`pnpm.overrides["@wildshard/kit>@wildshard/shard-format"]`, a hand
override from the format 0.41 days. `update --pins` moves overrides only
for names in PINNED, which has the alias `@wildshard/format` but not the
real name `@wildshard/shard-format` that kit depends on. So kit stayed
on 0.74.1 while the sdk moved to 0.78.0. The sdk's execution bundle then
held two json-schema copies, and kit's `nameSpecimenBook` asked the
sdk's copy for provenance on its own copy's schema, which isn't a root
there.

How we found it: the refusal's stack is never read, so the stack hook
saw nothing. Wrapping `Error` at construction printed
`namedJsonSchema$1 <- nameSpecimenBook <- coverSpecimenBlobs`. Deleting
the one override, reinstalling and building made Nalati build.

The fix, before the 0.5.0 cut (`upgrade` goes through the same code):

- `movePins` moves an override that targets `@wildshard/shard-format`
  with the format pin, as a bare version (the `npm:` alias stripped).
- `check` (CP18 pin check) now reads every override that targets the
  format under either name, not just a bare `@wildshard/format` key.
  Its refusal names the override key so an author can find it.

Nine Dragon carries the same stale key; it built only because nothing
on its path reaches kit's specimen book.
