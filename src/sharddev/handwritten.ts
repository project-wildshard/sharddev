// SA16 (J314): `new --template blender` is shard-format's hand-written template, `blender-template`
// (`corpus/handwritten`): a shard file folder held by hand, its sections JSON edited in place and its blobs frozen
// Blender output (J88), with no `shard.config.ts`, no sdk at runtime and no three.js. Format's own `shard-format pack`
// settles what the sections measure (hashes, sizes, packs, the source hash), so `new` and `check` run it, never a copy
// of its rules.
// oxlint-disable-next-line import/no-nodejs-modules -- Format's pack CLI runs as a child, as an author runs it.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Settle hashes over the author's own folder.
import { createHash } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The hand-written source and its settled copy are local folders.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Find format the way this installed package resolves it.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files beneath the source and format's package.
import { dirname, resolve } from 'node:path';
import { readTar } from '@wildshard/format/tar';
import { SHARD_INDEX } from './shardSource';

// The bundled CLI defines import.meta.dirname as the package's src/sharddev, so the package root is two up.
const SDK_ROOT = resolve(import.meta.dirname, '../..');
/** The installed shard-format package root (its exports name `.ts` files under `src/format/`). */
function formatRoot(): string {
  return resolve(dirname(createRequire(resolve(SDK_ROOT, 'package.json')).resolve('@wildshard/format/outputIndex')), '../..');
}
/** The hand-written template, as the installed shard-format ships it (`files`: `corpus/handwritten/**`). */
export function handwrittenTemplate(): string { return resolve(formatRoot(), 'corpus/handwritten'); }

interface Identity { readonly slug: string; readonly name: string }
interface Row { hash: string; bytes: number; path: string; url?: string }
function readJson(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${path}: not a JSON object`);
  return parsed as Record<string, unknown>;
}
/** Format holds each JSON file canonical: keys as written (already sorted), one trailing newline. */
function writeJson(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value)}\n`); }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

/** The identity in a hand-written source's `shard.json`. */
export function handwrittenIdentity(source: string): Identity {
  const identity = readJson(resolve(source, SHARD_INDEX))['identity'];
  if (typeof identity !== 'object' || identity === null || !('slug' in identity) || typeof identity.slug !== 'string'
    || !('name' in identity) || typeof identity.name !== 'string') throw new Error(`${resolve(source, SHARD_INDEX)}: no identity slug and name`);
  return { slug: identity.slug, name: identity.name };
}

/**
 * Settle the hand-written folder `source` into `into` (the same folder, or a built folder it replaces): format's
 * `shard-format pack` measures every section again and validates the whole folder, and its tarball's files are written
 * out. Nothing is written unless format admits the folder. Returns the shard's slug.
 */
export function settleHandwritten(source: string, into: string): string {
  const tar = `${into}.settle.tar`;
  mkdirSync(dirname(tar), { recursive: true });
  try {
    const done = spawnSync(process.execPath, [resolve(formatRoot(), 'src/cli/bin.mjs'), 'pack', source, '--out', tar], { encoding: 'utf8' });
    if (done.status !== 0) {
      const reason = `${done.stderr}${done.stdout}`.split('\n').find(line => line.startsWith('shard-format:')) ?? done.error?.message ?? `exit ${String(done.status)}`;
      throw new Error(`hand-written shard file does not pack: ${reason.replace(/^shard-format: /u, '')}`);
    }
    const files = readTar(new Uint8Array(readFileSync(tar)));
    if (into !== source) { rmSync(into, { recursive: true, force: true }); mkdirSync(into, { recursive: true }); }
    for (const [path, bytes] of files) {
      const target = resolve(into, path);
      if (!target.startsWith(`${resolve(into)}/`)) throw new Error(`hand-written shard file: ${path} leaves the folder`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
  } finally { rmSync(tar, { force: true }); }
  return handwrittenIdentity(into).slug;
}

/** Every JSON file a person holds in the folder: the index, the receipts, sections and mounts, never a baked blob. */
function heldJson(folder: string, prefix = ''): string[] {
  return readdirSync(resolve(folder, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return path === 'blobs' ? [] : heldJson(folder, path);
    return entry.name.endsWith('.json') ? [path] : [];
  });
}

/**
 * Copy the installed hand-written template into `source` as shard `slug`: its slug and name become the new shard's in
 * every held JSON file and its mount folder, the cook rows follow the rewritten mounts, and format's pack settles the
 * rest, so `source` is a valid shard file folder from the start.
 */
export function writeHandwrittenSource(source: string, slug: string): void {
  const template = handwrittenTemplate();
  if (!existsSync(resolve(template, SHARD_INDEX))) throw new Error(`new: the installed @wildshard/format has no hand-written template at ${template}`);
  const from = handwrittenIdentity(template);
  cpSync(template, source, { recursive: true, errorOnExist: true, force: false });
  const mounts = resolve(source, 'mounts/shardfiles');
  if (existsSync(resolve(mounts, from.slug))) renameSync(resolve(mounts, from.slug), resolve(mounts, slug));
  for (const path of heldJson(source)) {
    const file = resolve(source, path), text = readFileSync(file, 'utf8');
    const renamed = text.replaceAll(`/${from.slug}/`, `/${slug}/`).replaceAll(JSON.stringify(from.slug), JSON.stringify(slug))
      .replaceAll(JSON.stringify(from.name), JSON.stringify(slug));
    if (renamed !== text) writeFileSync(file, renamed);
  }
  // The cook receipt names each mount by hash, and the index names the cook receipt: both follow the rewritten files.
  const cookFile = resolve(source, 'cook.json'), indexFile = resolve(source, SHARD_INDEX);
  if (existsSync(cookFile)) {
    const cook = readJson(cookFile), rows = Array.isArray(cook['mounts']) ? cook['mounts'] as Row[] : [];
    for (const row of rows) { const bytes = new Uint8Array(readFileSync(resolve(source, row.path))); row.hash = sha256(bytes); row.bytes = bytes.length; }
    writeJson(cookFile, cook);
    const index = readJson(indexFile), cooked = new Uint8Array(readFileSync(cookFile));
    if (typeof index['cook'] === 'object' && index['cook'] !== null) writeJson(indexFile, { ...index, cook: { ...index['cook'] as Row, hash: sha256(cooked), bytes: cooked.length } });
  }
  settleHandwritten(source, source);
}
