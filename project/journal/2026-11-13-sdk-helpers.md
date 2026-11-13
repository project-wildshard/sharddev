# Real shard-format helpers in the SDK (SHARD-AUTHORING SA26)

- `formatJsonSchema` was `export * from` engine's `host/formatJsonSchema`
  behind a `no-reexport` disable. No engine module imports that file: it
  is authoring code built on shard-format and valibot alone. The SDK now
  owns it (a verbatim copy plus a header), so `formatJsonSchema`,
  `namedJsonSchema`, `registeredJsonSchema`, `defineNamedRows`,
  `authorFormatRows` and the rest run here.
- `author`'s `emptyShardfile` is built in the SDK and admitted by
  shard-format's own `parseShardfile`, not engine's wrapper.
- Every internal import of engine's `host/{formatJsonSchema,author}` now
  names the SDK module, and `host/shardfile` (a pass-through to format's
  `shardSchema`) names `@wildshard/format/shardSchema`. One module
  instance holds formatJsonSchema's schema tables again.
- Removed `phasedBossFight` (`./phasedBoss`) and `speciesBrains`
  (`./speciesBrains`): both took runtime ports or a ScriptHost and
  returned engine runtime objects, so they only forwarded. No shard repo
  calls either; the row and brain types stay. The next changelog should
  name them.
- No `no-reexport` or `sdk-no-facade` disables are left in the SDK;
  `lint:author` (G307's `sdk-no-facade` and `shard-game-plugins`,
  `no-reexport`) passes. Engine's own copies of `host/author` and
  `host/formatJsonSchema` are now unused and can go in an engine row.
