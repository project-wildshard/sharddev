// SHARD-SOURCE AP20: watch equals build. One scene source through both back ends, shot from the same fixed cameras:
//
//   live   `wildshard watch <source>`: the shell boots, then the page script draws every part through engine's dev hook
//   build  `wildshard dev <source>`:   the full `wildshard build` (baked GLB tiles, the shardfile's look and terrain)
//
// Each camera's two frames are compared: the mean absolute difference per channel (out of 255) and the share of pixels off
// by more than 24 in any channel. The two back ends still differ where the shardfile back end lowers on purpose (a glowing
// material is the emissive family with no base colour, AP10's sorted transparency, AP11's billboards, AP28's lamps), so the
// guard is a ratchet: `parity-baseline.json` holds each camera's measured drift, and a camera over it by `MEAN` or `SHARE`
// is red. A fix that lowers the drift lowers the baseline (`--rebase`); nothing raises it unseen.
//
//   node src/sharddev/watch/parity.mjs [--source <dir>] [--out <dir>]   one comparison; exit 1 when red
//   node src/sharddev/watch/parity.mjs --check                           sharddev's pre-push: the clean run must be green,
//                                                                        and the live page with its roof colour halved (a
//                                                                        planted material difference) must be red
//   node src/sharddev/watch/parity.mjs --rebase                          write this run's drift as the baseline
//
// The page client is `$WILDSHARD_DEV_CLIENT` or the engine pin's devserver client (`wildshard dev`'s own). `--check` passes
// with one line saying why when that client has no dev hook this sdk drives (an engine pin from before hook v3). The servers
// and the browser are this script's: it ends them before it exits. Headless and muted.
// oxlint-disable-next-line import/no-nodejs-modules -- a node script: it runs `wildshard watch` and `wildshard dev` as children.
import { spawn } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- it reads its baseline and writes the frames it shot.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- paths from the repo root.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- its flags.
import { parseArgs } from 'node:util';
import { chromium } from "../../../scripts/browser-playwright.mjs";
import sharp from 'sharp';
import { NAME_ASKED, saveFixtureCode } from '@wildshard/engine/scripts/debug-settings.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
// SDK-SPLIT SP8c: the authoring slice is the sdk's sample shard; the bin is this (dev) package's.
const SDK = resolve(ROOT, '../sdk');
const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string' }, check: { type: 'boolean' }, rebase: { type: 'boolean' } } });
const SOURCE = resolve(values.source ?? join(SDK, 'src/shards/authoring-slice'));
const BASELINE = join(import.meta.dirname, 'parity-baseline.json');
/** QA 11-25 row 138: whether the built page's grid cell lights its look lamps (an engine with f837437c3); set by `shoot` */
let builtLights = true;
// The slice's own cameras (Mossgate cleanroom scripts/cameras.json): [id, x, z, yaw, pitch]
const CAMERAS = [['hut-front', -3.9, -5.6, 0.03, -0.04], ['door-lamp', -4.6, -7.8, 0.03, 0.05], ['hut-back', -3.9, -10.4, 3.4, -0.05], ['pond', -10.4, 0.3, 1.571, -0.08]];
/** The eye's height (m): the cameras' 1.68 m over the slice's ground, which is flat at 0 by every camera. */
const EYE = 1.68;
/** Red over the baseline by these, at any camera. Two clean runs differ by under 0.002/255; the planted roof adds over 1/255. */
const MEAN = 0.25, SHARE = 0.005, OFF = 24;

