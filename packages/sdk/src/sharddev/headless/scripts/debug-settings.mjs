// SHARD-COMPAT SI4: `@wildshard/engine/scripts/debug-settings.mjs` through `@wildshard/sdk/headless` (the shard's own engine, a peer).
/* oxlint-disable wildshard/no-reexport, wildshard/sdk-no-facade, oxc/no-barrel-file, unicorn/filename-case, import/export, wildshard/no-production-test-import -- SHARD-COMPAT SI4: the harness entry is the shard's own engine module, re-exported until SI8 makes each a port */
export * from '@wildshard/engine/scripts/debug-settings.mjs';
