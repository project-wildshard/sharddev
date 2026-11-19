# The phone copy of the slabs (MEMORY-STRUCTURE STR14)

> Written by: Claude (lane mini-memstruct-m2b)
>
> **State** · cook half on plan/memstruct-m2, off by default, 2026-11-18. Nothing reads it yet: the format field and
> engine's phone pick are the rest of STR14.

STR12's probe (meta `docs/plans/engine-memory/tribudget-2026-11-18.md`) showed a phone pays for the static triangles
it holds, about 8.2 MB [K] per 100 k on Nine, and Nine's slabs are 704 k of its 1.35 M. So `bakeWholeSlabs` can now
write a second, simplified copy of each key for the phone tier: `phone: { error }` in, `phone: { tiles, assets,
report }` out. Without `phone` the bake is unchanged, and with it `library` and `assets` are still byte for byte the
desktop bake (a test holds both). Nine's generator does not ask for it, so nothing ships.

`slabPhone.ts` simplifies a key's joined geometry before its partition, so phone chunks share seams the way desktop
ones do. meshoptimizer collapses onto existing vertices, so every phone vertex is a source vertex with every channel's
bits. Two things were not obvious:

- **The simplifier's error is an estimate, not a bound.** With `Permissive` it lets a thin part (a cable, a rail)
  collapse to nothing at any error wider than the part: 11 m of a 5 cm run vanished on one Nine chunk. So the copy is
  measured: every source vertex must lie within the error of the phone surface, or in a dropped island no wider than
  twice it, or read only zero-area triangles. Misses are locked and the key simplified again (whole parts from the
  seventh round). The tests check the bound with an independent point-to-triangle distance.
- **Nine's pattern words sit on seams.** 87% of slab vertices share a position with a vertex whose face or pattern words
  differ. Collapsing across those would smear one face's pattern onto the next, so they are protected; normal and
  colour seams may move.

On Nine's pinned slabs that keeps 77% of the triangles at 5 cm (541 k of 704 k). Unprotected and unmeasured it would
keep 42% at 10 cm, but that copy breaks patterns and drops thin parts. Engine's stand-in census (the same algorithm at
parse, measured in meta's STR14 row) read resident triangles down 18% and drawn per frame down 6%: the slabs are not
where most of a Nine frame's triangles are drawn from at phone Low.
