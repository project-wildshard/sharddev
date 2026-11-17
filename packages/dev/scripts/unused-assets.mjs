#!/usr/bin/env node
// unused-assets.mjs — E161 ("cull and GC stale / unused stuff"): every file under public/ that no build path references.
//
// A file is USED when any of these reach it:
//   1. a shard's boot, per tier (phone, desktop): src/client/engine/boot/manifest.ts `chunkFiles` for every shard — the packs are cut
//      from these same files (scripts/bake-packs.mjs) — plus Rapier's WASM and the navmesh;
//   2. the audio manifests: every file a public/assets/music/*/music.json or sfx/*/sfx.json names (+ the manifests);
//   3. a used .gltf's own buffers / images;
//   4. a sibling of a used file that differs only by its tier / format suffix (`x.phone.webp`, `x.ktx2`, `x.phone.glb`);
//   5. the game's code and pages naming it: src/ (not the *.generated.ts tables, which list every file),
//      index.html, public/manifest.webmanifest, vite.config.ts, vite/ — by its path, or by its file stem together with its
//      folder's name (`/assets/lut/${slug}.bin`, `${DIR}${kind}.gen.glb` build paths from pieces).
//      A folder the code builds names inside counts whole: its path is named (`'/assets/pine-hollow/journal'` + `${id}.webp`),
//      or it is a texture set / model folder whose id is named (`pbrUrls('stone_wall')` → /assets/tex/stone_wall/*).
// A file only scripts/ or test/ name is DEV-ONLY: listed, kept.
// A file (or its folder) a doc under docs/ names is DOCUMENTED — staged for a pass, not wired in yet: listed, kept.
// Everything else is UNUSED.
//
//   node scripts/unused-assets.mjs            the report (exit 0)
//   node scripts/unused-assets.mjs --delete   also delete the UNUSED files (then commit the deletions)
//   node scripts/unused-assets.mjs --warn     one warning line when there are unused files (the pre-push gate), exit 0
//   node scripts/unused-assets.mjs --json     the lists as JSON
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, posix, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const collect = argv.find((a) => a.startsWith('--collect='))?.slice(10);

// ── child mode: one tier's boot files; initialize its row explicitly before reading assets ──
if (collect) {
  const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
  const { initializeTier } = await import('@wildshard/engine/core/tier');
  await initializeTier(collect);
  const { SHARDS } = await imp('src/shards.generated.ts');
  const { playable } = await imp('src/client/game/shard/registry.ts');
  const PLAYABLE_SHARDS = SHARDS.filter(playable);
  const { prepareShardAssets } = await imp('src/client/game/shard/load.ts');
  const { registerGpuFiles } = await imp('src/client/engine/boot/gpuFiles.ts');
  await Promise.all(SHARDS.map((m) => prepareShardAssets(m, registerGpuFiles)));
  // Every authored GPU stand-in is shipped runtime data, even when this tier's default boots images.
  const { GPU_FILES: engineGpu } = await imp('src/client/engine/boot/ktx2.generated.ts');
  const { chunkFiles } = await imp('src/client/engine/boot/manifest.ts');
  const out = new Set();
  for (const def of PLAYABLE_SHARDS) for (const list of Object.values(chunkFiles(def))) for (const f of list) out.add(f);
  for (const url of Object.values(engineGpu[collect])) out.add(url);
  for (const def of SHARDS) if (def.ktx2) for (const url of Object.values((await def.ktx2()).GPU_FILES[collect])) out.add(url);
  process.stdout.write(JSON.stringify([...out]));
  process.exit(0);
}

