// oxlint-disable-next-line import/no-nodejs-modules -- Only the generated output's admitted species section is rewritten.
import { mkdirSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The generated product must stay separate from its authored source.
import { dirname, resolve } from 'node:path';
import { outputSectionPayloads } from '@wildshard/format/outputFields';
import { expandCreatureLayers } from './creatureLayers';
import { expandHarvestSource } from './harvestSource';
import { settleHandwritten } from './handwritten';
import { encodeCanonicalJson } from './immutable';
import { validateOutputProduct } from './outputProduct';
import { expandJournalIconSource } from './journalIconSource';
import { mergeProjectBlobs } from './projectOutput';
import { SHARD_INDEX } from '../../packages/upload/src/sharddev/shardSource';
import { expandCombatSource } from './combatSource';
import { expandNativeHuntSource } from './nativeHuntSource';

/** Hand-held JSON enters the same source expansion, then format settles the changed section's real hashes again. */
export function settleHandwrittenCreatureLayers(source: string, output: string): ReturnType<typeof validateOutputProduct> {
  if (resolve(source) === resolve(output)) throw new Error('Creature expansion output must be separate from its authored source');
  settleHandwritten(source, output);
  const checked = validateOutputProduct(output), sections = new Map(checked.sections);
  const native = sections.get('actors/species-programs');
  const expandedNative = native === undefined ? undefined : expandNativeHuntSource(native);
  if (expandedNative !== native) sections.set('actors/species-programs', expandedNative);
  const layers = expandCombatSource(expandHarvestSource(expandCreatureLayers(checked.shard, console.warn, sections), console.warn, sections), console.warn, sections);
  const journal = expandJournalIconSource(layers, sections);
  if (journal.shard === checked.shard && expandedNative === native) return checked;
  const merged = mergeProjectBlobs(journal.shard, checked.assets, journal.blobs, checked.index.files.filter(file => file.name !== undefined), [], sections);
  const expanded = merged.shard;
  const payloads = new Map(outputSectionPayloads(expanded));
  if (expandedNative !== native) payloads.set('actors/species-programs', expandedNative);
  for (const name of ['actors/species', 'combat/items', ...(journal.blobs.length === 0 ? [] : ['ui/compendium']), ...(expandedNative === native ? [] : ['actors/species-programs'])]) {
    const section = checked.index.sections.find(row => row.name === name), payload = payloads.get(name);
    if (section === undefined || payload === undefined) throw new Error('Missing admitted section for source expansion');
    writeFileSync(resolve(output, section.path), encodeCanonicalJson(payload));
  }
  if (journal.blobs.length > 0) {
    const files = new Map(checked.index.files.map(file => [file.hash, file]));
    for (const file of merged.namedFiles) files.set(file.hash, file);
    for (const blob of journal.blobs) {
      const path = resolve(output, blob.file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, blob.bytes);
    }
    writeFileSync(resolve(output, SHARD_INDEX), encodeCanonicalJson({ ...checked.index, files: [...files.values()],
      admission: { ...checked.index.admission, library: expanded.library, budgets: expanded.budgets } }));
  }
  // Format's pack owns measurement, receipts, closure and admission. The authored folder stays unchanged.
  settleHandwritten(output, output);
  return validateOutputProduct(output);
}
