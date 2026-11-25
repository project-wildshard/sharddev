# FP20: the species-program writers leave the SDK

No built shard emits `actors/species-programs`, `look/hull-book` or `look/rigged-hulls` any more, and the engine refuses
them at admission. The SDK's native hunt and look expansions, the rigged-hull late files, the native contact roster and
the dev content reader's native species went with them; a product that still emits one is refused at build, naming the
section (`retiredSections.ts`). `species/toRows` stays: Driftwood, Dunes, Nalati and Pine build their plain rows with it.

The dropped `./internal/nativeHuntSource` export also leaves the tier table, the API docs and the export lock; the
usage census behind that delete was re-run over the 11 live shard repos (`shard-templates` no longer exists).
