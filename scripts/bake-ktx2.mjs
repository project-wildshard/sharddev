#!/usr/bin/env node
// bake-ktx2.mjs — every GPU texture as KTX2 / Basis Universal, so it stays compressed ON the GPU (E157): ASTC 4×4 on
// the iPhone, BC7 / ASTC / ETC2 on desktop, instead of the RGBA8 an image decodes to (4 bytes a texel + mips).
//
// What it encodes (the images the game samples in 3D; UI art — title decks, HUD icons, the journal — is not a GPU
// texture and is left alone):
//   - standalone images: the Poly Haven sets (/assets/tex), the tree set's cards + impostors, the Driftwood lightmaps,
//     the baked textures (/assets/baked), Nalati's painted tiles, grass-card atlas and sky panorama, the painted horizons;
//   - the glTF props' external textures (/assets/models/<id>/textures) and their .gltf, rewritten to point at them;
//   - every GLB with embedded images (KHR_texture_basisu; geometry bytes untouched).
//
// Per tier, per file the tier SERVES (the phone's `.phone.webp` / `.phone.glb` copy when there is one, src/client/engine/boot/bytes.ts
// tierUrl): the phone's KTX2 has the phone copy's size, the desktop's the full-res file's own size (E173; the desktop
// loaders cap at 4096 and read every file here whole). Encoded from the best source there is (the original map, not a
// lossy copy of it). Both tiers are baked (E173: desktop Pine Hollow held ~950 MB of RGBA8 textures, ~1.7 GB with two
// shards resident); an encode that is the same for both tiers (same source, size, class, flip) is one file.
// Texture-array layers are baked at the tier's array size (src/client/engine/core/tier.ts layerSize: the desktop's 1024 is the phone's
// file size, so the desktop reuses the phone's layer twins of the 2048² ground sets instead of a 2048² twin it would
// only sample from mip 1).
//
// Encoder (basisu v2.50, Homebrew `basis_universal`), per texture class:
//   color   UASTC LDR 4×4, level 2, sRGB, no RDO (λ 4 cost 6 dB), zstd 20        diffuse / albedo / emissive, atlases, horizons
//   normal  UASTC LDR 4×4, level 2, -normal_map (linear metrics, linear mips)    tangent-space normal maps
//   linear  UASTC LDR 4×4, level 2, linear                                        lightmaps, the cloud field (smooth: no ETC1S banding)
//   data    ETC1S q255, linear                                                    ARM / ORM / AO / roughness / metalness planes
// all: full mip chain (-mipmap, box filter = what the GPU's generateMipmap made before); standalone images are Y-flipped
// at encode (-y_flip: the loaders drew them flipY = true / ImageBitmap 'flipY'); glTF textures are not (glTF's own
// convention), nor the Driftwood lightmaps (loaded flipY = false).
//
// Output: public/assets/gpu/<the source's path>/<served name>-<sha256[:8] of the bytes>.{ktx2,glb,gltf} — content-addressed,
// so a file never changes under its name (the `immutable` cache rule; the SW keeps it forever) and a rebake that
// changes nothing changes no name. src/client/engine/boot/ktx2.generated.ts maps, per tier, each served URL → its KTX2 stand-in
// (read by src/client/engine/boot/gpuFiles.ts). scripts/bake-ktx2.cache.json remembers the source hash + settings of every output,
// so a rerun encodes only what changed (a no-change rerun: ~2 s).
//
// Only files the game was SEEN to load are baked: scripts/bake-ktx2.list.json, per tier, the URLs a boot of each shard
// fetched (recorded by `node scripts/gpu-texmem.mjs --record --chunk=<slug> --tier=<tier>`). The repo
// holds ~250 GLBs and ~180 images, most of them sources, alternates and other shards' art; a file that is not on the
// list simply keeps loading as an image (the texmem report lists what is still RGBA8). The texture-array layers (the
// terrain splat, the bark) are baked a second time unflipped (`<url>#layer`): loadPBRArray keeps the file's orientation.
//
//   node --import ./scripts/bake-loader.mjs scripts/bake-ktx2.mjs [--dry] [--force] [--only=<substr>] [--jobs=4] [--tiers=phone,desktop] [--desktop-max=16384]
import { COMMON, CLASS, FAR, glbKtx2Key } from './ktx2-settings.mjs';
import { writeKtx2Tables } from '@wildshard/engine/scripts/ktx2-tables.mjs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

