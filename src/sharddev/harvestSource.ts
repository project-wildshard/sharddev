import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { legacyHarvest, legacyHarvestItems } from '@wildshard/kit/legacyHarvest';

/** Copy old source harvest law to ordinary rows once; explicit declarations and pack policy win. */
export function expandHarvestSource(source: Shardfile, warn: (message: string) => void = console.warn, sections?: ReadonlyMap<string, unknown>): Shardfile {
  const copied: string[] = [], required = new Set<string>();
  const species = source.rows.species.map(row => {
    if (row.harvest !== undefined) return row;
    const harvest = legacyHarvest(row.kind, row.variants.map(variant => variant.id));
    if (harvest === undefined) return row;
    for (const drop of harvest) required.add(drop.item);
    copied.push(row.id);
    return { ...row, harvest };
  });
  if (copied.length === 0) return source;
  const catalogue = source.items.catalogue ?? [], known = new Set(catalogue.map(row => row.id));
  const missing = [...required].filter(id => !known.has(id));
  const expanded = parseShardfile({ ...source, rows: { ...source.rows, species },
    items: { ...source.items, catalogue: [...catalogue, ...legacyHarvestItems(missing)] } }, sections);
  for (const id of copied) warn(`species \`${id}\` uses the old harvest law: copied explicit drops and item metadata; declare its harvest explicitly`);
  return expanded;
}
