#!/usr/bin/env node
import { KEYCHAIN_ARGS } from './chromium-keychain.mjs';
// bake-textures.mjs — bake the sky's procedural textures once (project/archive/2026-09-22-load-perf.md §P2; SF87, G320).
//
// The sky's cloud field, banded planet and gas giant are painted on a canvas at runtime when the build has no file for
// them (`bakedTexture(name, make)`, src/client/engine/boot/bakedTextures.ts). This bundles a bake page
// (scripts/bake/skyTexturesPage.ts: the engine's pure painters, src/client/engine/world/skyTextures.ts, and nothing else), runs
// it on a blank page in headless Chromium (muted, as the iPhone 16 Pro), and writes the shard's
// public/assets/baked/<slug>/tex/<name>.jpg plus textures.json with a hash of the output files. It boots no game page and
// loads no shard runtime or legacy code. Every run bakes in memory; --check writes nothing.
//
//   scripts/browser-lane.sh node scripts/bake-textures.mjs [--chunk pine-hollow|driftwood-isle|--all] [--check]
//
// GR9 (G798): a plain script, run by hand when the painters change; its outputs are committed files, not catalogue
// outputs, and --check verifies them.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { byteWriter, outputHash, jsonBytes, toolVersion, browserBakeBytes } from '@wildshard/engine/scripts/bake-output.mjs';

const ROOT = resolve(import.meta.dirname, '..');
/** Which sky textures each shard ships baked (the rest paint at runtime): the sky pieces its look builds. */
const SHARDS = {
  'driftwood-isle': ['giant'],   // the gas giant (its sky spec's `planet`)
  'pine-hollow': ['clouds', 'planet'],   // the cloud layer and the ringed planet
};
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const all = process.argv.includes('--all');
const only = arg('--chunk', 'pine-hollow');
if (!all && !Object.hasOwn(SHARDS, only)) throw new Error(`bake-textures: --chunk ${only}? (${Object.keys(SHARDS).join(', ')})`);
const slugs = all ? Object.keys(SHARDS) : [only];
const check = process.argv.includes('--check');
const output = byteWriter(check, 'bake-textures');

const bundle = await build({
  configFile: false, logLevel: 'silent', publicDir: false, root: ROOT,
  build: { write: false, target: 'esnext', minify: false, lib: { entry: resolve(ROOT, 'scripts/bake/skyTexturesPage.ts'), formats: ['iife'], name: 'skyTexturesPage' } },
});
const chunks = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((b) => ('output' in b ? b.output : []));
const code = chunks.find((c) => c.type === 'chunk')?.code;
if (code === undefined) throw new Error('bake-textures: the bake page did not bundle');

const { chromium, devices } = await import('playwright');
const browser = await chromium.launch({ headless: true, args: [...KEYCHAIN_ARGS, '--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext(devices['iPhone 16 Pro'])).newPage();
  /** @type {string[]} */ const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
  await page.setContent('<!doctype html><meta charset="utf-8"><title>sky bake</title>');
  await page.addScriptTag({ content: code });
  for (const slug of slugs) {
    const dir = resolve(ROOT, 'public/assets/baked', slug, 'tex');
    const meta = resolve(ROOT, 'public/assets/baked', slug, 'textures.json');
    const names = SHARDS[/** @type {keyof typeof SHARDS} */ (slug)], sink = await browserBakeBytes(page, { maxFiles: names.length });
    try {
      /** @type {Record<string, { lossless: boolean; width: number; height: number }>} */
      const out = await page.evaluate(({ selected, url }) => window.bakeSkyTextures(selected, url), { selected: names, url: sink.url });
      const files = {};
      const buffers = [];
      const wanted = new Set();
      for (const [name, { lossless, width, height }] of Object.entries(out).sort(([a], [b]) => a.localeCompare(b))) {
        const file = `${name}.${lossless ? 'png' : 'jpg'}`;
        wanted.add(file);
        const buf = sink.take(name);
        // a source edit that did not change the pixels keeps the file byte-identical (no commit noise, same SW cache entry)
        output.put(resolve(dir, file), buf);
        buffers.push(buf);
        files[file] = { bytes: buf.length, width, height };
      }
      if (existsSync(dir)) for (const f of readdirSync(dir)) if (!wanted.has(f) && !f.includes('.phone.')) output.remove(resolve(dir, f));
      const hash = outputHash(Buffer.concat(buffers));
      output.put(meta, jsonBytes({ hash, files }));
      console.log(`bake-textures: ${slug} ${Object.keys(files).join(' ')} (hash ${hash.slice(0, 12)})`);
    } finally { await sink.dispose(); }
  }
  if (errors.length > 0) throw new Error(`bake-textures: page errors: ${errors.join('; ')}`);
} finally {
  await browser.close();
}
if (output.finish() > 0) console.log(`bake-textures: Chromium ${toolVersion(chromium.executablePath(), [...KEYCHAIN_ARGS, '--version']) ?? 'unavailable'}`);
