# 2026-11-16: The Barrow Warden is in the sword's reach (TC-SHIP-b)

> Written by: Claude (opus-brassgun14)

Meta TEMPLATE-E2E TC-SHIP-b. On staging a WebKit probe swung the iron sword
288 times at the Warden from 1.8 m and landed none. The server's kit strikes
the nearest body whose aim point (feet + `bodyY` x scale) lies within the
sword's range (2.2 m) and half its width of the player's look. The Warden
stood at bodyY 1.0, so at scale 3 its aim point sat 3 m up, 2.23 m from the
eye: past the reach, every swing missed. Its capsule ran 1.44 to 4.44 m, so
the body's contact grazed only its underside.

- `barrow-warden` dims are now bodyY 0.85, bodyHalfLen 0.2, bodyRadius 0.75,
  as TC-B13 did Brasscap's wyrmling: the aim point at 2.55 m, the capsule
  from 0.9 to 4.2 m.
- `test/ci/template-warden.test.mjs` adds a real swing: the player takes the
  sword off `template.rack.use`, stands where the probe stood and presses
  attack through the kit (`installDeclaredKitItems`'s `command`), as a page's
  press reaches the server. It must land and kill the Warden and file
  `template.warden`. On the old dims it lands 0 of 360.
- The hero was captured again from a served build (the cut refused a stale
  stamp).
