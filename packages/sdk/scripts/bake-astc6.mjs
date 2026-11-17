#!/usr/bin/env node
// bake-astc6.mjs — Pine Hollow's phone textures as ASTC 6×6 (G180 B2, Jake E450: "ASTC 6×6 instead of 4×4"), the
// Pine memory trim's texture cut. 6×6 is 16/36 of 4×4's GPU bytes (3.56 bits a texel instead of 8).
//
// What: every UASTC (4×4) KTX2 a phone boot of Pine Hollow fetches (scripts/bake-astc6.list.json: the /assets/gpu URLs
// one boot fetched, recorded with --record), re-encoded from the same source bake-ktx2.mjs used, at the 4×4 file's own
// size, as standard ASTC LDR 6×6 (basisu -ldr_6x6, Zstandard-supercompressed). The ETC1S data planes (ARM / ORM: ETC2 on
// the phone, ½ byte a texel, already below 6×6's 0.89) stay as they are. GLBs keep their geometry bytes: their colour /
// normal images become 6×6, their data images ETC1S as before. A .gltf prop is rewritten to point at its 6×6 textures.
//
// The files are raw ASTC, not Basis: they are sampled only where the GPU has ASTC (the phone tier: every iPhone; three's
// KTX2Loader uploads them as RGBA_ASTC_6x6 without a transcode). The desktop keeps bake-ktx2's set.
//
// Output: public/assets/pine-hollow/astc6/<the 4×4 file's path under /assets/gpu>-<sha256[:8]>.{ktx2,glb,gltf} (Pine's own
// folder, outside /assets/gpu, which bake-ktx2.mjs owns and prunes) and src/shards/pine-hollow/data/astc6.generated.json:
// served URL → 6×6 stand-in, the overlay src/shards/pine-hollow/runtime/boot/gpuTable.ts lays over the phone table when the trim
// is on. Content-addressed and cached (scripts/bake-astc6.cache.json): a rerun encodes only what changed.
//
//   node --import ./scripts/bake-loader.mjs scripts/bake-astc6.mjs [--shard=<slug>] [--jobs=6] [--force]
//
// S4 on (SHARD-SIZE-PLAN): another shard's phone set the same way. --shard names a row of SHARDS: its overlay goes to
// public/assets/<folder>/astc6/, which its programs read as the table, its list is every UASTC file of its own
// phone table, and its cache is its own. With no --shard this is Pine's bake, unchanged.
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { glbBytes, imageBytes, readGlb } from './astc6-phone-cap.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PUB = resolve(ROOT, 'public');
const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
/** The shards with a phone overlay. `noFlip`: paths written in glTF orientation (a coat is a hull's own map). */
const SHARDS = {
  'pine-hollow': { folder: 'pine-hollow', list: true, cap: true, noFlip: [] },
  'nalati-grasslands': { folder: 'nalati', list: false, cap: false, atlases: true, noFlip: ['/models/coats/'] },
  // Sky's rigs stay: each row names a product file (generators/rigAssetSources.ts).
  'far-reach': { folder: 'far-reach', list: false, cap: false, glbs: true, skip: /\/rigs\//, noFlip: [] },
};
const SLUG = flag('shard', 'pine-hollow'), SHARD = SHARDS[SLUG];
if (SHARD === undefined) throw new Error(`bake-astc6: no overlay row for ${SLUG}`);
const OUT = resolve(PUB, `assets/${SHARD.folder}/astc6`);
const LIST_FILE = resolve(ROOT, 'scripts/bake-astc6.list.json');
const CACHE_FILE = resolve(ROOT, SLUG === 'pine-hollow' ? 'scripts/bake-astc6.cache.json' : `scripts/bake-astc6.${SLUG}.cache.json`);
const TABLE_FILE = resolve(ROOT, `src/shards/${SLUG}/data/astc6.generated.json`);
const JOBS = Number(flag('jobs', '6'));
const FORCE = argv.includes('--force');

async function execFile(cmd, args) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += String(d); });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`${cmd} exited ${code}: ${err.slice(-400)}`);
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const pub = (p) => `/${relative(PUB, p).split('\\').join('/')}`;
const abs = (p) => join(PUB, p);
const ENCODER = /v[\d.]+/.exec(execFileSync('basisu', ['-version']).toString())?.[0] ?? '?';
const COMMON = ['-ktx2', '-mipmap', '-mip_filter', 'box', '-max_threads', '2'];
/** bake-ktx2.mjs's classes, with 6×6 for the three UASTC ones (effort 4 of 10: one notch above basisu's default) */
const CLASS = {
  color: ['-ldr_6x6', '-effort', '4', '-srgb'],
  normal: ['-ldr_6x6', '-effort', '4', '-normal_map'],
  linear: ['-ldr_6x6', '-effort', '4', '-linear'],
  data: ['-etc1s', '-q', '255', '-linear'],
};
/** bake-ktx2.mjs classOf */
function classOf(name) {
  const n = basename(name).toLowerCase();
  if (/(^|[_\-.])(lm|clouds)[_\-.]/.test(n)) return 'linear';
  if (/(^|[_\-.])(nor|nor_gl|normal|nrm)([_\-.]|$)/.test(n)) return 'normal';
  if (/(^|[_\-.])(arm|orm|ao|rough|roughness|metal|metalness|metallic)([_\-.]|$)/.test(n)) return 'data';
  return 'color';
}
/** a KTX2's header: size and supercompression (1 = BasisLZ, i.e. ETC1S) */
function ktx2Header(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32LE(20), h: b.readUInt32LE(24), scheme: b.readUInt32LE(44), vk: b.readUInt32LE(12) };
}

