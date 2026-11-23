// SHARD-COMPAT SI7: the engine's ambient declarations (its `.merge` files, n8ao, meshopt, rapier) for a shard tsconfig's
// `types` list: `"@wildshard/sdk/headless/game/types"` replaces `"@wildshard/engine/game/types"`. Types only; nothing runs.
/* oxlint-disable wildshard/no-reexport, wildshard/sdk-no-facade, unicorn/require-module-specifiers -- SHARD-COMPAT SI7: the shard's own engine declarations, named until SI8 makes them ports */
/// <reference types="@wildshard/engine/game/types" />
export type {} from '@wildshard/engine/game/types';
