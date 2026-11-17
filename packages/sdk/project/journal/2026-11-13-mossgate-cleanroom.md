# Mossgate cleanroom port (meta TEMPLATES-CLEANROOM M2)

> Written by: Claude (lane opus-mossclean2)

- The Template takes the cleanroom's look on its current layout. Sky: a post graph on `viewRay` (five sunset bands, a sun
  glow behind the hut, coral clouds), anchored to the world, so it holds when the camera pitches. Fog, key, ambient and
  rim are the cleanroom's colours in linear; the sun sits at 35 degrees from front-left (`day.azimuth` 163.4,
  `dayOverride` 0.65). The old LUT and its blob are gone.
- The measure (dev-map) layer is off. `generators/weather.ts` bakes weathering into vertex colours (stone mottle, moss on
  tops, wood grain, contact shade), builds tall stone boxes as coursed masonry and tree crowns as smooth lumpy balls.
  The coarse tiles and the far proxy keep the masonry as plain boxes (`plainWalls`), or the far proxy breaks its cap.
- Surprises: ambient needed 2.6 (the hemisphere is weaker than the cleanroom's hemisphere plus environment), and the
  panels' masonry needed 300 000 bytes more resident library budget (`M2_MASONRY_RESIDENT`). Download grew from
  7.65 MB to 9.64 MB.

## Second half (lane opus-mossclean3)

- The layout moved to the goldens' composition (meta plan's Composition section, reversible): hut at (-4, -14.5) left of
  the spawn path, the Lamplighter right of it, brazier A at the head of a row at the back of the yard with two beacons
  that light with B and C, the moss gate in the yard's west wall at (-10, 0), the pond west of it and brazier B across
  the bridge, C by the arena arch, the arena east at (25.5, -2) with its way in facing the yard. Quest, encounter,
  creature, POI and Warden particle positions moved with it; the blob moved inside the yard.
- The pond is the cleanroom's rounded rectangle: `data/water.json` is a 32-point polygon, and the bowl's height law and
  the tests read one signed distance (`pondSDF`), so the swim's beach holds all the way round.
- New: low coursed yard walls and the pond garden's, with moss caps, hanging moss and ivy (`yardWalls`); taller gate
  pillars with ivy and drapes; the cleanroom's lathed brazier stands; a furnished hut room (its own piece, so the coarse
  tiles and far proxy skip it) whose hanging lamp shares the door lamp's emissive draw; a stone kerb round the pond; a low
  arena ring under a taller arch; the Warden at 3 times the blob (was 2.2); the cleanroom's twenty trees and stepping-slab
  paths.
- The tile-placement tests (red caps in 0/4/3, pond in 0/4/4, arena in 0/3/4) were about draw caps that only warn now
  (G453); they now check the same things against the new places (in the yard, round the pond, in the arena).
