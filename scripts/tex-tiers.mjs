// Phone-tier image files (project/archive/2026-09-22-load-perf.md §P1, ask P5 "cold bytes"). Idempotent; needs ImageMagick + cwebp.
// Commit the outputs: Vercel's builder has neither tool, so nothing here runs at build time.
//
// 1. Poly Haven sets: for every public/assets/tex/<id>/{diffuse,nor_gl,arm}.jpg wider than 1024 px or heavier than
//    350 KB, write <kind>_1k.jpg beside it (≤ 1024², q82). The phone tier requests these (src/client/engine/core/assets.ts texUrl)
//    instead of downloading a 2048² file it would shrink anyway.
// 2. Model textures: Poly Haven ships the glTF props' 1k JPEGs at q99 — three times the bytes of q85 for no
//    difference anyone can see at 1k. Re-encoded IN PLACE (both tiers) at q85, normal maps with 4:4:4 chroma (their
//    R and G are independent data, 4:2:0 would smear them). Same for the JPEGs embedded in the `<id>_lod.glb`
//    props (scripts/simplify-models.mjs copies them in at q99). A file already ≤ q90 is left alone.
// 3. `.phone.webp` copies, picked by `tierUrl()` (src/client/engine/boot/bytes.ts) on the phone tier — for fetchImage, and for
//    three's loaders through DefaultLoadingManager's URL modifier (glTF textures). The boot manifest declares
//    through the same function, so declared bytes = downloaded bytes. WebP q75 (-sharp_yuv) is ~20–25 % smaller
//    than the q82 JPEG it replaces AND measures lower error against the source (forest_ground_04: 0.024 vs 0.032); PNG alpha stays lossless (-exact keeps the RGB under transparent
//    texels, which bilinear filtering and the mips still read). Capped at 1024 px (the phone's maxTexture), AO /
//    roughness / metalness planes of the Poly Haven sets and props at 512 px. Encoded from the best source there
//    is (the original 2k map, not its q82 _1k copy). A copy that is not ≥ 15 % smaller is not kept.
// 4. `<id>_lod.phone.glb`: the LOD props with their embedded JPEGs as WebP (EXT_texture_webp, which three's
//    GLTFLoader reads), ARM planes at 512 px.
//    Content-addressed: encode only missing source/settings keys, verify cached output hashes with --check.
//    --seed-cache trusts today's committed copies and writes only scripts/tex-tiers.cache.json.
import { readdirSync, existsSync, statSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { byteWriter, outputHash, jsonBytes } from '@wildshard/engine/scripts/bake-output.mjs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { textureTierJobs } from '@wildshard/engine/scripts/texture-inputs.mjs';

const ROOT = 'public/assets/tex';
let made = 0;
const identify = (fmt, file) => execFileSync('magick', ['identify', '-format', fmt, file]).toString().trim();
const check = process.argv.includes('--check');
const seed = process.argv.includes('--seed-cache');
if (check && seed) throw new Error('tex-tiers: choose --check or --seed-cache');
const output = byteWriter(check, 'tex-tiers');
const CACHE = 'scripts/tex-tiers.cache.json';
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const stale = new Set();
const want = new Set();
let seeded = 0, encoded = 0, reused = 0;
const keyOf = (bytes, settings) => outputHash(Buffer.concat([Buffer.from(JSON.stringify(settings)), bytes]));

/** Seeding reads only. Every cache hit verifies the committed output bytes; missing keys alone encode. */
function copy(src, out, settings, make, inPlace = false) {
  const source = readFileSync(src), key = keyOf(source, settings), hit = cache[key];
  if (seed) {
    if (hit === undefined) { cache[key] = existsSync(out) ? outputHash(readFileSync(out)) : 'none'; seeded++; }
    if (existsSync(out)) want.add(out);
    return;
  }
  if (hit !== undefined) {
    if (hit === 'none') { if (existsSync(out)) stale.add(out); }
    else if (!existsSync(out) || outputHash(readFileSync(out)) !== hit) stale.add(out);
    else want.add(out);
    reused++;
    return;
  }
  if (check) { stale.add(out); return; }
  const bytes = make(source);
  encoded++;
  if (bytes === null) { cache[key] = 'none'; output.remove(out); }
  else {
    cache[key] = outputHash(bytes); output.put(out, bytes); want.add(out);
    if (inPlace) cache[keyOf(bytes, settings)] = outputHash(bytes);
  }
}
const scratch = mkdtempSync(join(tmpdir(), 'tex-tiers-'));
let scratchId = 0;
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

// ── 1. Poly Haven set _1k siblings ──
const textureFiles = [];
const textureWalk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) textureWalk(path); else textureFiles.push(path); } };
textureWalk(ROOT);
const tierJobs = textureTierJobs(textureFiles);
for (const { source: src, output: out } of tierJobs.filter((job) => job.kind === 'resize')) {
  copy(src, out, { format: 'jpg', max: 1024, quality: 82, strip: true, byteLimit: 350 * 1024 }, () => {
    if (Number(identify('%w', src)) <= 1024 && statSync(src).size < 350 * 1024) return null;
    made++;
    return execFileSync('magick', [src, '-resize', '1024x1024', '-quality', '82', '-strip', 'jpg:-'], { maxBuffer: 64 << 20 });
  });
}