// ── the phone tables: served URL → 4×4 stand-in (the engine's and every shard's generated table) ──
function tableEntries(file) {
  const src = readFileSync(resolve(ROOT, file), 'utf8');
  const phone = src.slice(src.indexOf('"phone"'), src.indexOf('"desktop"'));
  return [...phone.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
}
const tables = ['src/client/engine/boot/ktx2.generated.ts', ...readdirSync(resolve(ROOT, 'src/shards')).map((s) => `src/shards/${s}/ktx2.generated.ts`)].filter((f) => existsSync(resolve(ROOT, f)));
/** 4×4 stand-in → the served URLs it stands in for */
const servedOf = new Map();
for (const t of tables) for (const [served, gpu] of tableEntries(t)) { const l = servedOf.get(gpu) ?? []; l.push(served); servedOf.set(gpu, l); }

const fetched = SHARD.list ? JSON.parse(readFileSync(LIST_FILE, 'utf8')).phone
  : [...new Set(tableEntries(`src/shards/${SLUG}/ktx2.generated.ts`).map(([, gpu]) => gpu).filter((url) => (SHARD.glbs === true ? /\.(?:ktx2|glb)$/u : /\.ktx2$/u).test(url) && SHARD.skip?.test(url) !== true))];
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const usedKeys = new Set();
const TMP = join(tmpdir(), `bake-astc6-${process.pid}`);
mkdirSync(TMP, { recursive: true });
let tmpN = 0, encoded = 0, reused = 0;

async function encode(srcFile, w, h, cls, flip) {
  const id = ++tmpN;
  const png = join(TMP, `${id}.png`), out = join(TMP, `${id}.ktx2`);
  const [sw, sh] = execFileSync('magick', ['identify', '-format', '%w %h\n', `${srcFile}[0]`]).toString().trim().split(/\s+/).map(Number);
  const alpha = execFileSync('magick', ['identify', '-format', '%[opaque]', `${srcFile}[0]`]).toString().trim().toLowerCase() === 'false';
  const resize = sw === w && sh === h ? [] : alpha ? ['-separate', '-resize', `${w}x${h}!`, '-combine'] : ['-resize', `${w}x${h}!`];
  await execFile('magick', [`${srcFile}[0]`, ...resize, '-strip', `PNG32:${png}`]);
  await execFile('basisu', [...COMMON, ...CLASS[cls], ...(flip ? ['-y_flip'] : []), png, '-output_file', out]);
  const bytes = readFileSync(out);
  rmSync(png); rmSync(out);
  return bytes;
}
function writeOut(gpuUrl, bytes, ext) {
  const rel = gpuUrl.replace(/^\/assets\/gpu\//, '');
  const stem = basename(rel).replace(/-[0-9a-f]{8}\.(ktx2|glb|gltf)$/, '');
  const out = join(OUT, dirname(rel), `${stem}-${sha(bytes).slice(0, 8)}.${ext}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  return pub(out);
}
/** bake-ktx2.mjs addImage's best source for a served image: the full-res original of a `_1k` / phone copy */
function sourceOf(served) {
  const file = abs(served.replace(/#layer$/, ''));
  if (file.endsWith('_1k.jpg') && existsSync(file.replace(/_1k\.jpg$/, '.jpg'))) return file.replace(/_1k\.jpg$/, '.jpg');
  const m = /^(.*)(\.phone|-phone)\.webp$/.exec(file);
  if (m) for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) if (existsSync(`${m[1]}${ext}`)) return `${m[1]}${ext}`;
  return file;
}
/** standalone images are Y-flipped at encode; glTF textures, layer twins and Driftwood's lightmaps are not (bake-ktx2.mjs) */
const NO_FLIP = ['/textures/', '/driftwood-blender/', ...SHARD.noFlip];
const flipOf = (served) => !served.endsWith('#layer') && !NO_FLIP.some((part) => served.includes(part));

const map = {};
async function cached(key, make) {
  usedKeys.add(key);
  const hit = cache[key];
  if (!FORCE && hit && (hit === 'none' || existsSync(abs(hit)))) { reused++; return hit === 'none' ? null : hit; }
  const out = await make();
  cache[key] = out ?? 'none';
  if (out) encoded++;
  return out;
}

// ── GLB helpers (bake-ktx2.mjs imageClasses, unchanged; readGlb / glbBytes live in astc6-phone-cap.mjs) ──
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
/** the GLB's embedded images re-encoded (colour / normal / linear → 6×6, data → ETC1S), at each 4×4 image's own size */
async function glbOut(src, gpuUrl) {
  const { json, bin } = readGlb(src);
  if (!(json.images?.length > 0)) return null;
  const four = readGlb(abs(gpuUrl));
  const classes = imageClasses(json);
  const swap = new Map();
  for (const [i, img] of json.images.entries()) {
    const tmp = join(TMP, `glb-${++tmpN}.${(img.mimeType ?? 'image/png').split('/')[1]}`);
    writeFileSync(tmp, imageBytes(json, bin, img.bufferView));
    const fourImg = four.json.images[i];
    const k4 = join(TMP, `glb4-${tmpN}.ktx2`);
    writeFileSync(k4, imageBytes(four.json, four.bin, fourImg.bufferView));
    const { w, h } = ktx2Header(k4);
    rmSync(k4);
    swap.set(img.bufferView, await encode(tmp, w, h, classes.get(i) ?? 'color', false));
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
  return writeOut(gpuUrl, glbBytes(json, bin, swap), 'glb');
}

// ── the jobs ──
const imageTasks = [], glbTasks = [], gltfJobs = [];
for (const gpuUrl of fetched) {
  const served = servedOf.get(gpuUrl);
  if (!served || !existsSync(abs(gpuUrl))) { console.log(`bake-astc6: skip ${gpuUrl} (no table entry / file)`); continue; }
  if (gpuUrl.endsWith('.ktx2')) {
    const { w, h, scheme } = ktx2Header(abs(gpuUrl));
    if (scheme === 1) continue; // ETC1S: stays
    const s = served[0], cls = classOf(s.replace(/#layer$/, '')), flip = flipOf(s), src = sourceOf(s);
    imageTasks.push(async () => {
      const key = sha(`${sha(readFileSync(src))}|${w}x${h}|${cls}|${flip ? 'flip' : ''}|${ENCODER}|${[...COMMON, ...CLASS[cls]].join(' ')}`);
      const out = await cached(key, async () => writeOut(gpuUrl, await encode(src, w, h, cls, flip), 'ktx2'));
      if (out) for (const x of served) map[x] = out;
    });
  } else if (gpuUrl.endsWith('.glb')) {
    const s = served[0], src = abs(s);
    glbTasks.push(async () => {
      const key = sha(`${sha(readFileSync(src))}|${sha(readFileSync(abs(gpuUrl)))}|glb6|${ENCODER}|${JSON.stringify(CLASS)}|${COMMON.join(' ')}`);
      const out = await cached(key, () => glbOut(src, gpuUrl));
      if (out) for (const x of served) map[x] = out;
    });
  } else if (gpuUrl.endsWith('.gltf')) gltfJobs.push([served, gpuUrl]);
}
async function runPool(tasks) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
}
console.log(`bake-astc6: ${ENCODER} · ${imageTasks.length} images · ${glbTasks.length} GLBs · ${gltfJobs.length} glTFs`);
await runPool([...glbTasks, ...imageTasks]);

// .gltf: the 4×4 .gltf with each image that has a 6×6 twin pointed at it (relative to the ORIGINAL .gltf's folder, as
// bake-ktx2.mjs writes them: GLTFLoader resolves against the URL it was asked for)
for (const [served, gpuUrl] of gltfJobs) {
  const json = JSON.parse(readFileSync(abs(gpuUrl), 'utf8'));
  const dir = dirname(abs(served[0]));
  let changed = false;
  for (const img of json.images ?? []) {
    const k4 = pub(resolve(dir, decodeURI(img.uri)));
    const servedImg = servedOf.get(k4)?.[0];
    const six = servedImg === undefined ? undefined : map[servedImg];
    if (six === undefined) continue;
    img.uri = relative(dir, abs(six)).split('\\').join('/');
    changed = true;
  }
  if (!changed) continue;
  const out = writeOut(gpuUrl, Buffer.from(JSON.stringify(json)), 'gltf');
  for (const x of served) map[x] = out;
}

// ── Nalati's painted atlases: the phone's 512² RGBA stays a phone file, as UASTC with its mip chain. Not raw 6×6: an atlas
// is a product blob with no image route, so a phone-tier GPU with no ASTC must still transcode it. ──
const atlasFiles = [];
if (SHARD.atlases) {
  const atlasOut = join(OUT, 'atlas'), models = join(PUB, 'assets/nalati/models');
  mkdirSync(atlasOut, { recursive: true });
  await runPool(readdirSync(models).filter((name) => name.endsWith('.phone.glb')).sort().map((name) => async () => {
    const { json, bin } = readGlb(readFileSync(join(models, name)));
    if (!(json.images?.length === 1)) return;
    const stem = name.replace(/\.glb$/, ''), image = imageBytes(json, bin, json.images[0].bufferView), to = join(atlasOut, `${stem}.ktx2`);
    atlasFiles.push(to);
    const flags = ['-uastc', '-uastc_level', '2', '-srgb', '-ktx2_zstandard_level', '20'];
    await cached(sha(`${sha(image)}|atlas|${ENCODER}|${[...COMMON, ...flags].join(' ')}`), async () => {
      const webp = join(TMP, `${stem}.webp`), png = join(TMP, `${stem}.png`);
      writeFileSync(webp, image);
      await execFile('magick', [webp, '-strip', `PNG32:${png}`]);
      await execFile('basisu', [...COMMON, ...flags, png, '-output_file', to]);
      rmSync(webp); rmSync(png);
      return pub(to);
    });
  }));
}

// ── outputs: prune what nothing names, the cache and the overlay table ──
for (const k of Object.keys(cache)) if (!usedKeys.has(k)) delete cache[k];
const live = new Set([...Object.values(map), ...atlasFiles.map(pub)]);
const walk = (d, out = []) => { if (!existsSync(d)) return out; for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
let stale = 0;
for (const f of walk(OUT)) if (!live.has(pub(f))) { rmSync(f); stale++; }
writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 1)}\n`);
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
// Only Pine keeps a table in the source: another shard's programs read the overlay off these files (phoneOverlayRows).
if (SHARD.list) writeFileSync(TABLE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
rmSync(TMP, { recursive: true, force: true });
let six = 0; for (const f of live) six += statSync(abs(f)).size;
console.log(`bake-astc6: ${encoded} encoded, ${reused} reused, ${stale} stale removed · ${Object.keys(map).length} served URLs → ${live.size} files, ${(six / 1048576).toFixed(1)} MB`);
// S4: the phone's 512 sets are these files less their top mip; a later bake would otherwise bring the 1024s back.
if (SHARD.cap) execFileSync(process.execPath, [resolve(ROOT, 'scripts/astc6-phone-cap.mjs')], { stdio: 'inherit' });
