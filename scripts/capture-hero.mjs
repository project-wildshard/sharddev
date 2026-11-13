#!/usr/bin/env node
// `wildshard hero <shard-dir> --base <served-build-url>`: capture a shard's hero (its SHARD SELECT card) from a served
// build of this exact candidate, write it over the card files the manifest names, and stamp `hero.json` with the
// content it shows. `wildshard build` refuses a cut whose stamp no longer matches the content (src/cli/hero/hero.ts).
// Jake, 2026-11-12 17:14 Cancún: "you have to update the hero images for the templates."
//
// Serve the candidate first: `wildshard dev .` (SA17; its page enters the shard by `?skipintro`), or an engine build
// (engine: `scripts/serve-build.sh --shard <slug>`), and run this from the shard project root. A new project's
// generated `data:` card gets files of its own: `card/<slot>.jpg`, and manifest.json names them after the capture. Headless Chromium on the real GPU (Metal), never a visible window. The view is `hero.json`'s `camera`
// ({ pos: [x,y,z], look: [x,y,z], fov, center }, engine scripts/hero-shots.mjs's view shape) when the shard declares
// one, else the player's own spawn view. Sizes: thumb 640x360, portrait 804x1626, landscape 1600x900.
//
// `wildshard hero <shard-dir> --stamp-existing` captures nothing: it stamps the hero files already there as showing
// the content now. It exists for a shard repo that gains this check with curated heroes and no stamp. WARNING: use it
// only when those images match the current content; a wrong stamp hides a stale hero until the next content change.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { heroSlotFiles, writeHeroStamp } from '../src/cli/hero/stamp.ts';
import { stampExistingHero } from '../src/cli/hero/adopt.ts';
import { findShardSource, shardFolderName } from '../src/sharddev/shardSource.ts';

const SCALE = 2;
const VIEWS = { portrait: { width: 402, height: 813 }, landscape: { width: 800, height: 450 }, thumb: { width: 320, height: 180 } };
const QUALITY = 86;
const sleep = ms => new Promise(done => { setTimeout(done, ms); });

/** A baseline or progressive JPEG's pixel size, from its SOF0 or SOF2 frame header. */
function jpegSize(bytes) {
  for (let at = 2; at + 9 < bytes.length;) {
    const marker = bytes[at + 1], length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker === 0xc0 || marker === 0xc2) return [(bytes[at + 7] << 8) | bytes[at + 8], (bytes[at + 5] << 8) | bytes[at + 6]];
    at += 2 + length;
  }
  throw new Error('No JPEG frame header');
}

/** The name SHARD SELECT shows this shard under: its built product's, else the manifest's. */
function servedName(shard) {
  const product = resolve(shard, '../../../out', basename(shard), 'shard.json');
  if (existsSync(product)) return JSON.parse(readFileSync(product, 'utf8')).identity.name;
  return String(JSON.parse(readFileSync(join(shard, 'manifest.json'), 'utf8')).name);
}

/** The served root, so the URL `wildshard dev` prints (`…/?skipintro`) works as `--base` as well as a bare origin. */
function servedRoot(base) {
  const url = new URL(base);
  url.search = ''; url.hash = '';
  return url.href.replace(/\/+$/u, '');
}

/** True when `base` is a `wildshard dev` server: it answers its reload poll, `/__wildshard_dev_revision`. */
async function isDevServer(base) {
  try {
    const response = await fetch(`${base.replace(/\/+$/u, '')}/__wildshard_dev_revision`, { cache: 'no-store' });
    return response.ok && typeof (await response.json()).revision === 'number';
  } catch { return false; }
}

/** Enter the shard the way a player does: SHARD SELECT, its card, ENTER WORLD (hidden shards are Developer cards).
 * A `wildshard dev` page serves this shard alone and enters it by `?skipintro`; its SHARD SELECT lists engine's. */
