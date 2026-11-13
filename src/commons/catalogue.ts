import { buildCommons, type BuiltCommons, type CommonsPack, type CommonsEntry } from '@wildshard/sdk/commons';

/** Build a versioned catalogue using only the SDK's author-tool contract. Nothing installs on import. */
export function createCatalogue(packs: readonly CommonsPack[]): BuiltCommons { return buildCommons(packs); }
/** Resolve a stable build-time entry to its immutable content reference and actual cost. */
export function catalogueRef(catalogue: BuiltCommons['catalogue'], id: string): { ref: `commons:${string}`; entry: CommonsEntry } {
  const entry = catalogue.entries.find(row => row.id === id);
  if (entry === undefined) throw new Error(`Unknown commons entry: ${id}`);
  return { ref: `commons:${entry.hash}`, entry: structuredClone(entry) };
}
