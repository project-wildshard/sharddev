#!/usr/bin/env node
import { debugSettings, harnessPins } from '@wildshard/engine/scripts/debug-settings.mjs';
// gpu-texmem.mjs — how much GPU memory each shard's textures take (E157, KTX2 / Basis GPU compression).
//
// Counts at the WebGL call, not from three's bookkeeping: an init script wraps texStorage2D/3D, texImage2D/3D,
// compressedTexImage2D/3D, generateMipmap, renderbufferStorage(Multisample) and deleteTexture / deleteRenderbuffer, and
// keeps, per live WebGLTexture, the bytes its levels hold (internal format × width × height × depth; RGB8 counted as 4
// bytes a texel, which is what the GPU stores; a compressed level is its byte length). A texture that a framebuffer
// ever attached is a render target and is summed apart (bloom, shadow maps, the composer: not what KTX2 changes).
// After the settle the page's scene is walked: every texture a material or ShaderMaterial uniform holds is matched to
// its WebGLTexture (renderer.properties) and labelled with the mesh that draws it, so the table says whose bytes they are.
//
//   node scripts/gpu-texmem.mjs --url=http://localhost:4391 --chunk=pine-hollow --tier=phone [--tex=ktx2|img] [--tag=x]
//   … --record                      record individual files through the unavailable-pack fallback and merge the
//                                    files this boot loaded into scripts/bake-ktx2.list.json (bake-ktx2's list)
//
// Phone: 390×844 @3, iPhone UA, `touch=1&tier=phone`. Desktop: 1600×900 @1, `tier=desktop`. One headless Chromium on
// Metal, muted (`--mute-audio`, `mute=1`), closed at the end. Writes progress/texmem/<tag>-<chunk>-<tier>.json.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { ledger, report } from './texmem-probe.mjs';

const { chromium, devices } = await import('playwright');
const ROOT = resolvePath(new URL('..', import.meta.url).pathname);
const argv = process.argv.slice(2);
const flag = (name, d) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : d; };
const URL_BASE = flag('url', 'http://localhost:4391');
const CHUNK = flag('chunk', 'pine-hollow');
const TIER = flag('tier', 'phone');
const EXTRA = flag('query', '');
/** --tex=ktx2|img: the textures (E157) — a harness pin (`__wildshardHarness.textures`, G386), never a setting or URL switch;
 * the background prefetch of the other shards (E158) is off either way, so it adds nothing to the ledger */
const TEX = flag('tex', '');
const TAG = flag('tag', 'latest');
const SETTLE = Number(flag('settle', '10')) * 1000;
const TOP = Number(flag('top', '25'));
/** --record: merge the texture / model URLs this boot fetched into scripts/bake-ktx2.list.json (what bake-ktx2 bakes) */
const RECORD = argv.includes('--record');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const browser = await chromium.launch({ args: ['--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
try {
  const phone = TIER === 'phone';
  const iphone = devices['iPhone 16 Pro'];
  const ctx = await browser.newContext(phone
    ? { userAgent: iphone.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 3, viewport: { width: 390, height: 844 } }
    : { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(ledger);
  await debugSettings(ctx, { prefetch: 'off' });
  if (TEX !== '') await harnessPins(ctx, { textures: TEX });
  // G221: CLI-only fetch adapter; no in-game option, saved state or network error.
  // The engine's normal unavailable-part fallback fetches each original URL for the ledger.
  if (RECORD) await ctx.addInitScript(() => {
    const fetchNow = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return new URL(url, location.href).pathname.startsWith('/assets/packs/')
        ? Promise.resolve(new Response(null, { status: 503 })) : fetchNow(input, init);
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' || /ktx2|KTX2|basis/i.test(m.text())) errors.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
  const q = [`chunk=${CHUNK}`, 'mute=1', 'skipintro=1', 'nolock=1', 'sw=0', `tier=${TIER}`, phone ? 'touch=1' : '', EXTRA].filter(Boolean).join('&');
  const t0 = Date.now();
  await page.goto(`${URL_BASE}/?${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__wildshard?.world?.game), undefined, { timeout: 300000, polling: 500 });
  const readyS = (Date.now() - t0) / 1000;
  await sleep(SETTLE);
  // the JS heap after a full collection: what the page holds, not the garbage the boot left
  await page.evaluate(async () => { for (let i = 0; i < 3; i++) { window.gc?.(); await new Promise((resolve) => { setTimeout(resolve, 200); }); } });
  const r = await page.evaluate(report, TOP);
  const out = { tag: TAG, chunk: CHUNK, tier: TIER, tex: TEX, query: q, readyS, when: new Date().toISOString(), errors: errors.slice(0, 20), ...r };
  mkdirSync(resolvePath(ROOT, 'progress/texmem'), { recursive: true });
  const file = resolvePath(ROOT, `progress/texmem/${TAG}-${CHUNK}-${TIER}.json`);
  writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`[texmem] ${CHUNK} ${TIER} tex=${TEX === '' ? '(default)' : TEX} ${EXTRA} · ready ${readyS.toFixed(0)} s`);
  console.log(`  textures ${r.textureMB} MB in ${r.textures} (compressed ${r.compressedMB} MB in ${r.compressedTextures}) · in scene ${r.inSceneMB} MB · render targets ${r.renderTargetMB} MB · renderbuffers ${r.renderbufferMB} MB · JS heap ${r.jsHeapMB} MB`);
  console.log(`  by format ${JSON.stringify(r.byFormat)}`);
  for (const [k, v] of Object.entries(r.byClass).sort((a, b) => b[1].mb - a[1].mb).slice(0, 30)) console.log(`  ${String(v.mb.toFixed(1)).padStart(7)} MB ${String(v.n).padStart(4)}  ${k}`);
  console.log(`  compressed ext: ${r.compressedExtensions.join(' ')}`);
  for (const x of r.top) console.log(`  ${String(x.mb).padStart(6)} MB ${`${x.w}x${x.h}${x.d > 1 ? `x${x.d}` : ''}`.padEnd(14)} ${x.fmt.padEnd(12)} ${x.mips.padEnd(7)} ${String(x.src).slice(-40).padEnd(40)} ${x.where.slice(0, 90)}`);
  if (errors.length > 0) console.log(`  errors: ${errors.slice(0, 5).join(' / ')}`);
  console.log(`  → ${file}`);
  if (RECORD) {
    const listFile = resolvePath(ROOT, 'scripts/bake-ktx2.list.json');
    const list = JSON.parse(readFileSync(listFile, 'utf8'));
    const keep = (u) => /\.(glb|gltf|png|jpe?g|webp)$/.test(u) && !/^\/(?:assets|b\/[\w.-]+)\/[^/]+-[\w-]{8}\.\w+$/.test(u) && !u.includes('/hdri/') && !u.startsWith('/assets/gpu/');
    const before = list[TIER].length;
    list[TIER] = [...new Set([...list[TIER], ...r.fetched.filter(keep)])].sort((a, b) => a.localeCompare(b));
    writeFileSync(listFile, `${JSON.stringify(list, null, 1)}\n`);
    console.log(`  recorded: ${list[TIER].length - before} new ${TIER} URLs → ${listFile}`);
  }
} finally {
  await browser.close();
}
