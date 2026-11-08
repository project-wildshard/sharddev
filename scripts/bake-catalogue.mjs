#!/usr/bin/env node
// C3 (D7): put a shard on an already built client, with no rebuild: what a flip does at the next deploy until E7.
//   node --import ./scripts/bake-loader.mjs scripts/bake-catalogue.mjs <dist> <shard.tar> <instance> <cellX> <cellY> [<packs folder> <packs origin>]
// With a packs folder the cook goes there for the store, and pages read it from that origin (J138); only the header stays.
// The tarball is cooked into <dist> and every table a page reads names it, title, spawn and server, in files the bundle doesn't hash. A deploy that
// takes its grid from api-server names that file with WILDSHARD_CATALOGUE at build time instead.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const { addCookedShards, productVerdict, writeCatalogueDocument } = await import('@wildshard/engine/scripts/app-build/catalogue.ts');
const { cookShard, openShardfile, servedAsIs } = await import('@wildshard/engine/game/shardCook');
const { writeServiceWorker } = await import('@wildshard/engine/scripts/app-build/serviceWorker.ts');

const [dist, tar, instance, x, y, packs, origin] = process.argv.slice(2);
if (dist === undefined || tar === undefined || instance === undefined || x === undefined || y === undefined) throw new Error('usage: bake-catalogue <dist> <shard.tar> <instance> <cellX> <cellY>');
const out = resolve(dist), tarball = readFileSync(tar), shard = openShardfile(tarball), slug = shard.slug;
const cooked = mkdtempSync(join(tmpdir(), 'bake-catalogue-'));
try {
  const report = await cookShard(tarball, cooked, { now: () => performance.now(), wireBytes: (url, bytes) => servedAsIs(url, bytes) ? bytes.length : brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length });
  // `dereference`: a preview's dist symlinks its folders.
  cpSync(cooked, packs === undefined ? out : resolve(packs), { recursive: true, dereference: true, force: true });
  const proved = await productVerdict(tarball, out);
  const header = join(out, 'shardfiles', slug);
  mkdirSync(header, { recursive: true }); writeFileSync(join(header, 'shard.json'), shard.header);
  // A shard's manifests name its document at the page's URL, loose as its header is: no part carries it.
  const document = join(cooked, 'shardfiles', slug, 'discovery.json');
  if (existsSync(document)) cpSync(document, join(header, 'discovery.json'));
  if (packs !== undefined) { mkdirSync(join(packs, 'shardfiles', slug), { recursive: true }); writeFileSync(join(packs, 'shardfiles', slug, 'shard.json'), shard.header); }
  const catalogue = JSON.parse(readFileSync(join(out, 'catalogue.json'), 'utf8'));
  const hash = createHash('sha256').update(tarball).digest('hex');
  catalogue.placements = [...catalogue.placements.filter(row => row.slug !== slug), { instance, slug, cell: [Number(x), Number(y)], size: [500, 500, 500], order: catalogue.placements.length + 1 }];
  catalogue.shards = [...catalogue.shards.filter(row => row.slug !== slug), { slug, name: shard.index.identity.name, revision: 1, hash }];
  writeCatalogueDocument(out, catalogue);
  // The server worker reads its pack beside the page, wherever the page's packs live (J134: nothing in it is secret).
  const { server: packed } = report;
  if (packed !== undefined) cpSync(join(cooked, 'assets/spawn/server'), join(out, 'assets/spawn/server'), { recursive: true, force: true });
  const server = packed === undefined ? {} : { server: JSON.parse(readFileSync(join(cooked, packed.index.slice(1)), 'utf8')) };
  addCookedShards(out, [{ slug, hash, header: '', manifests: report.manifests, ...proved, ...server }], cooked, packs === undefined || origin === undefined ? undefined : { base: origin, shards: [slug] });
  if (existsSync(join(out, 'sw.js'))) await writeServiceWorker(out, process.cwd());
  console.log(JSON.stringify({ slug, hash, seconds: report.seconds, parts: report.parts }));
} finally { rmSync(cooked, { recursive: true, force: true }); }
