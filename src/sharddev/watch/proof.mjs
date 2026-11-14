#!/usr/bin/env node
// SHARD-SOURCE AP6 (and AP7's shots): drive a running `wildshard watch` (or `dev`) page in headless Chromium.
//
//   node src/sharddev/watch/proof.mjs --url http://127.0.0.1:<port>/ --out <dir> [--shots] [--time <file> --runs 10]
//
// --shots   three cleanroom cameras (Mossgate `scripts/cameras.json`: hut front, hut back, pond) to <out>/<id>.png
// --time    edits the roof colour in <file> `runs` times and times each write to the first frame the page draws with the
//           new colour (the dev scene host's `framedAt`, same machine clock); it checks the page never reloaded, the frame
//           loop never stopped and the player never moved, and writes <out>/timing.json. The file is restored after.
import { chromium } from 'playwright';
// oxlint-disable-next-line import/no-nodejs-modules -- a node script: it writes the shots and the timing beside the source edit.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- a node script resolves its output folder.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- a node script reads its flags.
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { url: { type: 'string' }, out: { type: 'string' }, shots: { type: 'boolean' }, time: { type: 'string' }, runs: { type: 'string' }, prefix: { type: 'string' } } });
if (values.url === undefined || values.out === undefined) throw new Error('usage: proof.mjs --url <page> --out <dir> [--shots] [--time <file> --runs N]');
const OUT = resolve(values.out), RUNS = Number(values.runs ?? 10), PREFIX = values.prefix ?? '';
mkdirSync(OUT, { recursive: true });
// Mossgate cleanroom scripts/cameras.json: [x, z, yaw, pitch], eye 1.68 m, vertical FOV 72
const CAMERAS = [['03-hut-front', -3.9, -5.6, 0.03, -0.04], ['05-door-lamp', -4.6, -7.8, 0.03, 0.05], ['04-hut-back', -3.9, -10.4, 3.4, -0.05], ['08-pond', -10.4, 0.3, 1.571, -0.08]];
const ROOF = /shingle: new THREE\.MeshStandardMaterial\(\{ name: 'roof', (?:color: 0x[0-9a-f]{6}, )?map: tex\.shingle, roughness: 0\.95 \}\),/u;

const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic', '--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const result = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // engine's probe controls (pose) answer only a harness-pinned page (engine scripts/debug-settings.mjs harnessPins)
  await page.addInitScript({ content: 'window.__wildshardHarness=Object.assign(window.__wildshardHarness??{},{seed:357});' });
  page.on('pageerror', (error) => { console.error(`page error: ${error.message}`); });
  await page.goto(`${values.url}?skipintro`);
  await page.waitForFunction(() => window.__wildshard?.world?.player !== undefined, undefined, { timeout: 180_000, polling: 500 });
  const watched = await page.waitForFunction(() => (window.__wsDevScene?.framedRevision ?? 0) > 0, undefined, { timeout: 30_000, polling: 250 }).then(() => true, () => false);
  console.info(`page ready (${watched ? 'dev scene host live' : 'no dev scene host: a baked shard'})`);
  await page.evaluate(() => {
    const w = window.__wildshard.world;
    if (w.animals) w.animals.calm = true;
    w.game.onLate(() => { for (const child of w.game.camera.children) child.visible = false; if (Math.abs(w.game.camera.fov - 72) > 0.01) { w.game.camera.fov = 72; w.game.camera.updateProjectionMatrix(); } }, 'ap6.fov');
  });

  if (values.shots === true) {
    for (const [id, x, z, yaw, pitch] of CAMERAS) {
      await page.evaluate(async (pose) => { await window.__wildshard.pose(pose); }, { x, z, yaw, pitch });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, `${PREFIX}${id}.png`) });
      console.info(`shot ${PREFIX}${id}`);
    }
    // the page's own frame clock, counted for 5 s (page code, passed as text: it runs in the browser, not here)
    result.fps = await page.evaluate(`new Promise((done) => { const w = window.__wildshard.world, t0 = Date.now(); let n = 0; const stop = w.game.watchFrames(() => { n++; if (Date.now() - t0 >= 5000) { stop(); done(Math.round(n / ((Date.now() - t0) / 1000))); } }); })`);
    console.info(`fps ${result.fps} (headless, 1280x720, 5 s at the last camera)`);
  }

  if (values.time !== undefined) {
    if (!watched) throw new Error('--time needs a `wildshard watch` page');
    const file = resolve(values.time), original = readFileSync(file, 'utf8');
    if (!ROOF.test(original)) throw new Error(`--time: ${file} has no roof material line to edit`);
    await page.evaluate(async (pose) => { await window.__wildshard.pose(pose); window.__ap6Marker = 'same page'; }, { x: CAMERAS[0][1], z: CAMERAS[0][2], yaw: CAMERAS[0][3], pitch: CAMERAS[0][4] });
    await page.waitForTimeout(2000);
    const roofHex = () => { let hex = null; window.__wildshard.world.game.rootScene.getObjectByName('devScene')?.traverse((o) => { if (o.material?.name === 'roof') hex = o.material.color.getHexString(); }); return hex; };
    const runs = [];
    try {
      for (let i = 0; i < RUNS; i++) {
        const colour = ((0x40 + i * 17) << 16 | (0x90 - i * 7) << 8 | (0x30 + i * 13)).toString(16).padStart(6, '0');
        const before = await page.evaluate(() => ({ revision: window.__wsDevScene.framedRevision, frames: window.__wsDevScene.frames, at: window.__wildshard.world.player.position.toArray() }));
        const written = Date.now();
        writeFileSync(file, original.replace(ROOF, `shingle: new THREE.MeshStandardMaterial({ name: 'roof', color: 0x${colour}, map: tex.shingle, roughness: 0.95 }),`));
        const handle = await page.waitForFunction(([revision, hex, read]) => {
          const report = window.__wsDevScene;
          if (report.framedRevision <= revision) return false;
          // eslint-disable-next-line no-new-func -- the roof reader is passed in as text
          return new Function(`return (${read})()`)() === hex ? report.framedAt : false;
        }, [before.revision, colour, roofHex.toString()], { timeout: 30_000, polling: 'raf' });
        const framedAt = await handle.jsonValue();
        const after = await page.evaluate(() => ({ frames: window.__wsDevScene.frames, at: window.__wildshard.world.player.position.toArray(), marker: window.__ap6Marker }));
        const moved = Math.hypot(...after.at.map((v, k) => v - before.at[k]));
        runs.push({ colour, ms: framedAt - written, frames: after.frames - before.frames, moved: Number(moved.toFixed(4)), reloaded: after.marker !== 'same page' });
        console.info(`edit ${i + 1}: #${colour} on screen in ${framedAt - written} ms`);
        await page.waitForTimeout(400);
      }
    } finally { writeFileSync(file, original); }
    const sorted = runs.map((r) => r.ms).sort((a, b) => a - b), median = (sorted[4] + sorted[5]) / 2;
    result.timing = { runs, median, min: sorted[0], max: sorted.at(-1), reloads: runs.filter((r) => r.reloaded).length, maxMoved: Math.max(...runs.map((r) => r.moved)), frameLoopStopped: runs.some((r) => r.frames <= 0) };
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, `${PREFIX}timing-last.png`) });
    console.info(`median ${median} ms (min ${sorted[0]}, max ${sorted.at(-1)}), reloads ${result.timing.reloads}, player moved ≤ ${result.timing.maxMoved} m`);
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, `${PREFIX}proof.json`), `${JSON.stringify(result, null, 2)}\n`);
}