// ── 2. model textures, in place ──
const isNormal = (name) => /nor(_gl)?/i.test(name);
const jpegArgs = (name) => ['-quality', '85', ...(isNormal(name) ? ['-sampling-factor', '1x1'] : []), '-strip'];
/** q85 re-encode of a JPEG buffer, or null when it is already ≤ q90 (idempotence). */
function squeeze(buf, name) {
  const q = Number(execFileSync('magick', ['identify', '-format', '%Q', 'jpg:-'], { input: buf }).toString().trim());
  if (!(q > 90)) return null;
  return execFileSync('magick', ['jpg:-', ...jpegArgs(name), 'jpg:-'], { input: buf, maxBuffer: 64 << 20 });
}
let squeezed = 0, saved = 0;
const MODELS = 'public/assets/models';
for (const id of readdirSync(MODELS)) {
  const texDir = join(MODELS, id, 'textures');
  if (existsSync(texDir)) for (const f of readdirSync(texDir).filter((x) => x.endsWith('.jpg'))) {
    const p = join(texDir, f), buf = readFileSync(p);
    copy(p, p, { format: 'jpg', args: jpegArgs(f), squeezeAbove: 90 }, () => {
      const out = squeeze(buf, f);
      if (out && out.length < buf.length) { squeezed++; saved += buf.length - out.length; return out; }
      return buf;
    }, true);
  }
  const glb = join(MODELS, id, `${id}_lod.glb`);
  if (existsSync(glb)) copy(glb, glb, { format: 'glb', quality: 85, squeezeAbove: 90, normalSampling: '1x1', alignment: 4 }, () => squeezeGlb(glb), true);
}

/**
 * Re-encode a GLB's embedded JPEGs: rewrite the BIN chunk with each image's bufferView replaced and every
 * bufferView re-packed (4-byte aligned) in its original order. Returns the output bytes.
 */
function squeezeGlb(path) {
  const { json, views, size } = readGlb(path);
  let changed = false;
  for (const img of json.images ?? []) {
    if (img.mimeType !== 'image/jpeg' || img.bufferView === undefined) continue;
    const out = squeeze(views[img.bufferView], img.name ?? '');
    if (out && out.length < views[img.bufferView].length) { views[img.bufferView] = out; changed = true; }
  }
  if (!changed) return readFileSync(path);
  const bytes = glbBytes(json, views);
  squeezed++; saved += size - bytes.length;
  return bytes;
}

function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  const views = json.bufferViews.map((v) => bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
  return { json, views, size: b.length };
}

/** Pack a GLB whose bufferViews are `views`, re-packed 4-byte aligned in order. */
function glbBytes(json, views) {
  const parts = []; let off = 0;
  json.bufferViews.forEach((v, i) => {
    v.byteOffset = off; v.byteLength = views[i].length;
    parts.push(views[i]); off += views[i].length;
    const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  });
  json.buffers[0].byteLength = off;
  const newBin = Buffer.concat(parts);
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const total = 12 + 8 + jsonBuf.length + 8 + newBin.length; header.writeUInt32LE(total, 8);
  return Buffer.concat([header, jh, jsonBuf, bh, newBin]);
}

// ── 3. .phone.webp siblings ──
const PHONE_MAX = 1024, ARM_MAX = 512;
/** AO / roughness / metalness planes: low-frequency, the phone gets them at half resolution */
const isArm = (p) => /(^|[_/-])(arm|rough|roughness|metal|metallic)([_.-]|$)/i.test(p.split('/').pop() ?? p);
/**
 * [file the other tiers download, best source to encode from, max px] for every image the phone fetches: baked planes (cards, fur, clouds, planet),
 * the twig atlas, every Poly Haven set (encoded from the ORIGINAL map, not the q82 _1k copy — one lossy pass, not
 * two) and the glTF props' textures (through the loaders' URL modifier, src/client/engine/boot/bytes.ts).
 */
function phoneJobs() {
  const jobs = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(png|jpg)$/.test(n) && !n.includes('.phone.')) jobs.push([p, p, PHONE_MAX]); } };
  walk('public/assets/baked');
  for (const { source, served, max } of textureTierJobs([...new Set([...textureFiles, ...tierJobs.map((job) => job.output)])].filter(existsSync)).filter((job) => job.kind === 'phone')) jobs.push([served, source, max]);
  for (const id of readdirSync(MODELS)) {
    const t = join(MODELS, id, 'textures');
    if (existsSync(t)) for (const n of readdirSync(t)) if (n.endsWith('.jpg') && !n.includes('.phone.')) jobs.push([join(t, n), join(t, n), isArm(n) ? ARM_MAX : PHONE_MAX]);
  }
  return jobs;
}
function phoneName(p) { return p.replace(/\.(png|jpg)$/, '.phone.webp'); }

