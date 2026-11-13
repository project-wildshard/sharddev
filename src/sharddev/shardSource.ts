// oxlint-disable-next-line import/no-nodejs-modules -- The CLI finds a shard source on disk from the path it was given.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the shard source beneath the given repo path.
import { basename, dirname, resolve } from 'node:path';

/** The build entry that marks a folder as a shard source. */
export const SHARD_CONFIG = 'shard.config.ts';
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

/** Where build output lands for a shard source: the repo root for `src/`, the source folder itself otherwise. */
export function shardOutputRoot(source: string): string {
  return isRepoSource(source) ? dirname(source) : source;
}

/**
 * The folder name build checks a manifest's slug against (`project-folder-slug`). A `src/` source names no slug by its
 * folder, so its `manifest.json` slug is the folder; any other source is named by its folder, as before.
 */
export function shardFolderName(source: string): string {
  if (!isRepoSource(source)) return basename(source);
  const index = resolve(source, SHARD_INDEX);
  if (isHandwrittenSource(source)) {
    const parsed: unknown = JSON.parse(readFileSync(index, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'identity' in parsed && typeof parsed.identity === 'object' && parsed.identity !== null
      && 'slug' in parsed.identity && typeof parsed.identity.slug === 'string') return parsed.identity.slug;
  }
  const manifest = resolve(source, 'manifest.json');
  if (existsSync(manifest)) {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'slug' in parsed && typeof parsed.slug === 'string') return parsed.slug;
  }
  return basename(dirname(source));
}