/** Start `wildshard <command> <source> 0` and resolve its page URL; `stop` kills the child. */
function serve(command) {
  const child = spawn(process.execPath, [join(ROOT, 'bin/wildshard.mjs'), command, SOURCE, '0'], { cwd: SDK, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const url = new Promise((_resolve, _reject) => {
    const read = (chunk) => {
      log += String(chunk);
      const found = /wildshard (?:watch|dev): (http:\/\/127\.0\.0\.1:\d+\/)/u.exec(log);
      if (found !== null) _resolve(found[1]);
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.on('exit', (code) => { _reject(new Error(`wildshard ${command} ended (${code}) before it served:\n${log.slice(-2000)}`)); });
  });
  return { url, stop: () => { if (child.exitCode === null) child.kill('SIGTERM'); } };
}

/** Each camera's frame, once the page stands still there; then, for each of `after`, the same after it runs in the page. */
async function shoot(browser, url, live, after = []) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  try {
    await page.addInitScript({ content: 'window.__wildshardHarness=Object.assign(window.__wildshardHarness??{},{seed:357});' });
    // MEMORY-STRUCTURE STR5: dev boots online, and an online page asks the device's Name once before the world.
    await page.addInitScript({ content: saveFixtureCode(NAME_ASKED) });
    await page.goto(`${url}?skipintro`);
    // the grid page's arrival reveal (engine grid/reveal.ts) ends first: its caption over the first shot read as drift
    await page.waitForFunction((watched) => window.__wildshard?.world?.player !== undefined && (!watched || (window.__wsDevScene?.framedRevision ?? 0) > 0)
      && (window.__wsReveal === undefined || window.__wsReveal.endedMs !== null),
      live, { timeout: 180_000, polling: 500 });
    await page.evaluate(() => {
      const w = window.__wildshard.world, camera = w.game.camera;
      const lampUpdates = new WeakMap();
      if (w.animals) w.animals.calm = true;
      // the camera leaves the player (whose body stands where colliders put it, which this test does not compare): each
      // frame it is set to the shot's eye, one field of view, no viewmodel
      w.freeCamera = true;
      w.game.onLate(() => {
        const eye = window.__ap20Eye;
        // Sample this static material fixture at one presentation instant.
        // Capture mode holds the tier's render scale; pause holds scheduled
        // systems. Water and lamp accumulators need their own explicit sample.
        let water = 0, lamps = 0;
        w.game.rootScene.traverse((object) => {
          if (object.name.startsWith('water:') && object.material?.uniforms?.uTime !== undefined) {
            object.material.uniforms.uTime.value = 5; water++;
          }
          if (object.name === 'look-light-lamps' && typeof object.update === 'function') {
            let update = lampUpdates.get(object);
            if (update === undefined) {
              update = object.update.bind(object); lampUpdates.set(object, update);
              // The built look updates after late; watch holds the original
              // callback, so both the property and this late sample are needed.
              // keep the eye: a crowded look lights its lamps nearest the camera (engine lookLight.ts AP28)
              object.update = (_time, at) => { update(5, at); };
            }
            update(5, camera.getWorldPosition(camera.position.clone())); lamps++;
          }
        });
        window.__ap20Phases = { water, lamps };
        for (const child of camera.children) child.visible = false;
        if (Math.abs(camera.fov - 72) > 0.01) { camera.fov = 72; camera.updateProjectionMatrix(); }
        if (eye !== undefined) { camera.position.set(eye[0], eye[1], eye[2]); camera.rotation.set(eye[4], eye[3], 0, 'YXZ'); camera.updateMatrixWorld(true); }
        w.game.app.clock.restore({ version: 1, elapsed: 5, wall: 5, frames: 300, captureFps: 60, paused: true, scale: 1 });
      }, 'ap20.camera');
    });
    // The watch panel and minimap are overlays: the map intentionally differs
    // between the authored preview and dev's cooked tile (MSZ41b). Compare the scene.
    await page.addStyleTag({ content: '#wildshard-watch { display: none !important; } .ws-minimap, .ws-grid-reveal { visibility: hidden !important; }' });
    const gridLamps = !live && await page.evaluate(() => (window.__wildshard?.shard?.grid?.state?.()?.sceneLife ?? []).some((row) => 'lampsDeclared' in row));
    if (!live) builtLights = gridLamps;
    const sets = [];
    for (const change of [null, ...after]) {
      if (change !== null) await page.evaluate(change);
      const frames = [];
      for (const [id, x, z, yaw, pitch] of CAMERAS) {
        await page.evaluate((eye) => { window.__ap20Eye = eye; }, [x, EYE, z, yaw, pitch]);
        await page.waitForTimeout(2500);
        const phases = await page.evaluate(() => window.__ap20Phases);
        // QA 11-25 row 138: the built page is the slice's one grid cell (CHUNK-PARAM-REMOVAL CP25), whose entered cell lights
        // its look lamps (engine grid/cellSceneLife.ts); both pages hold lamps and the pond's water, or the parity is void
        // An engine pin from before that fix (its grid readout names no lampsDeclared) still draws the cell unlit: then the built
        // page is held to the unlit baseline (`unlitGrid`), which goes when the pin moves past engine f837437c3
        if (phases === undefined || phases.water < 1 || ((live || gridLamps) && phases.lamps < 1)) throw new Error('Parity scene lacks its controlled water or lamp presentation');
        if (!live && gridLamps) {
          // the grid cell lights every declared lamp the page's reserve holds (the slice's nearest to the camera when more)
          const lamps = await page.evaluate(() => { const st = window.__wildshard?.shard?.grid?.state?.(); const row = st?.sceneLife?.find((r) => r.instance === st.inside); return row === undefined ? null : { declared: row.lampsDeclared, lit: row.lampsLit, pool: row.lamps }; });
          if (lamps === null || lamps.declared < 1 || lamps.lit !== Math.min(lamps.declared, lamps.pool) || lamps.pool < 1) throw new Error(`The built page's grid cell lights ${JSON.stringify(lamps)} of its declared look lamps`);
        }
        frames.push({ id, png: await page.screenshot() });
      }
      sets.push(frames);
    }
    return sets;
  } finally { await page.close(); }
}

/** The planted difference: the live page's roof colour halved (page code, passed as text). */
const PLANT = `window.__wildshard.world.game.rootScene.getObjectByName('devScene')?.traverse((o) => { if (o.material?.name === 'roof') o.material.color.multiplyScalar(0.5); })`;

/** Two PNG frames compared, pixel by pixel. */
async function compare(a, b) {
  const [p, q] = await Promise.all([a, b].map(async (png) => (await sharp(png).removeAlpha().raw().toBuffer())));
  let sum = 0, offPixels = 0;
  for (let i = 0; i < p.length; i += 3) {
    let worst = 0;
    for (let k = 0; k < 3; k++) { const d = Math.abs(p[i + k] - q[i + k]); sum += d; if (d > worst) worst = d; }
    if (worst > OFF) offPixels++;
  }
  return { mean: Number((sum / p.length).toFixed(3)), share: Number((offPixels / (p.length / 3)).toFixed(5)) };
}

/** Both back ends, every camera: the clean comparison, and with `plant` the planted one too. */
async function run(plant, out) {
  const live = serve('watch'), built = serve('dev');
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic', '--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
  try {
    const [liveUrl, builtUrl] = await Promise.all([live.url, built.url]);
    const watched = await shoot(browser, liveUrl, true, plant ? [PLANT] : []), [baked] = await shoot(browser, builtUrl, false);
    const baseline = readBaseline(), results = [];
    for (const [n, frames] of watched.entries()) {
      const rows = [];
      for (const [i, frame] of frames.entries()) {
        const score = await compare(frame.png, baked[i].png), base = baseline[frame.id] ?? { mean: 0, share: 0 };
        rows.push({ id: frame.id, ...score, red: score.mean > base.mean + MEAN || score.share > base.share + SHARE });
        if (out !== undefined) {
          writeFileSync(join(out, `${n > 0 ? 'planted-' : ''}${frame.id}-watch.png`), frame.png);
          if (n === 0) writeFileSync(join(out, `${frame.id}-build.png`), baked[i].png);
        }
      }
      results.push({ rows, red: rows.some((row) => row.red) });
    }
    return results;
  } finally { await browser.close(); live.stop(); built.stop(); }
}

/** The lamp-lit baseline (`cameras`), or for an engine pin whose grid draws no look lamps the unlit one (`unlitGrid`). */
function readBaseline(file = readBaselineFile()) { return (builtLights ? file.cameras : file.unlitGrid ?? file.cameras) ?? {}; }
function readBaselineFile() {
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { return {}; }
}

const line = (label, result) => `${label}: ${result.red ? 'RED' : 'green'} ${result.rows.map((row) => `${row.id} ${row.mean}/255 ${(row.share * 100).toFixed(2)}%${row.red ? ' (over its baseline)' : ''}`).join(', ')}`;
const out = values.out === undefined ? undefined : resolve(values.out);
if (out !== undefined) mkdirSync(out, { recursive: true });

async function main() {
  let results;
  try { results = await run(values.check === true, out); }
  catch (cause) {
    // an engine pin from before this sdk's dev hook serves no page watch can drive, and a machine with no client (offline, no
    // release asset) or no browser has nothing to compare: the check says so and passes. Only a comparison goes red.
    const message = cause instanceof Error ? cause.message : String(cause);
    if (values.check !== true || !/dev hook|dev client|engine release .* has no|fetch failed|browserType\.launch/u.test(message)) throw cause;
    console.info(`watch equals build: skipped, ${/(this engine client[^\n]*|the page's dev hook[^\n]*)/u.exec(message)?.[1] ?? message.split('\n')[0]}`);
    return;
  }
  const [clean, planted] = results;
  console.info(line('watch equals build', clean));
  if (!builtLights) console.info('watch equals build: this engine client draws no look lamps on the grid (QA 11-25 row 138): held to the unlit baseline');
  if (out !== undefined) writeFileSync(join(out, 'parity.json'), `${JSON.stringify(results, null, 2)}\n`);
  if (values.rebase === true) {
    const file = readBaselineFile(), measured = Object.fromEntries(clean.rows.map((row) => [row.id, { mean: row.mean, share: row.share }]));
    writeFileSync(BASELINE, `${JSON.stringify({ note: 'AP20: each camera\'s measured watch-against-build drift; parity.mjs --rebase writes it. unlitGrid: an engine pin whose grid draws no look lamps (before engine f837437c3, QA 11-25 row 138); drop it once the pin is past that', source: 'src/shards/authoring-slice',
      cameras: builtLights ? measured : file.cameras, ...(builtLights ? (file.unlitGrid === undefined ? {} : { unlitGrid: file.unlitGrid }) : { unlitGrid: measured }) }, null, 2)}\n`);
    console.info(`wrote ${BASELINE}`);
  } else if (clean.red) { console.error('watch equals build: the two back ends drifted past the baseline (parity.mjs --out <dir> writes the frames)'); process.exitCode = 1; }
  if (planted !== undefined) {
    console.info(line('planted roof difference', planted));
    if (!planted.red) { console.error('watch equals build: a planted material difference went unseen'); process.exitCode = 1; }
  }
}
await main();
