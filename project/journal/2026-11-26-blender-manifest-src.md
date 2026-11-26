# The Blender build reads src/blender/targets.json (opus-held125, meta QA 11-25 row 126)

- `scripts/blender/build.sh` used to `cd` to its own package root, so an installed copy only ever read the SDK's own
  manifest: a shard's `scripts/blender/targets.json` was never the one it read. It now runs from the repo root and
  reads `src/blender/targets.json` (a shard's sources live under `src/`, the lean layout). Its helpers
  (`save_blend.py`, `glb-digest.mjs`) come from the package, and a manifest can name it as `$SDK`.
- A shard's old `scripts/blender/targets.json` still reads, with a warning, for this SDK minor only. The SDK's own
  inspection fixture keeps its manifest beside `build.sh`, with no warning.
- `check-model-sources.mjs` reads the same manifest and counts `src/blender/` as a source root.
- `test/blender-manifest.test.ts` runs both from a scratch shard: the new place, the fallback with its warning, no
  manifest, and the SDK's own.
