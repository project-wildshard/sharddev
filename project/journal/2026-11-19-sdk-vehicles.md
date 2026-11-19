# Vehicles in the SDK

> Written by: Claude (opus-mirrorsalt-m1), 2026-11-19

Meta MIRROR-SALT-ZONE milestone 1. Format 0.53.0 has a `world/vehicles` section (MSZ1): vehicle kinds with seats, a
hull and handling, and docks where one stands. The SDK pins it here. Engine 0.1.50 carries its own format 0.48.0 copy,
so the two test helpers that hand a shard file across the engine boundary cast it, as `checkProject`'s
`EngineShardfile` already does; the casts go when the SDK pins an engine built on 0.53.0.

MSZ3 and MSZ4: `world.vehicle(kind, build, options)` declares a kind and `world.dock(id, at, { kind })` places one; both
lower to that section. Seats are the `seat.driver` and `seat.passenger` empties, leave points the `leave.*` empties or a
step past the footprint's side, the hull the kind's `solid()` meshes; its panel is written hidden, since an engine poses it
at each dock. `world.part`'s old `vehicle` option (the one-seat steer carry) is refused with a hint to the new calls. A
build, and so `wildshard check`, refuses a dock off the ground or inside a static solid, a leave point off the ground or in
its own hull, and a hull under the ground; `wildshard content` counts kinds, seats and docks.
