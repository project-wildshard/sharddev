import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { runCli } from '../src/sharddev/cli';

// Mossgate's decisions (the Barrow Warden's, moved from the retired Template by TEMPLATE-E2E TR-12b) are ABI v1. Prove must hand the engine the output's sections, or the engine reads every Wasm
// as ABI 0 and refuses the stand-still tape with `Import signature outside ABI` (engine TC-NE5b, sharddev main d89834a).
const scratchRoot = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'prove-sections-'));
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

it('a stand-still tape on Mossgate plays to its fact check', async () => {
  const tape = join(scratch, 'still.json');
  // Checkpoint on the last tick: the tape plays all 20 ticks, saves and restores, then reads the ledger.
  writeFileSync(tape, JSON.stringify({ version: 1, tape: Array.from({ length: 20 }, () => []), checkpointTick: 20, requiredFacts: ['mossgate.warden'] }));
  await expect(runCli(['prove', resolve(import.meta.dirname, '../../sdk/src/shards/mossgate'), tape])).rejects.toThrow(/native fact missing: mossgate\.warden/u);
}, 120_000);
