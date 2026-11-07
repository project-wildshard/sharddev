#!/usr/bin/env node
// bake-packs.mjs — one boot pack per shard × tier (project/archive/2026-09-22-load-perf.md, "requests, first launch ≤ 20").
//
// A shard's boot reads 4–80 files (texture sets, glTF triplets, LODs, baked terrain / sky / cards). Each is a
// request: cheap over HTTP/2 on Wi-Fi, but ~80 of them are the whole "requests" budget four times over, and each
// one pays the service worker's per-request cost on the phone. The pack is those same files — exactly the list
// `bootFetches(def, chunkFiles(def))` returns for that tier, the bytes the boot would have fetched one by one —
// concatenated in step order into one file the boot streams (src/client/engine/boot/pack.ts): each file is handed to its step
// the moment its last byte lands, so download ∥ build overlaps as it did with the per-file prefetch, in one request.
//
//   public/assets/packs/<slug>.<tier>-<hash8>.bin   content-addressed (a changed file makes a new name), cache-first
//                                                   in the SW; gitignored and left out of the byte table — every
//                                                   build regenerates it from the committed files
//   src/client/game/boot/packs.generated.ts                     slug → tier → { parts: { url, bytes, files: [path, offset, size, type][] }[] }
//
// PARTS (E160, the user: "don't invalidate those as much"): one pack per shard meant any edit to any of its files named a
// new pack — Pine Hollow's phone players re-downloaded 18 MB for one repainted texture. A pack is now a few parts, each
// content-addressed on its own, so an edit costs its part. The cuts depend on the files' paths, not their bytes, so an
// edit does not move them: once a part holds PART_MIN it ends after a file whose path hashes to 0 mod 4 (or at PART_MAX
// whatever the path), never between a glTF's textures and the .gltf that follows them (Safari reads those textures
// through <img>: they must land first). A resized file can move at most the cut after it; the next hash cut re-aligns.
// Pine Hollow's 18 MB phone boot is ~8 parts; the requests row (bench.budget.json) has the room.
// KTX2 runs instead use bounded directory/slot cohorts (boot-pack-parts.mjs): tiled entry only asks for a
// demanded texture set, so mixing an unrelated set into its part would defeat the demand-only pack reader.
//
// glTF textures go before their .gltf: Safari's GLTFLoader loads textures through <img>, which the pack's fetch
// interception cannot see — src/client/engine/boot/pack.ts hands those loaders a blob: URL instead, which only works when the
// texture has already landed by the time the .gltf asks for it.
//
// Run after the byte table is written (vite.config.ts): the tier's file names come from src/client/game/boot/bytes.generated.ts.
//   node --import ./scripts/bake-loader.mjs scripts/bake-packs.mjs [--check]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetIndex, assetVersionRows } from '@wildshard/engine/scripts/app-build/gen.ts';
import { parseBootPublication, publishedBootTableSources, publishBootPublication, readBootPublication } from '@wildshard/engine/scripts/boot-publication.mjs';
import { bootPackParts } from '@wildshard/engine/scripts/boot-pack-parts.mjs';
import { lateAudioGroups } from '@wildshard/engine/scripts/app-build/audioPacks.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const PACK_DIR = resolve(PUBLIC, 'assets/packs');
const OUT_TS = resolve(ROOT, 'src/client/game/boot/packs.generated.ts');
const CHECK = process.argv.includes('--check');
const TIERS = ['phone', 'desktop'];

// the modules read the tier / chunk from the page's URL at import time: stand in for a phone page (Node has `navigator`)
const { initializeTier } = await import('@wildshard/engine/core/tier');
initializeTier('phone');

const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const { SHARDS } = await imp('src/shards.generated.ts');
const { playable } = await imp('src/client/game/shard/registry.ts');
const PLAYABLE_SHARDS = SHARDS.filter(playable);
const { prepareShardAssets } = await imp('src/client/game/shard/load.ts');
const { imagesFirstPlayingBytes } = await imp('src/client/game/grid/runtimeCost.ts');
const { registerGpuFiles, autoTexturePolicy } = await imp('src/client/engine/boot/gpuFiles.ts');
await Promise.all(SHARDS.map((m) => prepareShardAssets(m, registerGpuFiles)));
const { chunkFiles } = await imp('src/client/engine/boot/manifest.ts');
const { bootFetches } = await imp('src/client/engine/boot/prefetch.ts');

