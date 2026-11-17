# The dev package splits out of the sdk (SDK-SPLIT SP8)

- SP8a: the library half stops reaching the engine where it stands. `worldScenes` takes shard-format's scene source
  types; `bake/slabs` decodes whole pieces with the sdk's own copy of the engine's `wholeGeometryPieces` (a port test
  checks the same pieces and channel bits as the engine); generation's static portal walk (Rapier and the engine sim)
  is handed in by the author CLI (`providePortalEntryProof`), so build alone refuses a generator that asks for it and
  names `wildshard check`. `geometryPack`'s unused run-time fetch helpers are gone, and `splatLayerFiles` (the engine's
  texture table, used by Pine Hollow's generator) is its own file, `bake/splatLayers`, ready to move to dev.
