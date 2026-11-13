// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only the SDK's installed native physics binary, never author-selected files.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixed package binary is adjacent to its installed entry.
import { resolve } from 'node:path';
import { loadRapier } from '@wildshard/engine/physics/rapier';
import { Physics } from '@wildshard/engine/physics/Physics';
import { addBakedPieces } from '@wildshard/engine/game/plugin/simulation';
import { proveEntryways } from '@wildshard/engine/game/bake/entryways';
import { readBoundedFile } from './sourceReader';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';

/** Actual static capsule walks and transfers, never a caller-supplied receipt. */
export interface StaticPortalEntryProof { readonly lanes: number; readonly steps: number; readonly portalTransfers: number }

/** Fresh build-only proof. Dynamic movers and ordinary edge entries require their existing world-specific proofs. */
export async function proveStaticPortalEntries(input: Shardfile, pieces: unknown): Promise<StaticPortalEntryProof> {
  const source = parseShardfile(input);
  if (source.entryways.length === 0 || source.entryways.some(entry => entry.kind !== 'portalLink')) {
    throw new Error('Static portal proof requires only declared portal links');
  }
  const require = createRequire(resolve(import.meta.dirname, 'package.json'));
  const binary = require.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm');
  const physics = new Physics(await loadRapier(readBoundedFile(binary, 25_000_000).slice()));
  try {
    addBakedPieces(physics, pieces); physics.step();
    const proof = proveEntryways(source, new Map(), { world: () => ({ physics,
      fixedStep: () => { /* Static portal entries have no moving owner. */ },
      dispose: () => { /* This operation owns the single physics world. */ } }) });
    if (proof.portalTransfers === undefined) throw new Error('Static portal proof produced no transfer evidence');
    return { lanes: proof.lanes, steps: proof.steps, portalTransfers: proof.portalTransfers };
  } finally { physics.dispose(); }
}
