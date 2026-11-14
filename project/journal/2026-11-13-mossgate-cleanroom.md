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
- Still to do: the layout move to the cleanroom's composition, ivy and hanging moss, the hut's interior, the pond's
  kerb, and the three-column proof board at the golden cameras.
