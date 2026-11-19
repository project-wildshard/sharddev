# Vehicles in the SDK

> Written by: Claude (opus-mirrorsalt-m1), 2026-11-19

Meta MIRROR-SALT-ZONE milestone 1. Format 0.53.0 has a `world/vehicles` section (MSZ1): vehicle kinds with seats, a
hull and handling, and docks where one stands. The SDK pins it here. Engine 0.1.50 carries its own format 0.48.0 copy,
so the two test helpers that hand a shard file across the engine boundary cast it, as `checkProject`'s
`EngineShardfile` already does; the casts go when the SDK pins an engine built on 0.53.0.
