# The dev package splits out of the sdk (SDK-SPLIT SP8)

- SP8a: the library half stops reaching the engine where it stands. `worldScenes` takes shard-format's scene source
  types; `bake/slabs` decodes whole pieces with the sdk's own copy of the engine's `wholeGeometryPieces` (a port test
  checks the same pieces and channel bits as the engine); generation's static portal walk (Rapier and the engine sim)
  is handed in by the author CLI (`providePortalEntryProof`), so build alone refuses a generator that asks for it and
  names `wildshard check`. `geometryPack`'s unused run-time fetch helpers are gone, and `splatLayerFiles` (the engine's
  texture table, used by Pine Hollow's generator) is its own file, `bake/splatLayers`, ready to move to dev.
- SP8b: the dev files move to `packages/dev` by rename only (the bin, `src/{cli,server,web,e2e,tools}`, the author CLI
  and dev verbs, the engine-importing scripts and their tests).
- SP8c: `@wildshard/dev` (private until SP12) owns the `wildshard` bin and depends on the engine, sdk, upload and kit;
  the sdk drops the engine, playwright, hono, happy-dom and vitest from its dependencies (the engine stays its parity
  oracle as a dev dependency at dev's exact pin), and the six moved exports leave it with no shim. Dev's shipped code
  reaches the sdk by name: 18 private modules it needs are `internal` exports. The CLI bundle now gives each package
  its own `src/sharddev` as `import.meta.dirname` (one global value pointed the sdk's GUIDE.md, template and tools at
  dev). dep-guard: the sdk has no engine import and no export reaching it. A clean install of the packed kit, upload,
  sdk and dev runs `wildshard --version`, `new`, `build` and `check` with every dependency found inside the install.
  Until SP10, `newProject` takes the engine pin from the sdk's dev dependency and `update --pins` runs the repo's
  `@wildshard/dev` bin when the sdk has none.
- SP9a: the sdk's four parser users (`runtimeImports`, `outputRuntime` and two author lint rules) take `parseSync`
  from `rolldown/utils`, the parser vite re-exported, pinned at vite's rolldown (1.2.16); the CLI bundle keeps
  rolldown external. Vite stays only for the build's bundles until SP9b.
