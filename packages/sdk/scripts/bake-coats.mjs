#!/usr/bin/env node
// bake-coats.mjs — a shard's creature coats, painted offline (G187 cut 2 for Pine Hollow; SHARD-PLATFORM G226 for Nalati,
// E435). The coats are painted on the CPU from each rigged hull's atlas by the shard's own coat painter, which costs the
// entry hundreds of milliseconds to seconds (and which a KTX2 hull cannot do at all: its atlas has no pixels). So the game
// paints them here, offline, and the runtime loads the result.
//
// Pine Hollow: generators/coatProducer.ts (through src/shards/pine-hollow/bake/pineCoats.mjs) reads authored recipes and the committed
// rigged hulls through SDK Node readers. It installs no runtime registry and opens no page. The Pine program paints the
// same lossless pages as product files (generators/coatPages.ts).
// Nalati: generators/coats.ts (through scripts/bake/nalatiCoats.mjs) reads the committed rigged hulls and the
// species palettes in plain Node, painting with the page's former canvas painter and its canvas rounding, exactly.
// Either way every hull variant whose coat repaints the atlas is handed back as a lossless PNG keyed by its table name. Each is encoded with bake-ktx2.mjs's colour class
// (UASTC LDR 4×4 level 2, sRGB, full box-filtered mips, zstd 20), unflipped (glTF orientation, as the hull's own map),
// content-addressed under the shard's `ktx2` folder. The shard's table (`table`) maps, per tier, each coat's table name to
// its KTX2; bake-ktx2.mjs merges it into the shard's KTX2 table and keeps the files.
//   pine-hollow        the table name is a name, not a file (species/rigs.ts pineCoatUrl): only the KTX2 path reads coats;
//   nalati-grasslands  the table name is a real file (species/rigs.ts nalatiCoatUrl): the coat stored LOSSLESS (WebP,
//                      the canvas's exact pixels, unflipped) for the images path, its KTX2 stand-in for the KTX2 path.
// Rerun whenever a coat, a palette or a hull changes, then rerun bake-ktx2.mjs.
//
//   node scripts/bake-coats.mjs --shard=<pine-hollow|nalati-grasslands> [--tiers=phone,desktop]
//   node --import ./scripts/bake-loader.mjs scripts/bake-ktx2.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { readCoatFiles } from './bake/coatFiles.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PUB = resolve(ROOT, 'public');
/** per shard: the KTX2 folder, the table, and (Nalati) the folder of the lossless images the table names */
const SHARDS = {
  'pine-hollow': { ktx2: 'assets/gpu/pine-hollow/creatures/coats', table: 'src/shards/pine-hollow/generators/bake-pine-coats.json', images: null, doc: 'G187 cut 2' },
  'nalati-grasslands': { ktx2: 'assets/gpu/nalati/models/coats', table: 'src/shards/nalati-grasslands/generators/bake-nalati-coats.json', images: 'assets/nalati/models/coats', doc: 'SHARD-PLATFORM G226' },
};
const argv = process.argv.slice(2);
const slug = argv.find((a) => a.startsWith('--shard='))?.slice(8) ?? '';
const tiers = (argv.find((a) => a.startsWith('--tiers='))?.slice(8) ?? 'phone,desktop').split(',');
const shard = Object.hasOwn(SHARDS, slug) ? SHARDS[/** @type {keyof typeof SHARDS} */ (slug)] : undefined;
if (!shard || tiers.some((t) => !['phone', 'desktop'].includes(t))) throw new Error(`Usage: bake-coats.mjs --shard=<${Object.keys(SHARDS).join('|')}> [--tiers=phone,desktop]`);
const OUT = resolve(PUB, shard.ktx2);
const IMAGES = shard.images === null ? null : resolve(PUB, shard.images);
const TABLE = resolve(ROOT, shard.table);
const ENCODER = /v[\d.]+/.exec(execFileSync('basisu', ['-version']).toString())?.[0] ?? '?';
/** bake-ktx2.mjs COMMON + CLASS.color */
const FLAGS = ['-ktx2', '-mipmap', '-mip_filter', 'box', '-max_threads', '4', '-uastc', '-uastc_level', '2', '-srgb', '-ktx2_zstandard_level', '20'];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const pub = (abs) => `/${relative(PUB, abs).split('\\').join('/')}`;