// ── the files: tracked under public/, minus what every build regenerates (packs, Rapier's WASM: gitignored anyway) ──
const tracked = execFileSync('git', ['ls-files', '-z', 'public'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => existsSync(join(ROOT, f)) && !f.endsWith('.DS_Store'));
const pub = (f) => f.slice('public'.length); // public/assets/x → /assets/x
const files = tracked.map(pub);
const size = (p) => statSync(join(ROOT, 'public', p)).size;

const used = new Map(); // path → why
const use = (p, why) => { if (!used.has(p)) used.set(p, why); };

// 1. the boot, both tiers
for (const tier of ['phone', 'desktop']) {
  const json = execFileSync(process.execPath, ['--import', './scripts/bake-loader.mjs', 'scripts/unused-assets.mjs', `--collect=${tier}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  for (const f of JSON.parse(json)) use(f, `boot (${tier})`);
}
use('/assets/physics/rapier.wasm', 'boot (physics)');

// 2. the audio manifests
const AUDIO_RE = /\.(m4a|mp3|ogg|opus|wav|webm|flac)$/;
const namedIn = (v, out) => {
  if (typeof v === 'string') { if (AUDIO_RE.test(v) && !v.includes('/')) out.push(v); }
  else if (Array.isArray(v)) for (const x of v) namedIn(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) namedIn(x, out);
  return out;
};
for (const [kind, manifest] of [['music', 'music.json'], ['sfx', 'sfx.json']]) {
  const dir = join(ROOT, 'public/assets', kind);
  if (!existsSync(dir)) continue;
  for (const d of readdirSync(dir)) {
    const m = join(dir, d, manifest);
    if (!existsSync(m)) continue;
    use(`/assets/${kind}/${d}/${manifest}`, 'audio manifest');
    for (const f of namedIn(JSON.parse(readFileSync(m, 'utf8')), [])) use(`/assets/${kind}/${d}/${f}`, `${kind}/${d}/${manifest}`);
  }
}

// 5. the code and pages (dev corpus separately)
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (/\.(ts|tsx|js|mjs|cjs|css|html|json|glsl|py|sh|md|webmanifest)$/.test(e.name)) out.push(p);
  }
  return out;
};
const read = (ps) => ps.filter((p) => !p.endsWith('.generated.ts')).map((p) => readFileSync(p, 'utf8')).join('\n');
const game = read([
  ...walk(join(ROOT, 'src')),
  join(ROOT, 'index.html'), join(ROOT, 'public/manifest.webmanifest'), join(ROOT, 'vite.config.ts'), ...walk(join(ROOT, 'vite')),
].filter((p) => existsSync(p)));
const dev = read([...walk(join(ROOT, 'scripts')).filter((p) => !p.endsWith('unused-assets.mjs')), ...walk(join(ROOT, 'test'))]);
const tokenIn = (text, t) => t.length > 2 && new RegExp(`(^|[^\\w-])${t.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}([^\\w-]|$)`).test(text);
/** named by path, or by stem + folder (a path built from pieces) */
function named(text, p) {
  if (text.includes(p.slice(1)) || text.includes(p.replace(/\.[^./]+$/, '').slice(1))) return true;
  const base = posix.basename(p), stem = base.split('.')[0], folder = posix.basename(posix.dirname(p));
  if (p.split('/').length <= 2) return text.includes(base); // a root file: /icon-192.png, /trailer-15.mp4
  return tokenIn(text, stem) && tokenIn(text, folder);
}
/** a folder the code reads by building names inside it: its path (`JOURNAL_ART = '/assets/pine-hollow/journal'`), or a texture
 *  set / model folder named by its id (`pbrUrls('stone_wall')`, `gltf('hatchet')`: `/assets/tex|models/${id}/…`) */
function folderNamed(text, p) {
  const dir = posix.dirname(p);
  if (text.includes(dir.slice(1))) return true;
  const m = /^\/assets\/(tex|models)\/([^/]+)\//.exec(p);
  return m !== null && tokenIn(text, m[2]);
}
for (const p of files) if (!used.has(p) && (named(game, p) || folderNamed(game, p))) use(p, 'named in the game code');

// 3 + 4, to a fixed point: glTF dependencies and tier / format siblings of what is used
const stemKey = (p) => { const d = posix.dirname(p), b = posix.basename(p); return `${d}/${b.split('.')[0]}`; };
const byStem = new Map();
for (const p of files) { const k = stemKey(p); byStem.set(k, [...(byStem.get(k) ?? []), p]); }
for (let grew = true; grew;) {
  grew = false;
  for (const [p, why] of used) { // a Map iterates the entries added meanwhile too
    if (p.endsWith('.gltf') && existsSync(join(ROOT, 'public', p))) {
      try {
        const g = JSON.parse(readFileSync(join(ROOT, 'public', p), 'utf8'));
        for (const r of [...(g.buffers ?? []), ...(g.images ?? [])]) {
          if (typeof r.uri !== 'string' || r.uri.startsWith('data:')) continue;
          const dep = posix.normalize(posix.join(posix.dirname(p), decodeURIComponent(r.uri)));
          if (!used.has(dep)) { use(dep, `${p} (${why})`); grew = true; }
        }
      } catch { /* not JSON: left to the other rules */ }
    }
    for (const s of byStem.get(stemKey(p)) ?? []) if (!used.has(s)) { use(s, `a tier / format copy of ${p}`); grew = true; }
  }
}

const devReach = (p) => { if (named(dev, p)) return true; return folderNamed(dev, p); };
const devOnly = files.filter((p) => !used.has(p) && devReach(p));
// named by a design doc or a plan (a model set staged for a pass not yet wired in): kept, listed
const docs = read(walk(join(ROOT, 'docs')));
/** the file or a folder above it, three levels deep at least (`assets/nalati/sourced`, never plain `assets/nalati`) */
const ancestors = (p) => { const parts = p.slice(1).split('/'); const out = []; for (let i = parts.length; i >= 3; i--) out.push(parts.slice(0, i).join('/')); return out; };
const documented = files.filter((p) => !used.has(p) && !devOnly.includes(p) && ancestors(p).some((a) => docs.includes(a)));
const unused = files.filter((p) => !used.has(p) && !devOnly.includes(p) && !documented.includes(p));
const sum = (ps) => ps.reduce((s, p) => s + size(p), 0);
const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;

if (has('json')) {
  process.stdout.write(`${JSON.stringify({ files: files.length, used: used.size, devOnly: devOnly.map((p) => [p, size(p)]), documented: documented.map((p) => [p, size(p)]), unused: unused.map((p) => [p, size(p)]) }, null, 1)}\n`);
  process.exit(0);
}
if (has('warn')) {
  if (unused.length > 0) console.warn(`unused-assets: WARNING — ${unused.length} file(s) under public/ that nothing references (${mb(sum(unused))}); run node scripts/unused-assets.mjs to list them`);
  process.exit(0);
}
console.log(`public/: ${files.length} tracked files, ${mb(sum(files))} · used ${files.length - devOnly.length - documented.length - unused.length} · dev-only ${devOnly.length} (${mb(sum(devOnly))}) · documented ${documented.length} (${mb(sum(documented))}) · UNUSED ${unused.length} (${mb(sum(unused))})`);
if (devOnly.length > 0) { console.log('\ndev-only (named by scripts/ or test/ — kept):'); for (const p of devOnly) console.log(`  ${mb(size(p)).padStart(9)}  ${p}`); }
if (documented.length > 0) { console.log('\ndocumented (named by docs/ — staged for a pass, kept):'); for (const p of documented) console.log(`  ${mb(size(p)).padStart(9)}  ${p}`); }
if (unused.length > 0) { console.log('\nUNUSED:'); for (const p of unused) console.log(`  ${mb(size(p)).padStart(9)}  ${p}`); }
if (has('delete') && unused.length > 0) {
  const bytes = sum(unused);
  for (const p of unused) unlinkSync(join(ROOT, 'public', p));
  for (const d of new Set(unused.map((p) => dirname(join(ROOT, 'public', p))))) { try { if (readdirSync(d).length === 0) execFileSync('rmdir', [d]); } catch { /* not empty */ } }
  console.log(`\ndeleted ${unused.length} files, ${mb(bytes)}`);
}
