// oxlint-disable-next-line import/no-nodejs-modules -- Only the generated output's admitted species section is rewritten.
import { writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The generated product must stay separate from its authored source.
import { resolve } from 'node:path';
import { outputSectionPayloads } from '@wildshard/format/outputFields';
import { expandCreatureLayers } from './creatureLayers';
import { expandCreatureHitVolumes } from './creatureHitVolumes';
import { expandHarvestSource } from './harvestSource';
import { settleHandwritten } from './handwritten';
import { encodeCanonicalJson } from './immutable';
import { validateOutputProduct } from './outputProduct';
import { requireJournalImages } from './journalIconSource';
import { expandCombatSource } from './combatSource';

/** Hand-held JSON enters the same source expansion, then format settles the changed section's real hashes again. */
export function settleHandwrittenCreatureLayers(source: string, output: string): ReturnType<typeof validateOutputProduct> {
  if (resolve(source) === resolve(output)) throw new Error('Creature expansion output must be separate from its authored source');
  settleHandwritten(source, output);
  const checked = validateOutputProduct(output), sections = new Map(checked.sections);
  requireJournalImages(checked.shard);
  const creatures = expandCreatureHitVolumes(expandCreatureLayers(checked.shard, console.warn, sections), checked.assets);
  const layers = expandCombatSource(expandHarvestSource(creatures, console.warn, sections), console.warn, sections);
  if (layers === checked.shard) return checked;
  const payloads = new Map(outputSectionPayloads(layers));
  for (const name of ['actors/species', 'combat/items']) {
    const section = checked.index.sections.find(row => row.name === name), payload = payloads.get(name);
    if (section === undefined || payload === undefined) throw new Error('Missing admitted section for source expansion');
    writeFileSync(resolve(output, section.path), encodeCanonicalJson(payload));
  }
  // Format's pack owns measurement, receipts, closure and admission. The authored folder stays unchanged.
  settleHandwritten(output, output);
  return validateOutputProduct(output);
}
