# Main red after the Template's M2 (door journey and tile debt)

sharddev main went red twice over with TEMPLATES-CLEANROOM M2, and
the v0.2.13 release commit (20b3e53) went out on it.

## The door journey (ring-2-author `check`)

`test/ci/new-reference.test.mjs` walked the default author straight
north from spawn into the hut door at (0, -9). M2 (7ace08a) moved the
hut to x -4 with its door at z -11.5, so the walk passed the hut's
right side, the door never opened, and the pin comparison had no
reference to compare. The coordinator's order was to follow the new
layout, not to put the layout back.

The new route goes west 67 ticks along the spawn row (to x -3.99),
stands 20 ticks, then goes north 160 ticks into the closed door
(stopped at z -11.0), opens it and crosses to z -16.7 inside. I found
the tick counts with a scratch run on the installed author's real
product. The old Template 1 pin (revision 2) is immutable and keeps
its own layout, so it walks its own route. The two used to be
compared position for position; now they must agree per segment on
the door flag, footing, and being inside their own hut.

## The tile debt (ci `products`)

From 098540b (the cleanroom look) on, `pnpm build:shards` refused
`_template`'s tile bake: tile 0/3/3 holds 5.25 MB resident and
11 draws, and every 5x5 window is about 8.4 MB compressed, against an
empty debt entry. Template rev 5 is already on preview and staging
with these tiles. I recorded the 24 rows at CI's Linux values with
one `Ratchet-Approved` line each, under the coordinator's order to
make main green. This is debt for the cleanroom lane to pay down,
not a new budget.
