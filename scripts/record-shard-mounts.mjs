#!/usr/bin/env node
// C0 (J137): record which public files each product owns, so a shardfile stands alone. A product's list goes to
// src/shards/<folder>/mounts.json; `writeOutputProduct` copies those files into the product under mounts/, and `cook` then
// needs nothing from the tree. Run it over a finished build, after a change to what a shard reads:
//   node scripts/record-shard-mounts.mjs [--dist=dist] [--check]
// A product reads a public file when its spawn manifests list it (the default and packs books, both tiers), its sections
// name it (or a folder holding it, or its tier variant), its boot inventory lists it, its legacy boot pack holds it, or it
// sits in an audio folder named for the shard. A file more than one shard folder reads belongs to the engine (the shared
// sfx, the piano stings): it stays out of every list, and a product of the same folder may share one.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { shardProducts } from '@wildshard/engine/scripts/shard-outputs.mjs';

const root = resolve(import.meta.dirname, '..');
const argument = (name) => process.argv.find(row => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const dist = resolve(root, argument('dist') ?? 'dist'), check = process.argv.includes('--check');
const publicRoot = resolve(root, 'public'), out = resolve(root, 'out');

const bare = (url) => url.split('?')[0] ?? url;
const onDisk = (url) => { const file = join(publicRoot, url.slice(1)); return existsSync(file) && statSync(file).isFile(); };
const isFolder = (url) => { const file = join(publicRoot, url.slice(1)); return existsSync(file) && statSync(file).isDirectory(); };
const filesUnder = (url) => readdirSync(join(publicRoot, url.slice(1)), { recursive: true, withFileTypes: true })
  .filter(row => row.isFile()).map(row => `/${relative(publicRoot, join(row.parentPath, row.name)).split(sep).join('/')}`);
/** The tier and encoding variants the boot's `tierUrl` and stand-in table can read for a section's URL. */
function variants(url) {
  const dot = url.lastIndexOf('.'), stem = url.slice(0, dot), extension = url.slice(dot);
  const rows = [url, `${stem}.phone${extension}`, `${stem}.ktx2`, `${stem}.phone.ktx2`];
  return [...rows, ...rows.map(row => row.replace(/^\/assets\//u, '/assets/gpu/'))];
}
/** A .gltf's external buffers and images, which load beside it. */
function gltfParts(url) {
  const body = JSON.parse(readFileSync(join(publicRoot, url.slice(1)), 'utf8')), folder = dirname(url);
  return [...body.buffers ?? [], ...body.images ?? []].flatMap(row => typeof row.uri === 'string' && !row.uri.startsWith('data:') ? [`${folder}/${row.uri}`] : []);
}
function sectionUrls(slug) {
  const found = new Set(), folder = join(out, slug, 'sections');
  if (!existsSync(folder)) return found;
  for (const row of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!row.isFile()) continue;
    for (const match of readFileSync(join(row.parentPath, row.name), 'utf8').matchAll(/"(\/assets\/[^"]+)"/gu)) found.add(match[1].replace(/\/$/u, ''));
  }
  return found;
}
/** A source file with a cooked stand-in on both tiers, and those stand-ins: no device reads the source, so a shardfile carries
 *  what the device does. */
function rawForms(folder) {
  const file = resolve(root, 'src/shards', folder, 'ktx2.generated.ts');
  if (!existsSync(file)) return new Map();
  const [, phone = '', desktop = ''] = /"phone": \{([\s\S]*?)\n {2}\},\n {2}"desktop": \{([\s\S]*?)\n {2}\}/u.exec(readFileSync(file, 'utf8')) ?? [];
  const rows = (text) => new Map([...text.matchAll(/"(\/assets\/[^"]+)": "(\/assets\/[^"]+)"/gu)].map(match => [match[1], match[2]]));
  const onPhone = rows(phone);
  return new Map([...rows(desktop)].flatMap(([url, cooked]) => onPhone.has(url) ? [[url, [onPhone.get(url), cooked]]] : []));
}
const SHELL = [/^\/assets\/(?:(?:spawn|packs|physics|fonts)\/|boot-)/u, /\.(?:js|mjs|css)$/u];
const shellOwned = (url) => SHELL.some(rule => rule.test(url));
function legacyMembers(slug) {
  const source = readFileSync(resolve(root, 'src/client/game/boot/packs.generated.ts'), 'utf8');
  return source.split(/^ {2}"/mu).filter(block => [`${slug}"`, `${slug}-`].some(start => block.startsWith(start)))
    .flatMap(block => [...block.matchAll(/"(\/assets\/[^"]+)"/gu)].map(match => match[1]));
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const bank = JSON.parse(/id="boot-module-files">([^<]+)</u.exec(html)?.[1] ?? 'null');
const book = JSON.parse(readFileSync(join(dist, readdirSync(join(dist, 'assets/spawn')).filter(name => name.startsWith('packs-')).map(name => `assets/spawn/${name}`)[0] ?? ''), 'utf8'));
const folders = readdirSync(resolve(root, 'src/shards'), { withFileTypes: true }).filter(row => row.isDirectory()).map(row => row.name);
const products = shardProducts(root, folders).filter(row => existsSync(join(out, row.slug, 'shard.json')));

const reads = new Map(), folderOf = new Map(products.map(row => [row.slug, row.folder]));
for (const { slug } of products) {
  const pending = new Set();
  for (const shelf of [bank.spawnManifests.client[slug], book.client[slug]]) for (const address of Object.values(shelf ?? {})) {
    for (const row of JSON.parse(readFileSync(join(dist, address.url.slice(1)), 'utf8')).files) pending.add(bare(row.url));
  }
  const extra = bank.extras[`/shardfiles/${slug}/`];
  if (extra !== undefined) for (const [url] of JSON.parse(readFileSync(join(dist, extra[0].slice(1)), 'utf8'))) pending.add(bare(url));
  for (const url of sectionUrls(slug)) {
    if (isFolder(url)) for (const file of filesUnder(url)) pending.add(file);
    else for (const variant of variants(url)) pending.add(variant);
  }
  for (const url of legacyMembers(slug)) pending.add(bare(url));
  // The boot tables name audio by slot, and a slot can load long after control: a folder named for the shard is its own.
  const names = new Set([slug, slug.replace(/^open-plot-/u, ''), slug.split('-')[0]]);
  // A bake names its blobs inside its own files, so the folder is the unit (Nalati's held bow reads one that way).
  for (const name of names) if (isFolder(`/assets/${name}/baked`)) for (const file of filesUnder(`/assets/${name}/baked`)) pending.add(file);
  for (const kind of ['sfx', 'music']) for (const name of readdirSync(join(publicRoot, 'assets', kind))) {
    if ((names.has(name) || name.startsWith(`${slug}-`)) && isFolder(`/assets/${kind}/${name}`)) for (const file of filesUnder(`/assets/${kind}/${name}`)) pending.add(file);
  }
  const seen = new Set(), raws = rawForms(folderOf.get(slug));
  for (const [url, cooked] of raws) if (pending.has(url)) for (const row of cooked) pending.add(row);
  for (const url of pending) {
    if (!url.startsWith('/assets/') || shellOwned(url) || !onDisk(url) || seen.has(url) || raws.has(url)) continue;
    seen.add(url);
    if (url.endsWith('.gltf')) for (const part of gltfParts(url)) if (onDisk(part)) seen.add(part);
  }
  reads.set(slug, seen);
}
const users = new Map();
for (const [slug, urls] of reads) for (const url of urls) (users.get(url) ?? users.set(url, new Set()).get(url)).add(folderOf.get(slug));

let stale = 0;
for (const folder of folders) {
  const outputs = {};
  for (const { slug } of products.filter(row => row.folder === folder)) {
    const owned = [...reads.get(slug)].filter(url => users.get(url).size === 1).sort((left, right) => left.localeCompare(right));
    // A shard's recorded programs: its page reads them by name, so the tarball carries them (D5).
    if (existsSync(join(publicRoot, 'programs', `${slug}.json`))) owned.push(`/programs/${slug}.json`);
    if (owned.length > 0) outputs[slug] = owned;
    const bytes = owned.reduce((sum, url) => sum + statSync(join(publicRoot, url.slice(1))).size, 0);
    console.log(`${slug}: ${owned.length} mounts, ${(bytes / 1e6).toFixed(1)} MB`);
  }
  const file = resolve(root, 'src/shards', folder, 'mounts.json'), text = `${JSON.stringify({ version: 1, outputs }, null, 1)}\n`;
  if (Object.keys(outputs).length === 0) continue;
  if (check) { if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { console.error(`stale: ${file}`); stale++; } }
  else writeFileSync(file, text);
}
if (stale > 0) process.exit(1);
