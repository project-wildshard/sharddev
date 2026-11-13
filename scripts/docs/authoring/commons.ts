import { createCatalogue, catalogueRef } from '@wildshard/sdk/commons/catalogue';
import { commonsRequirements, type CommonsPack } from '@wildshard/sdk/commons';

/** A v1 pack: stable entry ids, the original bytes and their provenance. Commons holds only content two real shards use. */
const sharedRows: CommonsPack = { id: 'shared-rows', version: '1.0.0', entries: [{ id: 'harvest', kind: 'binary',
  bytes: new TextEncoder().encode(JSON.stringify([{ id: 'reed', label: 'Reed', icon: 'leaf', travels: false }])),
  credit: 'Example author', licence: 'CC0-1.0' }] };

/** One shared catalogue entry, selected identically by two author products. */
export function commonsExample() {
  const built = createCatalogue([sharedRows]);
  const rows = catalogueRef(built.catalogue, 'shared-rows/harvest');
  const requirements = commonsRequirements(built, [rows.entry.id]);
  return { built, ref: rows.ref, first: requirements, second: commonsRequirements(built, [rows.entry.id]) };
}
