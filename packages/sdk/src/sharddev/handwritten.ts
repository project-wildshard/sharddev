// SA16 (J314): `new --template blender` (retired, J341; tests keep the shape) starts from a shard file folder format
// ships (`corpus/handwritten` until J434, now Brasscap Mesa's export): held by hand, its sections JSON edited in place
// and its blobs frozen Blender output (J88), with no `shard.config.ts`, no sdk at runtime and no three.js. Format's own `shard-format pack`
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
import { SHARD_INDEX } from '@wildshard/upload/sharddev/shardSource';

// The bundled CLI defines import.meta.dirname as the package's src/sharddev, so the package root is two up.
const SDK_ROOT = resolve(import.meta.dirname, '../..');
/** The installed shard-format package root (its exports name `.ts` files under `src/format/`). */
function formatRoot(): string {
  return resolve(dirname(createRequire(resolve(SDK_ROOT, 'package.json')).resolve('@wildshard/format/outputIndex')), '../..');
}
/** The shard file folder a hand-written source starts from, as the installed shard-format ships it: Brasscap Mesa's
 *  export (`corpus/exports/brasscap-mesa`), since J434 retired the hand-written Template 2 (meta TEMPLATE-E2E TR-10). */
export function handwrittenTemplate(): string { return resolve(formatRoot(), 'corpus/exports/brasscap-mesa'); }

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

// The creature layer a hand-written author writes for themselves (meta ONE-FORMAT OF25d). Template 2 held one plain
// creature and no fight; Brasscap's export holds the Dust Wyrm's, whose encounter names its spawn and whose decision
// guest names its actors, so an author who wrote creatures of their own could no longer pack.
const SEED_CREATURES: Readonly<Record<string, unknown>> = {
  'actors/species': { rows: { species: [] } },
  'actors/creatures': { creatures: { brains: [], groups: [], spawns: [] } },
  'combat/strikes': { rows: { strikes: [] } },
  'look/materials': { rows: { looks: [] } },
  'combat/encounters': { encounters: [] },
};
/** Sections only the template's creatures use: they go with them. */
const SEED_CREATURE_ONLY = new Set(['sim/scripts', 'actors/moves']);
const HASH = /[0-9a-f]{64}/gu;

/**
 * Empty the seed's creature layer and drop each blob nothing names any more (its creatures' bodies and decision
 * guests): the place stays (world, look, items, quests, the player's scripts), and its creatures are the author's.
 */
function clearSeedCreatures(source: string): void {
  const indexFile = resolve(source, SHARD_INDEX), index = readJson(indexFile);
  const sections = (index['sections'] as { name: string; path: string }[]).filter(row => {
    if (!SEED_CREATURE_ONLY.has(row.name)) return true;
    rmSync(resolve(source, row.path), { force: true });
    return false;
  });
  for (const [name, value] of Object.entries(SEED_CREATURES)) {
    if (sections.some(row => row.name === name)) writeJson(resolve(source, 'sections', `${name}.json`), value);
  }
  const files = index['files'] as { hash: string; path: string; dependencies?: readonly string[] }[];
  const named = new Set(heldJson(source).filter(path => path !== SHARD_INDEX).flatMap(path => readFileSync(resolve(source, path), 'utf8').match(HASH) ?? []));
  const byHash = new Map(files.map(file => [file.hash, file])), pending = [...named];
  for (let hash = pending.pop(); hash !== undefined; hash = pending.pop()) {
    for (const dependency of byHash.get(hash)?.dependencies ?? []) if (!named.has(dependency)) { named.add(dependency); pending.push(dependency); }
  }
  for (const file of files) if (!named.has(file.hash)) rmSync(resolve(source, file.path), { force: true });
  const admission = index['admission'] as Record<string, unknown>;
  const kept = (hashes: unknown): unknown => Array.isArray(hashes) ? hashes.filter(hash => named.has(String(hash))) : hashes;
  writeJson(indexFile, { ...index, sections, files: files.filter(file => named.has(file.hash)),
    admission: { ...admission, critical: kept(admission['critical']), library: kept(admission['library']) } });
}

/**
 * Copy the installed hand-written template into `source` as shard `slug`: its slug and name become the new shard's in
 * every held JSON file and its mount folder, its creature layer is emptied for the author's own, the cook rows follow
 * the rewritten mounts, and format's pack settles the rest, so `source` is a valid shard file folder from the start.
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
  clearSeedCreatures(source);
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
