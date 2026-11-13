#!/usr/bin/env node
// `wildshard hero <shard-dir> --base <served-build-url>`: capture a shard's hero (its SHARD SELECT card) from a served
// build of this exact candidate, write it over the card files the manifest names, and stamp `hero.json` with the
// content it shows. `wildshard build` refuses a cut whose stamp no longer matches the content (src/cli/hero/hero.ts).
// Jake, 2026-11-12 17:14 Cancún: "you have to update the hero images for the templates."
//
// Serve the candidate first (engine: `scripts/serve-build.sh --shard <slug>`), and run this from the shard project
// root. Headless Chromium on the real GPU (Metal), never a visible window. The view is `hero.json`'s `camera`
// ({ pos: [x,y,z], look: [x,y,z], fov, center }, engine scripts/hero-shots.mjs's view shape) when the shard declares
// one, else the player's own spawn view. Sizes: thumb 640x360, portrait 804x1626, landscape 1600x900.
//
// `wildshard hero <shard-dir> --stamp-existing` captures nothing: it stamps the hero files already there as showing
// the content now. It exists for a shard repo that gains this check with curated heroes and no stamp. WARNING: use it
// only when those images match the current content; a wrong stamp hides a stale hero until the next content change.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { heroSlotFiles, writeHeroStamp } from '../src/cli/hero/stamp.ts';
import { stampExistingHero } from '../src/cli/hero/adopt.ts';

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

/** Enter the shard the way a player does: SHARD SELECT, its card, ENTER WORLD (hidden shards are Developer cards). */
async function enter(page, base, name, log) {
  const url = `${base.replace(/\/+$/u, '')}/?mute=1&sw=0&tier=desktop&nolock=1&perf=0`;
  log(`hero: loading ${url}, card "${name}"`);
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('.ws-main-select').click({ timeout: 120000 });
  await page.locator('.ws-menu-card').first().waitFor({ timeout: 60000 });
  const names = await page.evaluate(() => [...document.querySelectorAll('.ws-menu-card')].map(card => card.querySelector('b')?.textContent?.trim() ?? ''));
  const at = names.indexOf(name);
  if (at < 0) throw new Error(`no SHARD SELECT card named "${name}" on ${base} (cards: ${names.join(', ')}); serve a build that carries this candidate`);
  await page.evaluate(index => document.querySelector(`.ws-menu-dots i[data-i="${index}"]`)?.click(), at);
  await sleep(1000);
  await page.locator('.ws-menu-play').click();
  await page.waitForFunction(() => Boolean(window.__wildshard?.world?.hud?.entered && window.__wildshard?.world?.game) && document.querySelector('.ws-load') === null,
    undefined, { timeout: 240000, polling: 500 });
  if (await page.evaluate(() => window.__wildshard.world.hud.paused)) await page.keyboard.press('Escape');
}

export async function captureHero(shard, base, { name = servedName(shard), log = console.info } = {}) {
  // Loaded here, so --stamp-existing needs no browser or engine to resolve.
  const [{ chromium }, { NAME_ASKED, saveFixture }, { KEYCHAIN_ARGS }] = await Promise.all([
    import('playwright'), import('@wildshard/engine/scripts/debug-settings.mjs'), import('./chromium-keychain.mjs')]);
  const files = await heroSlotFiles(shard);
  const missing = Object.keys(VIEWS).filter(slot => files[slot] === undefined);
  if (missing.length > 0) throw new Error(`${join(shard, 'manifest.json')}: card.${missing.join(', card.')} must name a file in the shard folder (e.g. /src/shards/${basename(shard)}/card/${missing[0]}.jpg), not a data: url`);
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
  for (const [slot, bytes] of Object.entries(shots)) {
    const partial = `${files[slot]}.partial`;
    try { writeFileSync(partial, bytes); renameSync(partial, files[slot]); } finally { rmSync(partial, { force: true }); }
    log(`hero: wrote ${files[slot]}`);
  }
  return await writeHeroStamp(shard, { base, ...(camera === undefined ? {} : { camera }) });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [dir, flag, base] = process.argv.slice(2);
  const adopt = flag === '--stamp-existing' && base === undefined;
  if (dir === undefined || (!adopt && (flag !== '--base' || base === undefined))) {
    console.error('usage: wildshard hero <shard-dir> --base <served-build-url>  (serve the candidate first: engine scripts/serve-build.sh --shard <slug>)');
    console.error('       wildshard hero <shard-dir> --stamp-existing  WARNING: no capture; stamps the hero images already there as current.');
    console.error('       Use it ONLY when you have looked at those images and they show the current content; a wrong stamp hides a stale hero.');
    process.exit(2);
  }
  const shard = resolve(dir);
  if (!existsSync(join(shard, 'manifest.json'))) throw new Error(`${shard}: no manifest.json`);
  if (adopt) console.warn('hero: --stamp-existing: NO capture. Stamping the images already there as showing this content. Only right if they do.');
  const stamp = adopt ? await stampExistingHero(shard) : { written: true, ...(await captureHero(shard, base)) };
  const file = join(dirname(shard), basename(shard), 'hero.json');
  console.info(stamp.written ? `hero: stamped ${file} (content ${stamp.content.slice(0, 12)})` : `hero: ${file} is already current; nothing stamped`);
}
