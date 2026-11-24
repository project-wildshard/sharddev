import { liftLevelStart, type StartManifest } from '@wildshard/format/level-start';
import { liftLevelLook, type LevelManifest } from '@wildshard/format/look-level';
import type { Shardfile } from '@wildshard/format/shardSchema';

/** FORMAT-PRUNE FP36: the moved words format 0.1.0.6 refuses in a discovery document's `data`; each has its section. The
 *  retired grid pointer is the format's to refuse alone: no SDK build writes it, and naming it here would count against
 *  `sdk.grid-pointer-references` (format's one-way ceiling, 0). FP47b: the level look's four words too (`look.level`). */
const LOOK_WORDS: readonly string[] = ['sky', 'atmosphere', 'grade', 'horizon'];
const MOVED_WORDS: ReadonlySet<string> = new Set(['spawn', 'loadout', 'weapon', 'audio', 'species', 'spawns', 'faunaTuning', ...LOOK_WORDS]);

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

/** FP47b: the level look words of a discovery manifest, as the format's door reads a manifest's. */
function lookWords(manifest: object): LevelManifest {
  // The values are authored JSON; `look.level`'s schema reads them once they sit in the look section.
  return Object.fromEntries(LOOK_WORDS.flatMap((word) => Object.hasOwn(manifest, word) ? [[word, Reflect.get(manifest, word)]] : [])) as LevelManifest;
}

/**
 * FP36: a product with no level manifest (the open plots, Mirror Salt, Mossgate) keeps its page start in its sections, as
 * a product with one has since OF9b3: the discovery manifest's spawn goes to `world/spawn` when the shard never set one,
 * its loadout to `items.loadout.level` and its audio to `audio.level` (a section's own value wins; format `liftLevelStart`),
 * so the discovery document can carry none of them. FP47b: its sky, atmosphere, grade and horizon go to `look.level` the
 * same way (a look's own level wins; format `liftLevelLook`), so the discovery carries no level look either. A shard with a
 * level manifest comes back as it is.
 */
export function liftDiscoveryStart(shard: Shardfile, discovery: unknown): Shardfile {
  if (shard.manifest !== undefined || typeof discovery !== 'object' || discovery === null) return shard;
  const { manifest: _start, ...lifted } = liftLevelStart(liftLevelLook({ ...shard, manifest: { ...startWords(discovery), ...lookWords(discovery) } }));
  return lifted;
}