const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', json: 'application/json', m4a: 'audio/mp4', wav: 'audio/wav' };
const typeOf = (p) => TYPES[/\.(\w+)$/.exec(p)?.[1] ?? ''] ?? 'application/octet-stream';

/** glTF textures ahead of their .gltf, everything else in the boot's own order */
function packOrder(paths) {
  const out = [];
  const placed = new Set();
  for (const p of paths) {
    if (placed.has(p)) continue;
    const m = /^(\/assets\/models\/[^/]+\/)[^/]+\.gltf$/.exec(p);
    if (m) for (const q of paths) if (!placed.has(q) && q.startsWith(`${m[1]}textures/`)) { out.push(q); placed.add(q); }
    out.push(p); placed.add(p);
  }
  return out;
}

if (!CHECK) mkdirSync(PACK_DIR, { recursive: true });
const packs = {};
const keep = new Set();
/** @param {string} slug @param {string} tierName @param {readonly string[]} paths */
function writeParts(slug, tierName, paths) {
  return bootPackParts(paths, path => readFileSync(resolve(PUBLIC, `.${path}`)).length).map(group => {
    const bodies = group.map(path => readFileSync(resolve(PUBLIC, `.${path}`)));
    const blob = Buffer.concat(bodies);
    const name = `${slug}.${tierName}-${createHash('sha256').update(blob).digest('hex').slice(0, 8)}.bin`;
    keep.add(name);
    let offset = 0;
    const files = group.map((path, index) => {
      const bytes = bodies[index].length, row = [path, offset, bytes, typeOf(path)]; offset += bytes; return row;
    });
    const out = resolve(PACK_DIR, name);
    if (!CHECK && !existsSync(out)) writeFileSync(out, blob);
    return { url: `/assets/packs/${name}`, bytes: blob.length, files };
  });
}
for (const def of PLAYABLE_SHARDS) {
  for (const tierName of TIERS) {
    if (tierName === 'desktop' && def.load === undefined) continue; // unmigrated shards keep their existing phone-only packs
    await initializeTier(tierName);
    const files = chunkFiles(def, autoTexturePolicy(def.tiers?.[tierName]?.textures, imagesFirstPlayingBytes(def.runtimeCost))?.mode ?? 'img');
    const paths = packOrder(bootFetches(def, files));
    if (paths.length < 2) continue;
    for (const p of paths) if (!existsSync(resolve(PUBLIC, `.${p}`))) throw new Error(`bake-packs: ${def.slug} boots ${p} but public has no such file`);
    const parts = writeParts(def.slug, tierName, paths);
    packs[def.slug] = { ...packs[def.slug], [tierName]: { parts } };
    const total = parts.reduce((s, x) => s + x.bytes, 0);
    console.log(`[pack] ${def.slug}.${tierName}: ${paths.length} files, ${(total / 1e6).toFixed(2)} MB in ${parts.length} parts (${parts.map((x) => (x.bytes / 1e6).toFixed(1)).join(' + ')} MB)`);
  }
  for (const [name, paths] of Object.entries(await lateAudioGroups(ROOT, def.slug))) {
    packs[name] = { phone: { parts: writeParts(name, 'phone', paths) } };
  }
}

const publication = parseBootPublication({ schema: 'boot-publication/1',
  bytes: Object.fromEntries(Object.entries(JSON.parse(assetIndex())).filter(([name]) => !name.endsWith('.DS_Store'))),
  versions: assetVersionRows(), packs });
const ts = publishedBootTableSources(publication)['src/client/game/boot/packs.generated.ts'];
const prev = existsSync(OUT_TS) ? readFileSync(OUT_TS, 'utf8') : '';
if (CHECK) {
  if (JSON.stringify(readBootPublication(ROOT)) !== JSON.stringify(publication)) throw new Error('bake-packs: boot publication facts are stale');
  if (prev !== ts) { console.error('[pack] src/client/game/boot/packs.generated.ts is stale — run the build'); process.exit(1); }
} else {
  if (prev !== ts) { mkdirSync(dirname(OUT_TS), { recursive: true }); writeFileSync(OUT_TS, ts); }
  for (const f of readdirSync(PACK_DIR)) if (!keep.has(f)) unlinkSync(resolve(PACK_DIR, f)); // a changed file made a new hash
}

if (!CHECK) publishBootPublication(ROOT, publication);
