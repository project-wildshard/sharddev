# Touchable parts (meta SHARD-SOURCE SS9d), opus-ss16m

- `world.part(name, build, { panel, touchable: { material, shape?, density?, ... } })` lowers to one format `props.bodies`
  row naming the panel: its rest the part's bounds centre, the shape (box, ball, cylinder) fitted round them. The panel's
  solids are the body, so no static collider of that id. A touchable part that is not a panel, or has no bounds, refuses.
- Needs the format pin on 0.12.0 (props.bodies); `touch.test.ts` fails "Invalid key bodies" until then.
- SS9e: Mossgate's crate (`mossgate.crate`) stands inside the yard gate at (-6.4, 1.9), a 0.8 m planked box with iron
  corner bands, square to the axes so its fitted body matches what is drawn. The two-client proof is owed after the pins.
- opus-ss16n: Mossgate's full build refused `coarse dependency on library`: the crate panel borrowed the yard's wood
  texture, which the far (L1) tiles also load, and a panel's textures load with the shard. The crate now has its own
  planks (`T.crateWood`), and the sdk refuses such a panel by name instead of the format's bare line.
