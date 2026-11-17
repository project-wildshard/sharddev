> Written by: Claude
> State: done, 2026-11-17.

SHARD-SOURCE SS-GF1a1b: a lantern on a stand. `world.pickup(id, at, { label,
radius, item, flag })` writes a `kit.lantern` tool the loadout does not carry
(so an engine with SS-GF1a1a starts it on its stand), a `hooks.scenes` row and
an `itemActions` take (action 3, `setsFlag`), and the tool's `fuel` and `lit`
as owner player fields projected by `itemFields`, which is how a page shows a
lantern the server burns. Projections need a state lane, so a scene with
pickups always gets the generated module. Two pickups may hand over one tool
when their item options match. Proved in `wildshard dev` against engine
v0.1.32 plus the stand-tool commits: E at the stand puts the lantern in the
off hand, lit.