/** WebP of `src` (a file or a JPEG buffer) capped at `max` px. PNG alpha stays lossless; RGB under it is kept (-exact). */
function webp(src, max, out) {
  const tmp = `${out}.tmp.png`;
  const input = Buffer.isBuffer(src) ? ['jpg:-'] : [src];
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', ...input], Buffer.isBuffer(src) ? { input: src } : {}).toString().trim().split(' ').map(Number);
  const resize = Math.max(w, h) > max ? ['-separate', '-resize', `${max}x${max}`, '-combine'] : []; // per channel: the default alpha-weighted resize blackens the RGB under transparent texels
  execFileSync('magick', [...input, ...resize, '-strip', tmp], Buffer.isBuffer(src) ? { input: src } : {});
  execFileSync('cwebp', ['-quiet', '-q', '75', '-sharp_yuv', '-alpha_q', '100', '-exact', '-m', '6', tmp, '-o', out]);
  rmSync(tmp);
}

let phoneMade = 0, phoneSkipped = 0;
for (const [served, src, max] of phoneJobs()) {
  const out = phoneName(served);
  copy(src, out, { format: 'webp', max, quality: 75, sharpYuv: true, alphaQuality: 100, exact: true, method: 6, resize: 'separate-combine', minSaving: 0.15, servedHash: outputHash(readFileSync(served)) }, () => {
    const temp = join(scratch, `${++scratchId}.webp`);
    webp(src, max, temp);
    const bytes = readFileSync(temp); rmSync(temp);
    if (bytes.length > statSync(served).size * 0.85) { phoneSkipped++; return null; }
    phoneMade++;
    return bytes;
  });
}

// ── 4. <id>_lod.phone.glb: the props' embedded JPEGs as WebP (EXT_texture_webp), ARM planes at half resolution ──
for (const id of readdirSync(MODELS)) {
  const glb = join(MODELS, id, `${id}_lod.glb`), out = join(MODELS, id, `${id}_lod.phone.glb`);
  if (!existsSync(glb)) continue;
  copy(glb, out, { format: 'glb-webp', max: PHONE_MAX, armMax: ARM_MAX, quality: 75, sharpYuv: true, alphaQuality: 100, exact: true, method: 6, resize: 'separate-combine', alignment: 4 }, () => {
    const { json, views } = readGlb(glb);
    const tmp = join(scratch, `${++scratchId}.webp`);
    (json.images ?? []).forEach((img, i) => {
      if (img.mimeType !== 'image/jpeg' || img.bufferView === undefined) return;
      webp(views[img.bufferView], isArm(img.name ?? '') ? ARM_MAX : PHONE_MAX, tmp);
      views[img.bufferView] = readFileSync(tmp); rmSync(tmp);
      img.mimeType = 'image/webp';
      for (const t of json.textures ?? []) if (t.source === i) { t.extensions = { ...t.extensions, EXT_texture_webp: { source: i } }; delete t.source; }
    });
    for (const k of ['extensionsUsed', 'extensionsRequired']) json[k] = [...new Set([...(json[k] ?? []), 'EXT_texture_webp'])];
    phoneMade++;
    return glbBytes(json, views);
  });
}
// Other pipelines own Nalati rigs, shard-specific phone textures and hand-authored model variants.
// Sweep only the folders/families this script generates; never remove another pipeline's copies.
const sweep = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) sweep(p); else if (n.includes('.phone.') && !want.has(p) && !stale.has(p)) output.remove(p); } };
if (!seed) {
  sweep('public/assets/baked');
  sweep(ROOT);
  for (const id of readdirSync(MODELS)) {
    const out = join(MODELS, id, `${id}_lod.phone.glb`);
    if (existsSync(out) && !want.has(out) && !stale.has(out)) output.remove(out);
    const tex = join(MODELS, id, 'textures');
    if (existsSync(tex)) sweep(tex);
  }
}
for (const path of stale) console.log(`tex-tiers: STALE ${path} (source/settings cache entry or output hash missing/mismatched)`);
if (stale.size > 0) process.exitCode = 1;
if (!check) output.put(CACHE, jsonBytes(Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)))));
console.log(`tex-tiers: ${made} _1k encoded · ${squeezed} model files squeezed (−${(saved / 1048576).toFixed(1)} MB) · ${phoneMade} phone copies encoded, ${phoneSkipped} not kept`);
output.finish();
console.log(`tex-tiers: ${encoded} encoded, ${reused} reused, ${seeded} seeded${seed ? ' (cache only; assets untouched)' : ''}`);