/** a child process as a promise (the encodes run JOBS at a time); rejects with its stderr's tail */
async function execFile(cmd, args) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += String(d); });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`${cmd} exited ${code}: ${err.slice(-400)}`);
}
const ROOT = resolve(import.meta.dirname, '..');
const PUB = resolve(ROOT, 'public');
const ASSETS = resolve(PUB, 'assets');
const OUT = resolve(ASSETS, 'gpu');
const CACHE_FILE = resolve(ROOT, 'scripts/bake-ktx2.cache.json');
const LIST_FILE = resolve(ROOT, 'scripts/bake-ktx2.list.json');
const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const CHECK = argv.includes('--check');
const DRY = argv.includes('--dry') ? true : CHECK, FORCE = argv.includes('--force') && !CHECK;
const missing = new Set();
const staleSource = (served) => { missing.add(served); console.log(`bake-ktx2: STALE ${served} (source/settings cache entry or output missing)`); };
const ONLY = flag('only', '');
const JOBS = Number(flag('jobs', '4'));
/** the desktop's largest KTX2 edge: the file's own size (the horizons are 6144 wide and load whole) */
const DESKTOP_MAX = Number(flag('desktop-max', String(1 << 14)));
/** the texture-array size per tier (src/client/engine/core/tier.ts TIER_CONFIG.layerSize): a desktop layer twin is baked at it */
const DESKTOP_LAYER = 1024;
/** the tiers baked (E173: both; `--tiers=phone` bakes the phone's alone, and then drops the desktop's files) */
const TIERS = new Set(flag('tiers', 'phone,desktop').split(','));

/** the URLs each tier was seen to load (see the header) */
// A bounded source catalogue can emit charged library assets without native shard/engine imports.
const libraryInput = flag('library', '');
if (libraryInput !== '') {
  const { bakeTextureLibrary } = await import('../src/shards/far-reach/generators/bake-sky-world.mjs');
  const { bakeColourTexture } = await import('../src/sharddev/bake/texture.ts');
  await bakeTextureLibrary(ROOT, libraryInput, { encoder: bakeColourTexture, encode: argv.includes('--encode'), check: CHECK });
  process.exit(0);
}
const LIST = JSON.parse(readFileSync(LIST_FILE, 'utf8'));
const listed = { phone: new Set(TIERS.has('phone') ? LIST.phone : []), desktop: new Set(TIERS.has('desktop') ? LIST.desktop : []) };
// the texture-array layers' sets (src/client/engine/core/assets.ts loadPBRArray): every shard's ground layers + the bark set
// the modules read the tier from the page's URL at import time: stand in for a phone page (as scripts/bake-packs.mjs does)
const { initializeTier } = await import('@wildshard/engine/core/tier');
initializeTier('phone');
const { pathToFileURL } = await import('node:url');
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const { SHARDS } = await imp('src/shards.generated.ts');
const { playable } = await imp('src/client/game/shard/registry.ts');
const PLAYABLE_SHARDS = SHARDS.filter(playable);
const { BARK_LAYERS } = await imp('src/client/engine/world/forest/treeSet.ts');
const LAYER_SETS = new Set(BARK_LAYERS);
for (const c of PLAYABLE_SHARDS) for (const id of [...(c.assets?.groundLayers ?? []), ...(c.assets?.boreal?.v1?.groundLayers ?? [])]) LAYER_SETS.add(id);
const layerSetOf = (file) => /\/assets\/tex\/([^/]+)\/(diffuse|nor_gl|arm)(_1k)?\.jpg$/.exec(file)?.[1] ?? null;
const isLayerFile = (file) => { const id = layerSetOf(file); return id !== null && LAYER_SETS.has(id); };
/**
 * Layer sets no plain loader reads (loadPBR / loadTexture): only their unflipped `#layer` twin is ever loaded, so their
 * Y-flipped KTX2 would be a file no KTX2 set names (E173: 31.8 MB on the desktop, 10.4 MB of the phone's). The sets a
 * plain loader also reads keep both: pine_bark (the cabins), rock_ground (the terrain slab, the crags).
 * test/ktx2-auto.test.ts holds this list to the truth both ways: every file under /assets/gpu is in some tier's KTX2 set
 * (a set missing here leaves an unread file), and no KTX2 boot declares an image of a set named here (one wrongly here
 * would load as an image).
 */
