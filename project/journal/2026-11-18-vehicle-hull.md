# 2026-11-18: a vehicle's hull (meta SHARD-SOURCE SS-GP5)

- Mirror Salt's parked land-sail let players walk through it on every page: `vehicleRow` lowers a vehicle to a carry
  `channel` with `boxes: []`, and the colliders pass skipped vehicle parts.
- The format refuses boxes on a channel, and engine still pins format 0.21, so the hull is the vehicle panel's own
  collider row instead, written `initialActive: false`. Engine `3165a100` (`vehicleHulls`) lifts that row onto the
  vehicle as a kinematic body; an engine before it leaves the row off, so a shard rebuilt early never gets a static
  ghost hull at the parking spot.
- `scene/vehicle.test.ts`: the hull row is the solid's world box, inactive; a vehicle with no solid writes none.
