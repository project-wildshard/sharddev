# Scene movers (SHARD-SOURCE SS-GF2a, opus-ss10c)

- `world.part(name, build, { panel, mover: { path, seconds, start?, loop? } })`: a panel part that rides a
  track. Lowers to a native `movers` row (platform, track driver, `stand` or `always`, pingpong by default),
  rest at the part's bounds, its solids the mover's boxes (never a static collider), keys spaced by distance.
- Entities from 9101 (Brasscap's hand-placed side door is 9201).
- Found on the dev page: engine installs declared movers only beside a script lane, so a script-free shard's
  raft never moved (`posed 0`); fixed in engine on `plan/ss10c`.
