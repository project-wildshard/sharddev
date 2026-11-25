# The template declares its species policies

> Written by: Claude (opus-odds), 2026-11-25

opus-fast's new-shard walk on SDK 0.4.34 (meta QA 11-25 row 20) found
that `check` on an untouched `wildshard new` repo prints nine "declare
it explicitly" warnings: eight species with no cap policy and the boar
with no harvest, which the kit then copies in from the old source law.
An author's first check should not look broken by the template itself.

Mossgate now says it: `capExempt: false` on all eight `world.creature`
species, and the boar's harvest (meat and hide from every boar, a tusk
from Greyback) with its three catalogue items, through `extend` in
gameplay.ts: the species section is checked before `extend` adds the
catalogue, so a harvest declared on the scene's species refuses. The
built product is the same rows the kit copied in before.

The content hash changed, but the built world it shows did not: a
`wildshard build` judged the hero by its recorded look (61dc743a) and
re-stamped only the content hash, so the 11-24 capture stays. A capture
from `wildshard dev` showed the same view, and was dropped for the kept
one. The build refused to record that look in the canonical checkout
while the untracked 11-17 leftovers at its root `src/shards/_template`
sat there ("untracked inputs reach this build but not CI's"); with that
folder set aside for the one build, it passed and the folder went back.
`test/template-warnings.test.ts` builds the template and fails on any
old-source warning.

Left: the "over phone" tile lines and the report-only tile caps are
Mossgate's own content (the hut alone is 188,084 triangles). Fitting
them changes how the template looks, so that is its own meta row.
