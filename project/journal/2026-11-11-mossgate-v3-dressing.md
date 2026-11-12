# Mossgate Hollow v3: the yard's dressing, one step richer

> Written by: Claude (opus-mh1b), 2026-11-11 ~19:15 Cancún

Meta TEMPLATE-E2E-PLAN row MH-1b. Jake wanted the grey-box yard "beefed
up a step", still a light dev-test level, and the sky "cant be boring
gray".

- `generators/world.ts` `mossgateDressing`: eight stepping slabs from
  spawn to the door, the door lamp (a moss post right of the door, its
  arm over the doorway, a stone lamp box under a moss cap), six mossy
  boulders, ten ferns of seven fronds each, and seven mushroom clumps.
  All measure boxes at fixed places (a hashed jitter, not the scatter
  stream, so the old props stay put). Boulders and the lamp post collide.
- `data/look.json`: a post pass (screenUV, sceneDepth, noise) paints
  pink-gold cloud streaks and the sun's glow into the sky only, warms
  the grade and adds a soft vignette. Linear fog now runs 28 to 300 m,
  so the far cell sits in a warm mist. Trim is a darker moss, so ferns
  and caps part from the floor.

What I could not do with engine features: the lamp does not glow. The
dev-map look gives every PBR surface its role colour (structure, trim,
floor) and the props section has one family, so no per-mesh emissive or
colour; the data look draws no clouds or sun disc of its own (G992),
which is why the clouds are a post pass. A red mushroom cap or a lit lamp
needs a second prop material (`props.materials`), a later row's call.

The build now warns, report-only, that tile 1/1/1 is 214960 bytes over
the 200000 download line. Proved in an engine preview with the MH-1
recipe: `progress/t1-02-dressed.jpg` in meta's template-e2e-v3 folder,
no console errors. Codex review: LGTM.
