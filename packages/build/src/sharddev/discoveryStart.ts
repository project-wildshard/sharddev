import { liftLevelStart, type StartManifest } from '@wildshard/format/level-start';
import type { Shardfile } from '@wildshard/format/shardSchema';

/** FORMAT-PRUNE FP36: the moved words format 0.1.0.5 refuses in a discovery document's `data`; each has its section. The
 *  retired grid pointer is the format's to refuse alone: no SDK build writes it, and naming it here would count against
 *  `sdk.grid-pointer-references` (format's one-way ceiling, 0). */
const MOVED_WORDS: ReadonlySet<string> = new Set(['spawn', 'loadout', 'weapon', 'audio', 'species', 'spawns', 'faunaTuning']);

/** FP36: the discovery document's level manifest without the words that live in sections (a non-object comes back as is). */
export function withoutMovedWords(manifest: unknown): unknown {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return manifest;
  return Object.fromEntries(Object.entries(manifest).filter(([word]) => !MOVED_WORDS.has(word)));
}

/** The start words of a discovery manifest, as the format's door reads them. */
function startWords(manifest: object): StartManifest {
  // The values are authored JSON; the product's own validation reads them once they sit in their sections.
  const { spawn, loadout, audio } = manifest as StartManifest;
  return { ...(spawn === undefined ? {} : { spawn }), ...(loadout === undefined ? {} : { loadout }), ...(audio === undefined ? {} : { audio }) };
}

/**
 * FP36: a product with no level manifest (the open plots, Mirror Salt, Mossgate) keeps its page start in its sections, as
 * a product with one has since OF9b3: the discovery manifest's spawn goes to `world/spawn` when the shard never set one,
 * its loadout to `items.loadout.level` and its audio to `audio.level` (a section's own value wins; format `liftLevelStart`),
 * so the discovery document can carry none of them. A shard with a level manifest comes back as it is.
 */
export function liftDiscoveryStart(shard: Shardfile, discovery: unknown): Shardfile {
  if (shard.manifest !== undefined || typeof discovery !== 'object' || discovery === null) return shard;
  const { manifest: _start, ...lifted } = liftLevelStart({ ...shard, manifest: startWords(discovery) });
  return lifted;
}
