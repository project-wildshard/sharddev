# 2026-11-19: world.creature writes a phone mesh (ONE-FORMAT CC51b)

> Written by: Claude (opus-of-x3)

The build now runs `creaturePhoneGlb` over every `world.creature` before the
shard file is written. The phone skin file is the desktop one with the lighter
GLB's hash and cost, so format admission sees the same rig, clips, sockets and
material. The look names it as `phone`, and both skins load with the shard.
A 32 x 16 sphere creature goes from 960 to 560 triangles at the default
(half the vertices within 1% of the radius). `creaturePhone: false` keeps one
mesh, and a look with a variant table keeps one mesh because the format does
not let it name a phone skin. `wildshard content` prints both counts.
