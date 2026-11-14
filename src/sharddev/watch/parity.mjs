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
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '../../..');
const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string' }, check: { type: 'boolean' }, rebase: { type: 'boolean' } } });
const SOURCE = resolve(values.source ?? join(ROOT, 'src/shards/authoring-slice'));
const BASELINE = join(import.meta.dirname, 'parity-baseline.json');
// The slice's own cameras (Mossgate cleanroom scripts/cameras.json): [id, x, z, yaw, pitch]
const CAMERAS = [['hut-front', -3.9, -5.6, 0.03, -0.04], ['door-lamp', -4.6, -7.8, 0.03, 0.05], ['hut-back', -3.9, -10.4, 3.4, -0.05], ['pond', -10.4, 0.3, 1.571, -0.08]];
/** The eye's height (m): the cameras' 1.68 m over the slice's ground, which is flat at 0 by every camera. */
const EYE = 1.68;
/** Red over the baseline by these, at any camera. Two clean runs differ by under 0.002/255; the planted roof adds over 1/255. */
const MEAN = 0.25, SHARE = 0.005, OFF = 24;

/** Start `wildshard <command> <source> 0` and resolve its page URL; `stop` kills the child. */
function serve(command) {
  const child = spawn(process.execPath, [join(ROOT, 'bin/wildshard.mjs'), command, SOURCE, '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
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
    await page.goto(`${url}?skipintro`);
    await page.waitForFunction((watched) => window.__wildshard?.world?.player !== undefined && (!watched || (window.__wsDevScene?.framedRevision ?? 0) > 0),
      live, { timeout: 180_000, polling: 500 });
    await page.evaluate(() => {
      const w = window.__wildshard.world, camera = w.game.camera;
      if (w.animals) w.animals.calm = true;
      // the camera leaves the player (whose body stands where colliders put it, which this test does not compare): each
      // frame it is set to the shot's eye, one field of view, no viewmodel
      w.freeCamera = true;
      w.game.onLate(() => {
        const eye = window.__ap20Eye;
        for (const child of camera.children) child.visible = false;
        if (Math.abs(camera.fov - 72) > 0.01) { camera.fov = 72; camera.updateProjectionMatrix(); }
        if (eye !== undefined) { camera.position.set(eye[0], eye[1], eye[2]); camera.rotation.set(eye[4], eye[3], 0, 'YXZ'); camera.updateMatrixWorld(true); }
      }, 'ap20.camera');
    });
    const sets = [];
    for (const change of [null, ...after]) {
      if (change !== null) await page.evaluate(change);
      const frames = [];
      for (const [id, x, z, yaw, pitch] of CAMERAS) {
        await page.evaluate((eye) => { window.__ap20Eye = eye; }, [x, EYE, z, yaw, pitch]);
        await page.waitForTimeout(2500);
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

function readBaseline() {
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')).cameras ?? {}; } catch { return {}; }
}

const line = (label, result) => `${label}: ${result.red ? 'RED' : 'green'} ${result.rows.map((row) => `${row.id} ${row.mean}/255 ${(row.share * 100).toFixed(2)}%${row.red ? ' (over its baseline)' : ''}`).join(', ')}`;
const out = values.out === undefined ? undefined : resolve(values.out);
if (out !== undefined) mkdirSync(out, { recursive: true });

async function main() {
  let results;
  try { results = await run(values.check === true, out); }
  catch (cause) {
    // an engine pin from before this sdk's dev hook serves no page watch can drive: the check says so and passes
    const message = cause instanceof Error ? cause.message : String(cause);
    if (values.check !== true || !/dev hook/u.test(message)) throw cause;
    console.info(`watch equals build: skipped, ${/(this engine client[^\n]*|the page's dev hook[^\n]*)/u.exec(message)?.[1] ?? 'no client with this sdk\'s dev hook'}`);
    return;
  }
  const [clean, planted] = results;
  console.info(line('watch equals build', clean));
  if (out !== undefined) writeFileSync(join(out, 'parity.json'), `${JSON.stringify(results, null, 2)}\n`);
  if (values.rebase === true) {
    writeFileSync(BASELINE, `${JSON.stringify({ note: 'AP20: each camera\'s measured watch-against-build drift; parity.mjs --rebase writes it', source: 'src/shards/authoring-slice',
      cameras: Object.fromEntries(clean.rows.map((row) => [row.id, { mean: row.mean, share: row.share }])) }, null, 2)}\n`);
    console.info(`wrote ${BASELINE}`);
  } else if (clean.red) { console.error('watch equals build: the two back ends drifted past the baseline (parity.mjs --out <dir> writes the frames)'); process.exitCode = 1; }
  if (planted !== undefined) {
    console.info(line('planted roof difference', planted));
    if (!planted.red) { console.error('watch equals build: a planted material difference went unseen'); process.exitCode = 1; }
  }
}
await main();
