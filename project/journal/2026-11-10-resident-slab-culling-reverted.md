# Resident slabs stay whole again: the ground split didn't pay (NB9)

`6e111ae` split Nine's resident slabs into ground-compact chunks (49 in
1 bank to 119 in 20). Measured on engine's NB1 harness with Nine's
draft product, phone tier, 402x874 at DPR 2, Chromium and WebKit agree:

- Spawn view: 1.299 M triangles and 128 draws before, 1.302 M and 184
  draws after. Spawn looks down Nine's long axis; its slab triangles
  are in view and mostly within ~90 m, so no chunk boundary culls them.
- Looking north / east / west: 0.78 / 1.00 / 0.66 M to 0.65 / 0.85 /
  0.56 M, with 25 more draws each.
- The 10-minute walk (benchmax NB5): triangles p95 1.47-1.50 M to
  1.42-1.45 M, draws p95 146-149 to 199-204.

An in-page simulator over the real triangles found no split that pays:
even 470 chunks only take spawn's slab triangles from ~0.57 M to
0.46 M, at 296 slab draws. The draws cost more than the culling saves,
so G872 ("no quadrant or height cuts in a resident cell") was right for
Nine. NB9's path to the phone budget is decimation of the near and
middle architecture, not culling. The recorder fix (`39f299f`) stays.
