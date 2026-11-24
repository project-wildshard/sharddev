# 2026-11-24: world.field and world.emitter (FORMAT-PRUNE FP49)

> Written by: Claude (opus-fp49)

`weather.fields` and `light.emitters` had one pinned user each (Sunscar Dunes) and no way into a scene shard. Two verbs
bring them to the three.js author: `world.field(id, { quest, steps, else, rate })` is an eased number the page computes
from one quest's flags, and `world.emitter(id, pointLight, { field })` makes a scene `PointLight` a light the page owns,
its gain following that field, instead of a look lamp. They lower to the scene's `client/plan` (one `weather.fields`
row, one `light.emitters` row whose lights hang under the page's `scene` group at their world position, no draws) and to
host f64 state fields numbered from 6501, clear of the state lane's ids, so no save moves. The look lamp's flicker
becomes the emitter's two waves on the same curve. A `field` on an emitter row needs format 0.78.0 (shard-format
`adfa6cc`); the engine half reads it on a scene shard. Glowfen's lantern run is the first user.
