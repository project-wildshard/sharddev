// SDK 0.5.0 plan M2: the migration gate (src/sharddev/migrationGate.ts) for a bin that has not loaded the format hook:
// @wildshard/cli's, before it hands `build` to build's own bin. Node strips no types under node_modules (J82), so the
// hook goes first and the gate loads after it.
import '@wildshard/sdk/internal/bake/format-hook';

/** @type {(args: readonly string[], cwd: string) => Promise<boolean>} */
export const { migrationGate } = await import('../src/sharddev/migrationGate.ts');