const prior = existsSync(TABLE) ? JSON.parse(readFileSync(TABLE, 'utf8')) : {};
const cache = prior.cache ?? {};
const table = { phone: prior.phone ?? {}, desktop: prior.desktop ?? {} };
const used = new Set();
mkdirSync(resolve(ROOT, 'tmp'), { recursive: true });
const TMP = mkdtempSync(resolve(ROOT, 'tmp/bake-coats-'));
try {
  mkdirSync(OUT, { recursive: true });
  if (IMAGES !== null) mkdirSync(IMAGES, { recursive: true });
  let encoded = 0, reused = 0;

  for (const tier of tiers) {
    const tex = 'img';
    const list = join(TMP, `${tier}.json`);
    execFileSync(process.execPath, ['--import', './scripts/bake-loader.mjs', slug === 'pine-hollow' ? 'src/shards/pine-hollow/bake/pineCoats.mjs' : 'scripts/bake/nalatiCoats.mjs', tier, list], { cwd: ROOT, stdio: 'inherit' });
    const sources = readCoatFiles(list);
    if (sources.length === 0) throw new Error(`${tier}: no coats (texture mode ${tex})`);
    const next = {};
    for (const s of sources) {
      const png = s.png;
      if (IMAGES !== null) {
        // the images path's file: the canvas's exact pixels (lossless, -exact keeps every RGB)
        const file = join(PUB, s.url);
        if (!file.startsWith(`${IMAGES}/`)) throw new Error(`${s.url}: not under /${shard.images}`);
        const src = join(TMP, 'lossless.png');
        writeFileSync(src, png);
        mkdirSync(dirname(file), { recursive: true });
        execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', '-metadata', 'none', src, '-o', file]);
      }
      const key = sha(`${sha(png)}|${ENCODER}|${FLAGS.join(' ')}`);
      used.add(key);
      let out = cache[key];
      if (out && existsSync(join(PUB, out))) reused++;
      else {
        const src = join(TMP, `${encoded}.png`), dst = join(TMP, `${encoded}.ktx2`);
        writeFileSync(src, png);
        execFileSync('basisu', [...FLAGS, src, '-output_file', dst], { stdio: ['ignore', 'ignore', 'pipe'] });
        const bytes = readFileSync(dst);
        const stem = s.url.slice(s.url.lastIndexOf('/') + 1).replace(/\.(png|webp)$/u, '');
        const file = join(OUT, `${stem}-${sha(bytes).slice(0, 8)}.ktx2`);
        writeFileSync(file, bytes);
        out = pub(file); cache[key] = out; encoded++;
      }
      next[s.url] = out;
    }
    table[tier] = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    console.log(`bake-coats: ${slug} ${tier} ${sources.length} coats (texture mode ${tex})`);
  }

  for (const k of Object.keys(cache)) if (!used.has(k) && !Object.values(table).some((t) => Object.values(t).includes(cache[k]))) delete cache[k];
  const live = new Set([...Object.values(table.phone), ...Object.values(table.desktop)]);
  for (const f of readdirSync(OUT)) if (!live.has(pub(join(OUT, f)))) rmSync(join(OUT, f));
  if (IMAGES !== null) {
    const named = new Set([...Object.keys(table.phone), ...Object.keys(table.desktop)]);
    for (const f of readdirSync(IMAGES)) if (!named.has(pub(join(IMAGES, f)))) rmSync(join(IMAGES, f));
  }
  writeFileSync(TABLE, `${JSON.stringify({ $doc: `${shard.doc}: written by scripts/bake-coats.mjs --shard=${slug} (per tier: coat table name -> KTX2; cache: PNG+settings hash -> KTX2); merged into the shard's KTX2 table by scripts/bake-ktx2.mjs`, phone: table.phone, desktop: table.desktop, cache }, null, 1)}\n`);
  console.log(`bake-coats: ${encoded} encoded, ${reused} reused · ${live.size} files`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
