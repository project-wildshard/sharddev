// CHUNK-PARAM-REMOVAL CP20 (J522): `@wildshard/engine/scripts/zone-entry.mjs` through `@wildshard/sdk/headless` (the
// shard's own engine, a peer, as SHARD-COMPAT SI4's harness entries). No address names a zone: a shard's browser script
// enters one with `enterZone(page, { zone, base, flags, alone })`, the tap the title writes and a bare `/`. The engine
// module imports engine .ts from node_modules, so this registers the format hook (J82) before it loads the engine's.
/* oxlint-disable wildshard/public-index, wildshard/no-reexport, wildshard/sdk-no-facade, oxc/no-barrel-file, unicorn/filename-case, import/export, wildshard/no-production-test-import -- SHARD-COMPAT SI4: the harness entry is the shard's own engine module, re-exported until SI8 makes each a port */
import './format-hook.mjs';

const entry = await import('@wildshard/engine/scripts/zone-entry.mjs');
export const { SAVE_PREFIX, enterZone, initScript, oneCellCatalogue, oneCellPage, tapDocument, zoneHome } = entry;