async function enter(page, base, name, log) {
  const dev = await isDevServer(base);
  const url = `${base.replace(/\/+$/u, '')}/?${dev ? 'skipintro&' : ''}mute=1&sw=0&tier=desktop&nolock=1&perf=0`;
  log(dev ? `hero: loading ${url} (wildshard dev)` : `hero: loading ${url}, card "${name}"`);
  await page.goto(url, { waitUntil: 'load' });
  if (!dev) await selectCard(page, base, name);
  await page.waitForFunction(() => Boolean(window.__wildshard?.world?.hud?.entered && window.__wildshard?.world?.game) && document.querySelector('.ws-load') === null,
    undefined, { timeout: 240000, polling: 500 });
  if (await page.evaluate(() => window.__wildshard.world.hud.paused)) await page.keyboard.press('Escape');
}

async function selectCard(page, base, name) {
  await page.locator('.ws-main-select').click({ timeout: 120000 });
  await page.locator('.ws-menu-card').first().waitFor({ timeout: 60000 });
  const names = await page.evaluate(() => [...document.querySelectorAll('.ws-menu-card')].map(card => card.querySelector('b')?.textContent?.trim() ?? ''));
  const at = names.indexOf(name);
  if (at < 0) throw new Error(`no SHARD SELECT card named "${name}" on ${base} (cards: ${names.join(', ')}); serve a build that carries this candidate`);
  await page.evaluate(index => document.querySelector(`.ws-menu-dots i[data-i="${index}"]`)?.click(), at);
  await sleep(1000);
  await page.locator('.ws-menu-play').click();
}

