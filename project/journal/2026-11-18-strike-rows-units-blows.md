# 2026-11-18: strike rows keep units and blows (meta ONE-FORMAT OF11b)

- `speciesProgramToRows` now writes a strike's `units` (format 0.44.0) instead of listing it as lost: Dunes' ray swoop
  is sized in metres, and without the field the data host sized it by the body's scale.
- A keeper-bodied species' brain strikes carry the body's `feel.blow` and `cover.checked`, which the program's keeper
  adds to every hit it lands. With both, engine's 600-tick parity run (ray and strider, program host against data host)
  holds at 0 m with the same blows.
- Every package pins format 0.44.0.
