import { parseFindsCatalogue as parse, type FindsCatalogueData } from '@wildshard/format/findsCatalogue';

/** Admit bounded sticker counters, prize rows and saved-flag identities with the runtime's defining schema.
 * Returns owned data only; installs no catalogue, live flag reader or world service. */
export function parseFindsCatalogue(input: unknown): FindsCatalogueData { return parse(input); }
