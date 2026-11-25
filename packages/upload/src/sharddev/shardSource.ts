// oxlint-disable-next-line import/no-nodejs-modules -- The CLI finds a shard source on disk from the path it was given.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the shard source beneath the given repo path.
import { basename, dirname, resolve } from 'node:path';

/** The build entry that marks a folder as a shard source. */
export const SHARD_CONFIG = 'shard.config.ts';
/** ONE-FORMAT OF6a: where a source's card lives, in reading order: a legacy `manifest.json` while one is left, else
 *  `data/card.json`, the card's one home. */
export const CARD_FILES = ['manifest.json', 'data/card.json'] as const;
/** OF6a: a source's card file (`manifest.json`, else `data/card.json`), or undefined for a source with no card. */
export function shardCardFile(source: string): string | undefined {
  return CARD_FILES.map(name => resolve(source, name)).find(file => existsSync(file));
}
/** OF6a: the card file a source reads or would write: its card file, else `data/card.json`. */
export function shardCardPath(source: string): string {
  return shardCardFile(source) ?? resolve(source, 'data/card.json');
}
/** A scene starter's identity (`new`, AP37a): the slug, name and author its `defineShard` reads. */
export const SCENE_IDENTITY = 'identity.json';
/** A hand-written shard source (`new --template blender`, J314) is a shard file folder held by hand: its index. */
export const SHARD_INDEX = 'shard.json';

/** A hand-written shard source: a shard file folder (`shard.json`) a person edits, with no `shard.config.ts` to build. */
export function isHandwrittenSource(source: string): boolean {
  return existsSync(resolve(source, SHARD_INDEX)) && !existsSync(resolve(source, SHARD_CONFIG));
}

/**
 * SA16 (J317): the shard source a path names. A folder with `shard.config.ts` is one; a single-shard repo keeps its
 * source at `src/` (or a hand-written shard file folder there, `--template blender`); a multi-shard repo keeps `src/shards/<slug>/`, so its repo root names one only when it holds exactly
 * one. Any other path comes back unchanged, so the verb refuses it as it always has.
 */
export function findShardSource(path: string): string {
  const given = resolve(path);
  if (existsSync(resolve(given, SHARD_CONFIG))) return given;
  if (existsSync(resolve(given, 'src', SHARD_CONFIG)) || isHandwrittenSource(resolve(given, 'src'))) return resolve(given, 'src');
  const shards = resolve(given, 'src/shards');
  if (!existsSync(shards)) return given;
  const found = readdirSync(shards, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(resolve(shards, entry.name, SHARD_CONFIG)));
  return found.length === 1 && found[0] !== undefined ? resolve(shards, found[0].name) : given;
}

/** A shard source at a single-shard repo's `src/` (J317), rather than its own folder or `src/shards/<slug>/`. */
export function isRepoSource(source: string): boolean {
  return basename(source) === 'src' && (existsSync(resolve(source, SHARD_CONFIG)) || isHandwrittenSource(source));
}

/**
 * SA44: the repo a shard source sits in, where its `out/` is. The two layouts name it: a single-shard
 * repo's `src/` is one folder below it and a multi-shard repo's `src/shards/<slug>/` three. Any other source takes the
 * nearest folder above it with a `package.json` or `.git`, else its own parent. Layout comes first, so a fixture under
 * some repo's `tmp/` is its own repo, as it always was.
 */
export function shardRepoRoot(source: string): string {
  const given = resolve(source), parent = dirname(given);
  if (isRepoSource(given)) return parent;
  if (basename(parent) === 'shards' && basename(dirname(parent)) === 'src') return dirname(dirname(parent));
  for (let at = given; ; at = dirname(at)) {
    if (existsSync(resolve(at, 'package.json')) || existsSync(resolve(at, '.git'))) return at;
    if (dirname(at) === at) return given;
  }
}

/**
 * A7 (sdk 0.5.0): where the files a shard mounts live. A mounted file named `/<path>` is `<source>/static/<path>`:
 * `src/static/…` in a single-shard repo, `src/shards/<slug>/static/…` in a multi-shard one. The names a shard mounts
 * (`/assets/…`, `/programs/…`) are the same as when these bytes sat in the repo's `public/`; only the folder moved.
 */
export function shardStaticRoot(source: string): string {
  return resolve(source, 'static');
}

/**
 * The image roots a build and `dev` give a shard source's manifest (SDK-SPLIT SP13f): `/src/shards/<folder>/` is the
 * source itself, `/assets/` its `static/assets/` (A7). The prefixes never overlap, so a manifest image matches exactly
 * one root (`projectManifest.ts`).
 */
export function shardImageRoots(source: string, folder: string): { prefix: string; directory: string }[] {
  return [{ prefix: `/src/shards/${folder}/`, directory: source }, { prefix: '/assets/', directory: resolve(shardStaticRoot(source), 'assets') }];
}

/** Where build output lands for a shard source: the repo root for `src/`, the source folder itself otherwise. */
export function shardOutputRoot(source: string): string {
  return isRepoSource(source) ? dirname(source) : source;
}

/**
 * The folder name build checks a manifest's slug against (`project-folder-slug`). A `src/` source names no slug by its
 * folder, so its card's slug (OF6a: `manifest.json`, else `data/card.json`; a scene starter's `identity.json`) is the folder; any other source is named by its folder, as before.
 */
export function shardFolderName(source: string): string {
  if (!isRepoSource(source)) return basename(source);
  const index = resolve(source, SHARD_INDEX);
  if (isHandwrittenSource(source)) {
    const parsed: unknown = JSON.parse(readFileSync(index, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'identity' in parsed && typeof parsed.identity === 'object' && parsed.identity !== null
      && 'slug' in parsed.identity && typeof parsed.identity.slug === 'string') return parsed.identity.slug;
  }
  const manifest = shardCardFile(source);
  if (manifest !== undefined) {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'slug' in parsed && typeof parsed.slug === 'string') return parsed.slug;
  }
  // AP37a, TEMPLATE-E2E TR-2 (J434): a scene starter (`new`'s Mossgate Hollow) has no card file; its slug is in the
  // `identity.json` its generator's defineShard reads.
  const identity = resolve(source, SCENE_IDENTITY);
  if (existsSync(identity)) {
    const parsed: unknown = JSON.parse(readFileSync(identity, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'slug' in parsed && typeof parsed.slug === 'string') return parsed.slug;
  }
  return basename(dirname(source));
}
