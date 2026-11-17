# SHARD-SOURCE AP16: scene panel parts (opus-ap16)

- Brasscap moves onto the scene API with its gameplay rows, and its bandit
  quest opens the gate: `targets.panels` hides panel `brasscap.gate` and
  drops its collider. The scene back end had no panels (`props.panels: []`,
  every collider `panel: null`), so the gate would never open and the Wyrm's
  arena would be shut for good.
- `world.part(name, build, { panel: 'brasscap.gate' })`: the part's meshes
  leave the tiles and become one library GLB (merged whole, same entries and
  materials as the tiles); its solids are one collider with the panel's id
  and `panel` binding. The library budget is now computed from the library
  closure (it was 0, fine while the scene had no library files).
- A panel holds meshes and solids only: a sprite, point cloud, light or pool
  would stay when the panel hides, so they are refused by path.
- Watch: the shell keeps a panel part whole (the engine hides it there); the
  page streams every other part; a panel edit is a new shell.
