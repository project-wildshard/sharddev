import { parse, object, array, string, unknown } from 'valibot';
import { PickupCatalogueSchema, SpecimenBookSchema, type PickupCatalogueRows, type SpecimenBookRows, type SpecimenModelMetadataRows } from '@wildshard/format/specimenCatalogue';
import pickupRows from '@wildshard/engine/game/data/pickupCatalogue' with { type: 'json' };
import { namedJsonSchema } from '@wildshard/engine/host/formatJsonSchema';
import { encodeCanonicalJson } from '../immutable';
import { nameBlob, type NamedBlob, type BlobOptions } from '../blobs';

/** Admit fresh shared pickup metadata for an offline recipe, without installing runtime models or loading geometry. */
export function sharedPickupCatalogue(): PickupCatalogueRows {
  return parse(PickupCatalogueSchema, pickupRows);
}

/** A build-time catalogue: admitted rows and metadata, without runtime registration or model construction. */
export interface AuthoredSpecimenCatalogue {
  readonly book: SpecimenBookRows;
  readonly model: (key: string) => SpecimenModelMetadataRows;
}

/** Admit a complete specimen book once; model lookups retain its ordered authored metadata. */
export function defineSpecimenCatalogue(input: unknown): AuthoredSpecimenCatalogue {
  const book = parse(SpecimenBookSchema, input), models = new Map<string, SpecimenModelMetadataRows>();
  for (const row of book.rows) {
    if (models.has(row.key)) throw new Error(`Duplicate authored specimen ${row.key}`);
    models.set(row.key, row.model);
  }
  return { book, model(key) {
    const model = models.get(key);
    if (model === undefined) throw new Error(`Missing authored specimen ${key}`);
    return model;
  } };
}

/** Emit admitted book data with its defining schema and caller-owned tier/dependencies. */
export function nameSpecimenBook(name: string, input: unknown, options: Pick<BlobOptions, 'tier' | 'dependencies'> = {}): NamedBlob {
  const book = defineSpecimenCatalogue(input).book;
  return nameBlob(name, 'json', new TextEncoder().encode(encodeCanonicalJson(book)), {
    ...options, jsonSchema: namedJsonSchema(SpecimenBookSchema, {provenance:true}),
  });
}

/** Admit the named shape envelope from an offline painter. Geometry remains
 * opaque here and must pass the consumer's complete geometry grammar; no model
 * is constructed and unrelated source metadata is stripped as before. */
export function specimenShapeSources(input: unknown): { key: string; name: string; geometry: unknown }[] {
  const shapeSources = object({ rows: array(object({ key: string(), name: string(), geometry: unknown() })) });
  return parse(shapeSources, input).rows;
}