export async function captureHero(shard, given, { name = servedName(shard), log = console.info } = {}) {
  const base = servedRoot(given);
  // Loaded here, so --stamp-existing needs no browser or engine to resolve.
  const [{ chromium }, { NAME_ASKED, saveFixture }, { KEYCHAIN_ARGS }] = await Promise.all([
    import('playwright'), import('@wildshard/engine/scripts/debug-settings.mjs'), import('./chromium-keychain.mjs')]);
  // A slot with no file (new's generated `data:` card) is captured to card/<slot>.jpg and named in manifest.json after.
  const files = { ...(await heroSlotFiles(shard)) };
  const missing = Object.keys(VIEWS).filter(slot => files[slot] === undefined);
  for (const slot of missing) files[slot] = join(shard, 'card', `${slot}.jpg`);
  const stampFile = join(shard, 'hero.json');
  const camera = existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')).camera : undefined;
  const errors = [], shots = {};
  const browser = await chromium.launch({ headless: true, args: [...KEYCHAIN_ARGS, '--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: VIEWS.portrait, deviceScaleFactor: SCALE });
    await saveFixture(context, { scope: 'device', key: 'devMode', data: true }); // hidden and experimental shards enter only in developer mode
    await saveFixture(context, { scope: 'global', key: 'gfx', data: { dpr: 'native', aa: 'on' } });
    await saveFixture(context, NAME_ASKED);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
    await enter(page, base, name, log);
    await page.evaluate(view => {
      const world = window.__wildshard.world, cam = world.game.camera;
      try { world.animals.calm = true; } catch { /* a shard without animals */ }
      const style = document.createElement('style');
      style.textContent = 'body *{visibility:hidden!important} canvas.__hero{visibility:visible!important}';
      world.game.renderer.domElement.classList.add('__hero'); document.head.append(style);
      // Posed last in the frame, as engine scripts/hero-shots.mjs does; with no declared camera only the held
      // weapon and hands go, and the player's spawn view stays.
      world.game.onLate(() => {
        for (const child of cam.children) child.visible = false;
        if (view === undefined) return;
        cam.position.set(...view.pos); cam.up.set(0, 1, 0); cam.lookAt(...view.look);
        const center = view.center ?? 0.5, span = 2 * Math.tan(((view.fov ?? 60) * Math.PI) / 360), aspect = innerWidth / innerHeight;
        const height = 2 * Math.max(center, 1 - center), offset = center < 0.5 ? 1 - 2 * center : 0;
        cam.fov = (2 * Math.atan((height / 2) * span) * 180) / Math.PI;
        cam.far = Math.max(cam.far, 6000);
        cam.setViewOffset(aspect, height, 0, offset, aspect, 1);
        cam.updateMatrixWorld(true);
      });
    }, camera);
    await sleep(8000);
    for (const [slot, viewport] of Object.entries(VIEWS)) {
      await page.setViewportSize(viewport);
      await sleep(3000);
      shots[slot] = await page.screenshot({ type: 'jpeg', quality: QUALITY });
      const [width, height] = jpegSize(shots[slot]);
      if (width !== viewport.width * SCALE || height !== viewport.height * SCALE) throw new Error(`${slot} came out ${width}x${height}`);
      log(`hero: ${slot} ${width}x${height}`);
    }
    await context.close();
  } finally { await browser.close(); }
  if (errors.length > 0) throw new Error(`page errors during capture, nothing written: ${errors.slice(0, 3).join(' | ')}`);
  // Write every file, then the stamp, so a failed capture leaves the old hero and its old stamp.
  if (missing.length > 0) mkdirSync(join(shard, 'card'), { recursive: true });
  for (const [slot, bytes] of Object.entries(shots)) {
    const partial = `${files[slot]}.partial`;
    try { writeFileSync(partial, bytes); renameSync(partial, files[slot]); } finally { rmSync(partial, { force: true }); }
    log(`hero: wrote ${files[slot]}`);
  }
  if (missing.length > 0) {
    const named = Object.fromEntries(missing.map(slot => [slot, `/src/shards/${shardFolderName(shard)}/card/${slot}.jpg`]));
    // new writes the card twice, manifest.json and the reference world's data/card.json, and build refuses a pair that
    // differs; so the slots move in both. Each file keeps its own layout (new writes them on one line).
    for (const file of ['manifest.json', join('data', 'card.json')].map(name => join(shard, name)).filter(existsSync)) {
      const text = readFileSync(file, 'utf8'), json = JSON.parse(text);
      if (file.endsWith('card.json') && missing.some(slot => json.card?.[slot] !== undefined && !String(json.card[slot]).startsWith('data:'))) continue;
      json.card = { ...json.card, ...named };
      writeFileSync(file, `${/^\{\s*\n/u.test(text) ? JSON.stringify(json, null, 2) : JSON.stringify(json)}\n`);
      log(`hero: ${file} card.${missing.join(', card.')} now name card/*.jpg`);
    }
  }
  return await writeHeroStamp(shard, { base, ...(camera === undefined ? {} : { camera }) });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [dir, flag, base] = process.argv.slice(2);
  const adopt = flag === '--stamp-existing' && base === undefined;
  if (dir === undefined || (!adopt && (flag !== '--base' || base === undefined))) {
    console.error('usage: wildshard hero <source> --base <served-build-url>  (serve the candidate first: `wildshard dev .` prints its URL)');
    console.error('       wildshard hero <source> --stamp-existing  WARNING: no capture; stamps the hero images already there as current.');
    console.error('       Use it ONLY when you have looked at those images and they show the current content; a wrong stamp hides a stale hero.');
    process.exit(2);
  }
  // SA16 (J317): a repo path names its shard source at src/ or its one src/shards/<slug>/, as the other verbs do.
  const shard = findShardSource(dir);
  if (!existsSync(join(shard, 'manifest.json'))) throw new Error(`${shard}: no manifest.json`);
  if (adopt) console.warn('hero: --stamp-existing: NO capture. Stamping the images already there as showing this content. Only right if they do.');
  const stamp = adopt ? await stampExistingHero(shard) : { written: true, ...(await captureHero(shard, base)) };
  const file = join(dirname(shard), basename(shard), 'hero.json');
  console.info(stamp.written ? `hero: stamped ${file} (content ${stamp.content.slice(0, 12)})` : `hero: ${file} is already current; nothing stamped`);
}
