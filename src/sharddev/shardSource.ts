// oxlint-disable-next-line import/no-nodejs-modules -- The CLI finds a shard source on disk from the path it was given.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the shard source beneath the given repo path.
import { basename, dirname, resolve } from 'node:path';

/** The build entry that marks a folder as a shard source. */
export const SHARD_CONFIG = 'shard.config.ts';

/**
 * SA16 (J317): the shard source a path names. A folder with `shard.config.ts` is one; a single-shard repo keeps its
 * source at `src/`; a multi-shard repo keeps `src/shards/<slug>/`, so its repo root names one only when it holds exactly
 * one. Any other path comes back unchanged, so the verb refuses it as it always has.
 */
export function findShardSource(path: string): string {
  const given = resolve(path);
  if (existsSync(resolve(given, SHARD_CONFIG))) return given;
  if (existsSync(resolve(given, 'src', SHARD_CONFIG))) return resolve(given, 'src');
  const shards = resolve(given, 'src/shards');
  if (!existsSync(shards)) return given;
  const found = readdirSync(shards, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(resolve(shards, entry.name, SHARD_CONFIG)));
  return found.length === 1 && found[0] !== undefined ? resolve(shards, found[0].name) : given;
}

/** A shard source at a single-shard repo's `src/` (J317), rather than its own folder or `src/shards/<slug>/`. */
export function isRepoSource(source: string): boolean {
  return basename(source) === 'src' && existsSync(resolve(source, SHARD_CONFIG));
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
  const manifest = resolve(source, 'manifest.json');
  if (existsSync(manifest)) {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'slug' in parsed && typeof parsed.slug === 'string') return parsed.slug;
  }
  return basename(dirname(source));
}
