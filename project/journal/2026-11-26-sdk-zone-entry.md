# The sdk carries enterZone to the shard repos (opus-chunk2, meta CHUNK-PARAM-REMOVAL CP20)

- The shard repos depend on the sdk, not the engine, so their scripts reach engine's `enterZone` as
  `@wildshard/sdk/headless/scripts/zone-entry.mjs`, a headless harness entry like debug-settings (SHARD-COMPAT SI4).
- The entry registers the sdk's format hook before it loads the engine module, which imports engine .ts (J82), so a
  shard script needs one static import. Its .d.mts names the types; the export is in the headless tier and the lock.
- It needs an engine with enterZone (engine CP12); the shard repos run against a linked sdk and engine until both pins
  move. Brasscap's play probe entered brasscap-mesa by the tap through it, on a local engine build, in 6.6 s.
- headless-entry.test.ts knows the hooked shape (the format hook, then `await import()` of exactly the engine path);
  green 5 of 5 against an engine with enterZone (linked), red on the pin until it carries one (engine >= 0.1.93).
- Landed by opus-cp24sdk (CP24's sharddev part) with the pin move: sdk and dev pin engine 0.1.93-next.b2c9e9f3, the
  first npm engine that exports `./scripts/zone-entry.mjs`; dev's staging-client map gains its build. The peer stays
  `*`, so nothing needs a latest-tagged engine. Proof: a template shard (author-world) installed from the packed sdk
  and dev, `wildshard dev`, and a script importing the bare `@wildshard/sdk/headless/scripts/zone-entry.mjs` entered
  it headless (`alone`) in 13.1 s, every address a bare `/` with flags only.
- The guard's last two baselined hits were not the param: `if(chunk===undefined)` matches `(chunk=`. The two test
  locals are renamed (`slab`, `emitted`), so the baseline is empty.
