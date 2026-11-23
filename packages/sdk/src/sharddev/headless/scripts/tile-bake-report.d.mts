// SHARD-COMPAT SI5: the types of `@wildshard/sdk/headless/scripts/tile-bake-report.mjs`, the engine's own (a shard's typecheck reads them).
/* oxlint-disable wildshard/no-reexport, wildshard/sdk-no-facade, oxc/no-barrel-file, unicorn/filename-case, import/export -- SHARD-COMPAT SI4: the harness entry is the shard's own engine module, re-exported until SI8 makes each a port */
export * from '@wildshard/engine/scripts/tile-bake-report.mjs';