const ARRAY_ONLY = new Set(['bark_willow_02', 'birch_bark', 'fir_bark', 'metasequoia_bark', 'forrest_ground_03', 'leafy_grass', 'stony_dirt_path']);
const arrayOnly = (file) => { const id = layerSetOf(file); return id !== null && ARRAY_ONLY.has(id) && LAYER_SETS.has(id); };

const ENCODER = /v[\d.]+/.exec(execFileSync('basisu', ['-version']).toString())?.[0] ?? '?';
/** texture class from a file / image name */
function classOf(name) {
  const n = basename(name).toLowerCase();
  if (/(^|[_\-.])(lm|clouds)[_\-.]/.test(n)) return 'linear'; // lightmaps; the baked cloud field (sampled as data, NoColorSpace)
  if (/(^|[_\-.])(nor|nor_gl|normal|nrm)([_\-.]|$)/.test(n)) return 'normal';
  if (/(^|[_\-.])(arm|orm|ao|rough|roughness|metal|metalness|metallic)([_\-.]|$)/.test(n)) return 'data';
  return 'color';
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const pub = (abs) => `/${relative(PUB, abs).split('\\').join('/')}`;
const abs = (p) => join(PUB, p);
const walk = (dir, out = []) => { if (!existsSync(dir)) return out; for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (p !== OUT && !p.endsWith('/packs')) walk(p, out); } else out.push(p); } return out; };
const dimsCache = new Map();
function dims(file) {
  let d = dimsCache.get(file);
  if (!d) { const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h\n', `${file}[0]`]).toString().trim().split(/\s+/).map(Number); d = { w, h }; dimsCache.set(file, d); }
  return d;
}
const hasAlpha = (file) => execFileSync('magick', ['identify', '-format', '%[opaque]', `${file}[0]`]).toString().trim().toLowerCase() === 'false';
/** fit (w, h) inside max, keeping the aspect; multiples of 4 (the block size) */
function fit(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  const r4 = (x) => Math.max(4, Math.round((x * k) / 4) * 4);
  return { w: r4(w), h: r4(h) };
}

// ── the cache: key (source hash + settings) → output path ──
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const usedKeys = new Set();

// ── encoding ──
const TMP = join(tmpdir(), `bake-ktx2-${process.pid}`);
mkdirSync(TMP, { recursive: true });
let tmpN = 0;
/**
 * Encode `srcFile` (any image magick reads) to KTX2 at w×h with the class's flags; returns the bytes. Resized per
 * channel when it has alpha (the default alpha-weighted resize blackens the RGB under transparent texels, which
 * filtering and the mips still read — scripts/tex-tiers.mjs does the same).
 */
async function encode(srcFile, w, h, cls, flip) {
  const id = ++tmpN;
  const png = join(TMP, `${id}.png`), out = join(TMP, `${id}.ktx2`);
  const d = dims(srcFile);
  const resize = d.w === w && d.h === h ? [] : hasAlpha(srcFile) ? ['-separate', '-resize', `${w}x${h}!`, '-combine'] : ['-resize', `${w}x${h}!`];
  await execFile('magick', [`${srcFile}[0]`, ...resize, '-strip', `PNG32:${png}`]);
  await execFile('basisu', [...COMMON, ...(cls === 'far' ? FAR : CLASS[cls]), ...(flip ? ['-y_flip'] : []), png, '-output_file', out]);
  const bytes = readFileSync(out);
  rmSync(png); rmSync(out);
  return bytes;
}

/** a content-addressed output next to its source's mirror under /assets/gpu: `<stem>-<hash8>.<ext>` */
function outPath(servedPub, bytes, ext) {
  const rel = servedPub.replace(/^\/assets\//, '').replace(/#layer$/, '');
  const stem = basename(rel).replace(/\.(png|jpe?g|webp|glb|gltf)$/i, '');
  return join(OUT, dirname(rel), `${stem}-${sha(bytes).slice(0, 8)}.${ext}`);
}


async function runPool(tasks) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
}

// ── the jobs ──
/** [tier, served URL, best source (abs), target w, h, class, flip] */
const imageJobs = [];
const skipped = [];
const phoneCopyOf = (file) => {
  const stem = file.replace(/\.(png|jpe?g|webp)$/i, '');
  for (const c of [`${stem}.phone.webp`, `${stem}-phone.webp`]) if (existsSync(c)) return c;
  return null;
};
const isPhoneCopy = (f) => /\.phone\.webp$|-phone\.webp$/.test(f);
function addImage(file, flip, clsOverride) {
  const cls = clsOverride ?? classOf(file);
  const orig = file.endsWith('_1k.jpg') && existsSync(file.replace(/_1k\.jpg$/, '.jpg')) ? file.replace(/_1k\.jpg$/, '.jpg') : file; // the best source
  const phone = phoneCopyOf(file);
  // desktop: the file itself (never a Poly Haven set's phone-only `_1k` copy of a larger map: texUrl() asks those only on the phone)
  if (orig === file && listed.desktop.has(pub(file))) {
    const d = dims(file);
    if (Math.max(d.w, d.h) > DESKTOP_MAX) skipped.push(`${pub(file)} (desktop, ${d.w}×${d.h} > ${DESKTOP_MAX})`);
    else { const t = fit(d.w, d.h, DESKTOP_MAX); push('desktop', pub(file), orig, t.w, t.h, cls, flip, isLayerFile(file) ? fit(d.w, d.h, DESKTOP_LAYER) : null, arrayOnly(file)); }
  }
  // phone: the phone copy when there is one (≤ 1024 px, scripts/tex-tiers.mjs), else the file, at its own size — the
  // loaders that cap the phone at 1024 (core/assets loadTexture) drop the KTX2's top mips instead; `X.jpg` with an
  // `X_1k.jpg` sibling is never asked for on the phone
  if (file.endsWith('.jpg') && !file.endsWith('_1k.jpg') && existsSync(file.replace(/\.jpg$/, '_1k.jpg'))) return;
  const served = phone ?? file;
  const d = dims(served);
  const t = fit(d.w, d.h, 1 << 14);
  push('phone', pub(served), orig, t.w, t.h, cls, flip, isLayerFile(file) ? t : null, arrayOnly(file));
}
/**
 * A job for a file the tier was seen to load; a texture-array layer also gets its unflipped twin under `<url>#layer`, at
 * `layer`'s size (the phone: the file's own — ktx2Layers starts at the mip that fits; the desktop: its array size), and
 * only that twin when its set is ARRAY_ONLY.
 */
function push(tier, served, orig, w, h, cls, flip, layer, onlyLayer = false) {
  if (!listed[tier].has(served)) return;
  if (!(layer && onlyLayer)) imageJobs.push([tier, served, orig, w, h, cls, flip]);
  if (layer) imageJobs.push([tier, `${served}#layer`, orig, layer.w, layer.h, cls, false]);
}
const images = (dir, re = /\.(png|jpe?g|webp)$/i) => walk(join(ASSETS, dir)).filter((f) => re.test(f) && !isPhoneCopy(f));

// Poly Haven sets + twig atlases (loadTexture / loadPBR / loadPBRArray: flipped)
for (const f of images('tex')) addImage(f, true);
// the tree set's cards + impostors (TreeFactory loadTexture), Driftwood's lightmaps (BlenderIsland: flipY false)
for (const f of images('models/pine-hollow-trees')) addImage(f, true);
for (const f of images('models/driftwood-blender')) addImage(f, false);
// baked textures + baked branch cards (bakedTexture / BakedCards: flipped); fur maps have only phone copies and are unread
for (const f of images('baked')) addImage(f, true);
// Nalati: painted tiles, the grass-card atlas, the sky panorama (fetchImage / loadTexture: flipped)
for (const f of images('nalati/tex')) addImage(f, true);
for (const n of ['cards', 'panorama']) addImage(join(ASSETS, `nalati/${n}.webp`), true);
// painted horizons (HorizonMatte, TextureLoader flipY = true): the phone copy of pine-hollow is `-phone.webp`
for (const f of images('horizon')) addImage(f, true);
// Nine Dragon's painted leaf and LED scroll, plus the viewmodel's data and object-normal maps.
// The paint layers are assembled into a DataArrayTexture on the CPU, so they stay images.
for (const f of images('nine-dragon/lab/organic')) addImage(f, true);
for (const f of images('nine-dragon/viewmodel')) addImage(f, false, f.includes('-maps.') ? 'data' : undefined);
// glTF props' external textures: glTF orientation (no flip); their .gltf is rewritten below
for (const f of walk(join(ASSETS, 'models')).filter((x) => /\/textures\/[^/]+\.(png|jpe?g)$/i.test(x))) addImage(f, false);

/**
 * GLBs whose textures the game reads back on the CPU, so they must stay images: a compressed texture has no pixels to
 * draw on a canvas. Nalati's creature hulls' atlases are still read (the Sky-Marked Saddle repaints the saddled hull's
 * felt, weapons/nalatiSkins.ts; a coat with no bake is painted from it), though its coats come baked (scripts/bake-coats.mjs,
 * merged below), and the camp's people are packed into one atlas (src/shards/nalati-grasslands/campPeopleModels.ts). Pine
 * Hollow's hulls are baked (G187 cut 2): their coats come pre-painted from scripts/bake-coats.mjs (merged below), and the trophy wall
 * reads a KTX2 coat back through the GPU (src/shards/pine-hollow/world/trophyWall.ts).
 */
const CPU_READ = [/^\/assets\/nalati\/models\/[^/]+\.rigged\.glb$/, /^\/assets\/nalati\/models\/people\//];
/**
 * G187: textures baked by their own scripts (table name → KTX2, per tier): cut 2, Pine Hollow's coats, painted and encoded
 * by scripts/bake-coats.mjs (G226: Nalati's too); cut 3, the weapon viewmodel sets, drawn and encoded by scripts/bake-viewmodel-sets.mjs
 */
const BAKED = ['src/shards/pine-hollow/generators/bake-pine-coats.json', 'src/shards/nalati-grasslands/generators/bake-nalati-coats.json', 'scripts/bake-viewmodel-sets.json'].map((f) => resolve(ROOT, f)).filter((f) => existsSync(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')));
/** GLBs with embedded images, per tier: [tier, served URL, file] */
const glbJobs = [];
for (const f of walk(ASSETS).filter((x) => x.endsWith('.glb') && !CPU_READ.some((re) => re.test(pub(x))))) {
  const phoneName = f.includes('.phone.');
  if (!phoneName && listed.desktop.has(pub(f))) glbJobs.push(['desktop', pub(f), f]);
  if (listed.phone.has(pub(f))) glbJobs.push(['phone', pub(f), f]);
}
/** .gltf props with external textures */
const gltfJobs = [];
for (const f of walk(join(ASSETS, 'models')).filter((x) => x.endsWith('.gltf'))) for (const tier of ['desktop', 'phone']) if (listed[tier].has(pub(f))) gltfJobs.push([tier, pub(f), f]);

const only = (served) => ONLY === '' || served.includes(ONLY);
const map = { phone: {}, desktop: {} };
let encoded = 0, reused = 0, bytesIn = 0, bytesOut = 0;

/** encode-or-reuse one standalone image; returns its output path */
async function imageOut(src, w, h, cls, flip, served) {
  const key = sha(`${sha(readFileSync(src))}|${w}x${h}|${cls}|${flip ? 'flip' : ''}|${ENCODER}|${[...COMMON, ...CLASS[cls]].join(' ')}`);
  usedKeys.add(key);
  const hit = cache[key];
  if (!FORCE && hit && existsSync(abs(hit))) { reused++; return hit; }
  if (DRY) { if (CHECK) staleSource(served); return `(new) ${served}`; }
  const bytes = await encode(src, w, h, cls, flip);
  const out = outPath(served, bytes, 'ktx2');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  cache[key] = pub(out);
  encoded++;
  return pub(out);
}

console.log(`bake-ktx2: ${ENCODER} · ${imageJobs.length} image jobs · ${glbJobs.length} GLB jobs · ${gltfJobs.length} glTF jobs${DRY ? ' (dry)' : ''}`);
// images: dedupe identical encodes (the same source at the same size for both tiers)
const pending = new Map();
const imageTask = (job) => async () => {
  const [tier, served, src, w, h, cls, flip] = job;
  if (!only(served)) return;
  const k = `${src}|${w}x${h}|${cls}|${flip}`; // the same encode for both tiers / both keys: one file
  let p = pending.get(k);
  if (!p) { p = imageOut(src, w, h, cls, flip, served); pending.set(k, p); }
  map[tier][served] = await p;
  if (!served.endsWith('#layer')) bytesIn += statSync(abs(served)).size;
};
await runPool(imageJobs.map(imageTask));

/** GLB: its embedded images → KTX2 (KHR_texture_basisu), classed by the material slot that samples them */
/**
 * A GLB's JSON and its BIN chunk (buffer 0). Only buffer 0 holds bytes: a meshopt GLB's bufferViews point into a
 * data-less fallback buffer and carry their real range in EXT_meshopt_compression — both kinds of range are kept.
 */
function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  return { json, bin };
}
/** the bytes of an image's bufferView (images are never meshopt-compressed) */
const imageBytes = (json, bin, view) => { const v = json.bufferViews[view]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
/**
 * The GLB with some bufferViews' bytes replaced (`swap`: view index → new bytes): buffer 0 is rebuilt from every range
 * that points into it — each bufferView on buffer 0 and each EXT_meshopt_compression range on buffer 0 — in their
 * original order, 4-byte aligned, and every offset is remapped. Nothing else changes (geometry bytes are copied as they were).
 */
function glbBytes(json, bin, swap) {
  const ranges = [];
  for (const [i, v] of json.bufferViews.entries()) {
    if ((v.buffer ?? 0) === 0) ranges.push({ holder: v, off: v.byteOffset ?? 0, len: v.byteLength, data: swap.get(i) });
    const m = v.extensions?.EXT_meshopt_compression;
    if (m && (m.buffer ?? 0) === 0) ranges.push({ holder: m, off: m.byteOffset ?? 0, len: m.byteLength, data: undefined });
  }
  ranges.sort((a, b) => a.off - b.off);
  const parts = []; const placed = new Map(); let at = 0;
  for (const r of ranges) {
    const key = `${r.off}:${r.len}`;
    let where = placed.get(key);
    if (where === undefined || r.data !== undefined) {
      const bytes = r.data ?? bin.subarray(r.off, r.off + r.len);
      const pad = (4 - (at % 4)) % 4; if (pad > 0) { parts.push(Buffer.alloc(pad)); at += pad; }
      where = at; parts.push(bytes); at += bytes.length;
      if (r.data === undefined) placed.set(key, where);
    }
    r.holder.byteOffset = where;
    r.holder.byteLength = r.data?.length ?? r.len;
  }
  const pad = (4 - (at % 4)) % 4; if (pad > 0) { parts.push(Buffer.alloc(pad)); at += pad; }
  json.buffers[0].byteLength = at;
  const out = Buffer.concat(parts);
  let jb = Buffer.from(JSON.stringify(json), 'utf8');
  jb = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(out.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  header.writeUInt32LE(12 + 8 + jb.length + 8 + out.length, 8);
  return Buffer.concat([header, jh, jb, bh, out]);
}
/** per image index: the strictest class of the slots that sample it (color > normal > linear > data) */
function imageClasses(json) {
  const texSource = (t) => { const x = json.textures?.[t]; return x?.source ?? x?.extensions?.EXT_texture_webp?.source ?? x?.extensions?.KHR_texture_basisu?.source; };
  const rank = { data: 0, linear: 1, normal: 2, color: 3 };
  const out = new Map();
  const note = (info, cls) => { if (!info) return; const s = texSource(info.index); if (s === undefined) return; const cur = out.get(s); if (!cur || rank[cls] > rank[cur]) out.set(s, cls); };
  for (const m of json.materials ?? []) {
    const p = m.pbrMetallicRoughness ?? {};
    note(p.baseColorTexture, 'color'); note(m.emissiveTexture, 'color');
    note(m.normalTexture, 'normal');
    note(p.metallicRoughnessTexture, 'data'); note(m.occlusionTexture, 'data');
    for (const ext of Object.values(m.extensions ?? {})) for (const [k, v] of Object.entries(ext ?? {})) if (v && typeof v === 'object' && 'index' in v) note(v, /normal/i.test(k) ? 'normal' : /color|sheen|specularColor/i.test(k) ? 'color' : 'data');
  }
  return out;
}
const glbDone = new Map();
/** G738 / I4: GLBs drawn only far away, whose colour images take the FAR encode (the phone's ambient bird flock: its
 *  atlas 782 → 175 KB, board art/pine-hollow/round-37-phone-birds-etc1s) */
const FAR_GLBS = new Set(['/assets/pine-hollow/life/birds.phone.glb']);
async function glbOut(file, served) {
  const src = readFileSync(file), far = FAR_GLBS.has(served);
  const key = glbKtx2Key(src, ENCODER, far);
  usedKeys.add(key);
  const hit = cache[key];
  if (!FORCE && hit && (hit === 'none' || existsSync(abs(hit)))) { reused++; return hit === 'none' ? null : hit; }
  const { json, bin } = readGlb(file);
  const swap = new Map();
  if (!(json.images?.length > 0)) { if (CHECK) staleSource(served); else cache[key] = 'none'; return null; }
  if (DRY) { if (CHECK) staleSource(served); return `(new) ${served}`; }
  const classes = imageClasses(json);
  for (const [i, img] of json.images.entries()) {
    if (img.bufferView === undefined) throw new Error(`${file}: image ${i} is not embedded`);
    const tmp = join(TMP, `glb-${++tmpN}.${(img.mimeType ?? 'image/png').split('/')[1]}`);
    writeFileSync(tmp, imageBytes(json, bin, img.bufferView));
    const d = dims(tmp);
    const t = fit(d.w, d.h, 1 << 14);
    const cls = classes.get(i) ?? 'color';
    swap.set(img.bufferView, await encode(tmp, t.w, t.h, far && cls === 'color' ? 'far' : cls, false));
    rmSync(tmp);
    img.mimeType = 'image/ktx2';
  }
  for (const t of json.textures ?? []) {
    const s = t.source ?? t.extensions?.EXT_texture_webp?.source;
    if (s === undefined) continue;
    const ext = { ...t.extensions }; delete ext.EXT_texture_webp;
    t.extensions = { ...ext, KHR_texture_basisu: { source: s } };
    delete t.source;
  }
  for (const k of ['extensionsUsed', 'extensionsRequired']) json[k] = [...new Set([...(json[k] ?? []).filter((e) => e !== 'EXT_texture_webp'), 'KHR_texture_basisu'])];
  const bytes = glbBytes(json, bin, swap);
  const out = outPath(served, bytes, 'glb');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  cache[key] = pub(out);
  encoded++;
  return pub(out);
}
await runPool(glbJobs.map(([tier, served, file]) => async () => {
  if (!only(served)) return;
  let p = glbDone.get(file);
  if (!p) { p = glbOut(file, served); glbDone.set(file, p); }
  const out = await p;
  if (out) { map[tier][served] = out; bytesIn += statSync(file).size; }
}));

// .gltf: the same JSON with each image pointing at the tier's KTX2 of the file the tier would have loaded (relative to
// the ORIGINAL .gltf's folder: GLTFLoader resolves resources against the URL it was asked for, before the URL modifier)
for (const [tier, served, file] of gltfJobs) {
  if (!only(served)) continue;
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if (!(json.images?.length > 0)) continue;
  const dir = dirname(file);
  let ok = true;
  for (const img of json.images) {
    if (!img.uri) { ok = false; break; }
    const f = join(dir, decodeURI(img.uri));
    const tierFile = tier === 'phone' ? (phoneCopyOf(f) ?? f) : f;
    const k = map[tier][pub(tierFile)];
    if (!k) { ok = false; break; }
    img.uri = relative(dir, abs(k)).split('\\').join('/');
    img.mimeType = 'image/ktx2';
  }
  if (!ok) { skipped.push(`${served} (${tier}: a texture has no KTX2)`); continue; }
  for (const t of json.textures ?? []) { if (t.source === undefined) continue; t.extensions = { ...t.extensions, KHR_texture_basisu: { source: t.source } }; delete t.source; }
  for (const k of ['extensionsUsed', 'extensionsRequired']) json[k] = [...new Set([...(json[k] ?? []), 'KHR_texture_basisu'])];
  const bytes = Buffer.from(JSON.stringify(json));
  if (DRY) {
    const out = outPath(served.replace(/\.gltf$/, `.${tier}.gltf`), bytes, 'gltf');
    if (CHECK && !existsSync(out)) staleSource(served);
    map[tier][served] = existsSync(out) ? pub(out) : `(new) ${served}`; continue;
  }
  const out = outPath(served.replace(/\.gltf$/, `.${tier}.gltf`), bytes, 'gltf');
  mkdirSync(dirname(out), { recursive: true });
  if (!existsSync(out)) writeFileSync(out, bytes);
  map[tier][served] = pub(out);
}

// G187 cuts 2 + 3: the coats and the viewmodel sets (their own scripts own their encode; this table and the pruning below keep them)
for (const baked of BAKED) for (const tier of ['phone', 'desktop']) if (TIERS.has(tier)) for (const [served, out] of Object.entries(baked[tier] ?? {})) {
  if (!existsSync(abs(out))) { if (CHECK) staleSource(served); continue; }
  map[tier][served] = out;
}

// ── outputs ──
let stale = 0;
if (!DRY && ONLY === '') {
  // drop the cache entries nothing asked for, and every file under /assets/gpu no mapping names
  for (const k of Object.keys(cache)) if (!usedKeys.has(k)) delete cache[k];
  const live = new Set([...Object.values(map.phone), ...Object.values(map.desktop)]);
  for (const f of walk(OUT)) if (!live.has(pub(f))) { rmSync(f); stale++; }
}
if (!DRY) {
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 1)}\n`);
  if (ONLY === '') {
    writeKtx2Tables(ROOT, map, SHARDS);
  }
}
for (const f of new Set(Object.values(map.phone).concat(Object.values(map.desktop)))) if (!f.startsWith('(new)') && existsSync(abs(f))) bytesOut += statSync(abs(f)).size;
rmSync(TMP, { recursive: true, force: true });
console.log(`bake-ktx2: ${encoded} encoded, ${reused} reused, ${stale} stale removed · phone ${Object.keys(map.phone).length} + desktop ${Object.keys(map.desktop).length} mapped · ${(bytesOut / 1048576).toFixed(1)} MB of KTX2 (the files they stand in for: ${(bytesIn / 1048576).toFixed(1)} MB, counted per tier)`);
if (skipped.length > 0) console.log(`  not baked (${skipped.length}):\n    ${skipped.slice(0, 40).join('\n    ')}${skipped.length > 40 ? '\n    …' : ''}`);
if (CHECK && missing.size > 0) { console.log(`bake-ktx2: tools node ${process.version}; basisu ${ENCODER}; ${execFileSync('magick', ['-version']).toString().split('\n')[0]}`); process.exitCode = 1; }
