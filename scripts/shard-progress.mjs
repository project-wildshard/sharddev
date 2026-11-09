#!/usr/bin/env node
import { KEYCHAIN_ARGS } from './chromium-keychain.mjs';
// shard-progress.mjs — one progress capture of a shard (E387, Jake 2026-10-02: "progress photos and progress videos and
// time lapse videos of shard five and shard six being built … we definitely should").
//
// Shoots the shard's fixed progress cameras (`art/<slug>/progress/cameras.json`) on a served build, iPhone portrait
// (390×844 @3, phone tier, touch HUD), and records one short real-resolution clip (canvas.captureStream, the memory note
// "game video capture"): a slow orbit around the clip's centre. Every run writes the same frames, so
// `scripts/shard-timelapse.py <slug>` can line them up into time-lapses.
//
//   scripts/serve-build.sh --name prog          # → http://127.0.0.1:<port>/ (or serve an export of an older SHA)
//   scripts/browser-lane.sh --max 20 node scripts/shard-progress.mjs --shard=sunscar-dunes --url=http://127.0.0.1:<port> \
//     --sha=<sha the build is> [--label="loop 3"] [--no-clip] [--no-qa] [--qa-wait=120] [--qa-force=<shot id>]
//
// Capture QA (E394): after the shots, scripts/decide/decide.sh asks the local Clef-flash model whether each frame shows
// the 3D world or a loading screen, title card, menu or blank frame (~1 s a frame, under the model lock). A flagged shot is
// re-taken once with a longer settle and checked again; meta.json's `qa` records each shot's answer and the re-takes.
// The check is skipped (and says so in meta.json) when the model or its venv is missing or the lock stays busy past
// --qa-wait seconds. --qa-force=<id> treats one shot as flagged, to exercise the re-take path.
//
// Output: progress/<slug>/<YYYYMMDD-HHMM>-<sha8>/<shot>.jpg (780×1688, ≤ ~300 KB), clip.mp4 (540 px wide), meta.json.
// The stamp is the commit's date (git), so a back-filled old SHA sorts where it belongs.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { saveFixture } from '@wildshard/engine/scripts/debug-settings.mjs';
import { browserBakeBytes } from '@wildshard/engine/scripts/bake-output.mjs';
import { recordProgressClip } from '@wildshard/engine/scripts/progress-recording.mjs';
import { uploadRecordedClip } from '@wildshard/engine/scripts/model-spin-recording.mjs';

const { chromium } = await import('playwright');
const ROOT = resolvePath(new URL('..', import.meta.url).pathname);
const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const SLUG = flag('shard', '');
const URL_BASE = flag('url', '');
if (!SLUG || !URL_BASE) { console.error('usage: shard-progress.mjs --shard=<slug> --url=<served build> --sha=<sha> [--label=…] [--no-clip]'); process.exit(2); }
const SHA = execFileSync('git', ['rev-parse', flag('sha', 'HEAD')], { cwd: ROOT, encoding: 'utf8' }).trim();
const LABEL = flag('label', '');
const CLIP = !argv.includes('--no-clip');
const QA = !argv.includes('--no-qa');
const QA_WAIT = Number(flag('qa-wait', '120'));
const QA_FORCE = argv.filter((a) => a.startsWith('--qa-force=')).map((a) => a.slice('--qa-force='.length));
/** --cameras=<file>: another cameras file (a test of the harness); default the shard's committed one */
const CAMS = JSON.parse(readFileSync(flag('cameras', join(ROOT, 'art', SLUG, 'progress', 'cameras.json')), 'utf8'));
const when = execFileSync('git', ['show', '-s', '--format=%cd', '--date=format:%Y%m%d-%H%M', SHA], { cwd: ROOT, encoding: 'utf8' }).trim();
/** --root=<dir>: write the capture there instead of the repo's progress/ (a scratch comparison, E397) */
const OUT = join(flag('root', join(ROOT, 'progress')), SLUG, `${when}-${SHA.slice(0, 8)}`);
mkdirSync(OUT, { recursive: true });
// one temp folder per run: two runs of the same shard at the same SHA (the lead's and a builder's) shared one, and the
// first to finish deleted it under the other (two council captures stopped half-way, E399)
mkdirSync(join(ROOT, 'tmp'), { recursive: true });
const TMP = mkdtempSync(join(ROOT, 'tmp', `shard-progress-${SLUG}-${SHA.slice(0, 8)}-`));
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const D = Math.PI / 180;

/** a full-res PNG → a 780 px wide JPEG in the progress folder */
const store = (png, name) => {
  const src = join(TMP, `${name}.png`); writeFileSync(src, png);
  execFileSync('sips', ['-Z', '1688', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', src, '--out', join(OUT, `${name}.jpg`)], { stdio: 'ignore' });
};

/**
 * Capture QA (E394): decide.sh's `qa` over the named frames. Returns per-shot answers, or a reason the check was skipped.
 * The sidecars it writes (<shot>.qa.json) are folded into meta.json and removed, so the progress folder keeps its shape.
 * @param {string[]} ids @param {string[]} force
 * @returns {{ skipped: string | null, shots: Record<string, { screen: string, pWorld: number, flagged: boolean }> }}
 */
const checkFrames = (ids, force) => {
  const decide = join(ROOT, 'scripts', 'decide', 'decide.sh');
  const args = ['qa', ...force.flatMap((id) => ['--force-flag', id]), ...ids.map((id) => join(OUT, `${id}.jpg`))];
  const r = spawnSync(decide, args, { encoding: 'utf8', env: { ...process.env, DECIDE_LOCK_WAIT: String(QA_WAIT) } });
  if (r.status !== 0 && r.status !== 3) {
    return { skipped: r.status === 75 ? `the model lock stayed busy for ${QA_WAIT} s` : `decide.sh exited ${String(r.status)}: ${r.stderr.trim().slice(0, 200)}`, shots: {} };
  }
  /** @type {Record<string, { screen: string, pWorld: number, flagged: boolean }>} */
  const shots = {};
  for (const id of ids) {
    const side = join(OUT, `${id}.qa.json`);
    if (!existsSync(side)) continue;
    const q = JSON.parse(readFileSync(side, 'utf8'));
    shots[id] = { screen: q.answers.screen.choice, pWorld: q.answers.screen.probabilities.world, flagged: q.flagged };
    rmSync(side);
  }
  return { skipped: null, shots };
};

/** @type {import('playwright').Browser|undefined} */
let browser;
const errors = [], shots = [];
try {
  browser = await chromium.launch({ args: [...KEYCHAIN_ARGS, '--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await saveFixture(ctx, { scope: 'device', key: 'devMode', data: true }); // experimental shards enter only in developer mode
  // the probe's `pose` control needs the harness object (as the parity runner installs it)
  await ctx.addInitScript(() => { window.__wildshardHarness = { seed: 0x2545f491, capture: null, lane: 'local', sha: '', browser: 'chromium', errors: [], saves: { read: [], written: [] }, audioRequests: [], gpuBytes: () => ({ textures: 0, renderbuffers: 0, buffers: 0, total: 0 }) }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  const t0 = Date.now();
  await page.goto(`${URL_BASE}/?chunk=${SLUG}&tier=phone&touch=1&mute=1&nolock=1&sw=0&skipintro=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.wsState === 'error'
    || (Boolean(window.__wildshard?.world?.player && window.__wildshard?.world?.game) && document.querySelector('.ws-load') === null),
  undefined, { timeout: 480000, polling: 1000 });
  // the game showed its error modal (a caught boot error leaves the load screen up): stop now with its text, not at 480 s
  if (await page.evaluate(() => document.documentElement.dataset.wsState === 'error')) {
    const text = await page.evaluate(() => document.body.textContent.slice(0, 600));
    throw new Error(`the game failed to load (app state 'error'):\n${text}`);
  }
  const loadS = Math.round((Date.now() - t0) / 1000);
  await sleep(6000);
  store(await page.screenshot({ type: 'png' }), 'first-frame'); shots.push('first-frame');
  // a free camera posed last in the frame (after the player's), the viewmodel hidden; null = the player's own view
  await page.evaluate(() => {
    const w = window.__wildshard.world, cam = w.game.camera;
    try { w.animals.calm = true; } catch { /* a shard without animals */ }
    window.__prog = null;
    // what a free-camera shot changed, put back when the player's view returns (sky-reach, E399: after an aerial the
    // viewmodel stayed hidden and the fov stayed 72 for every later first-person shot)
    const hidden = new Set(); let fov = null;
    w.game.onLate(() => {
      const v = window.__prog;
      if (!v) {
        if (hidden.size > 0) { for (const c of hidden) c.visible = true; hidden.clear(); }
        if (fov !== null) { cam.fov = fov; cam.updateProjectionMatrix(); fov = null; }
        return;
      }
      if (fov === null) fov = cam.fov;
      cam.position.set(v.pos[0], v.pos[1], v.pos[2]); cam.up.set(0, 1, 0); cam.lookAt(v.look[0], v.look[1], v.look[2]);
      if (Math.abs(cam.fov - v.fov) > 0.01) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
      for (const c of cam.children) if (c.visible) { c.visible = false; hidden.add(c); }
      cam.updateMatrixWorld(true);
    });
  });
  const hud = (on) => page.evaluate((v) => { const h = document.getElementById('hud'); if (h) h.style.visibility = v ? '' : 'hidden'; }, on);
  const staged = {};
  // each shot's real camera (round 4: a new knoll lifted a view 1.1 m with no cameras.json change, so the round's camera
  // list missed it); the council's camera diff compares these, not only the requested poses
  const camAt = {};
  /** one progress shot: stage, pose (or a free camera), settle, check the floor, store; a re-take passes a longer settle
   * @param {any} s @param {number} [settle] */
  const shoot = async (s, settle) => {
    // creatures are calmed so they don't fill the frame; a shot whose subject IS a creature in action (a boss's stalk)
    // sets `"calm": false`, since calm cancels the behaviour (mockup council round 1, seat A)
    await page.evaluate((calm) => { try { window.__wildshard.world.animals.calm = calm; } catch { /* no animals */ } }, s.calm !== false);
    // E399: a shot may stage real quest state first (`stage`), through the shard's exposed handle (`expose` at the top of
    // cameras.json): e.g. the waymarks lit, the state a player reaches. Recorded in meta.json for the council to check.
    if (s.stage !== undefined) {
      const ok = await page.evaluate(([name, stage]) => {
        const h = window.__wildshard.shard?.[name];
        if (typeof h?.stage !== 'function') return false;
        h.stage(stage); return true;
      }, [CAMS.expose, s.stage]);
      if (!ok) errors.push(`shot ${s.id}: no stage() on __wildshard.shard.${String(CAMS.expose)}`);
      staged[s.id] = s.stage;
    }
    if (s.god) {
      await page.evaluate((g) => { window.__prog = g; }, { fov: 72, ...s.god }); await hud(false);
    } else {
      await page.evaluate(async (p) => { window.__prog = null; const pl = window.__wildshard.world.player; try { pl.health = pl.maxHealth ?? 100; } catch { /* */ } await window.__wildshard.pose(p); },
        { x: s.x, z: s.z, yaw: s.yaw * D, pitch: (s.pitch ?? -4) * D, ...(s.y === undefined ? {} : { y: s.y }) });
      await hud(true);
    }
    await sleep(settle ?? s.settle ?? 3000);
    if (!s.god) { // a pose with no floor under it falls and respawns: flag it rather than store a wrong frame silently
      const at = await page.evaluate(() => { const q = window.__wildshard.world.player.position; return [q.x, q.z]; });
      if (Math.hypot(at[0] - s.x, at[1] - s.z) > 4) errors.push(`shot ${s.id}: the player is at (${at.map((v) => v.toFixed(1)).join(', ')}), not (${s.x}, ${s.z}): no floor there?`);
    }
    camAt[s.id] = await page.evaluate(() => { const c = window.__wildshard.world.game.camera, d = c.getWorldDirection(c.position.clone()); return { pos: [c.position.x, c.position.y, c.position.z].map((v) => Math.round(v * 100) / 100), dir: [d.x, d.y, d.z].map((v) => Math.round(v * 1000) / 1000), fov: Math.round(c.fov * 10) / 10 }; }).catch(() => null);
    store(await page.screenshot({ type: 'png' }), s.id);
  };
  for (const s of CAMS.shots) { await shoot(s); shots.push(s.id); }
  // capture QA (E394): a frame that is not the 3D world is re-taken once, with a longer settle
  /** @type {{ set: string, skipped: string | null, retaken: string[], shots: Record<string, any> }} */
  const qa = { set: 'capture-status', skipped: QA ? null : '--no-qa', retaken: [], shots: {} };
  if (QA) {
    const first = checkFrames(shots, QA_FORCE);
    qa.skipped = first.skipped; qa.shots = first.shots;
    // first-frame is the spawn view before any pose, so it is recorded but not re-taken
    const again = CAMS.shots.filter((/** @type {any} */ x) => first.shots[x.id]?.flagged);
    for (const s of again) { await shoot(s, (s.settle ?? 3000) * 2 + 3000); qa.retaken.push(s.id); }
    if (again.length > 0) {
      const second = checkFrames(qa.retaken, []);
      for (const id of qa.retaken) qa.shots[id] = { ...second.shots[id], firstTake: first.shots[id] };
      if (second.skipped) qa.skipped = `re-take check: ${second.skipped}`;
    }
    const still = Object.entries(qa.shots).filter(([, v]) => v.flagged).map(([k]) => k);
    if (still.length > 0) errors.push(`capture QA: not the 3D world after a re-take: ${still.join(', ')}`);
  }
  // the clip: a slow orbit, recorded from the canvas at its real resolution
  if (CLIP && CAMS.clip) {
    await hud(false);
    const clip = await page.evaluate(recordProgressClip, CAMS.clip), webm = join(TMP, 'clip.webm');
    try {
      const sink = await browserBakeBytes(page, { maxBytes: Math.max(1, clip.bytes), maxFiles: 1 });
      try {
        await page.evaluate(uploadRecordedClip, { source: clip.url, destination: `${sink.url}clip` });
        const bytes = sink.take('clip');
        if (bytes.byteLength !== clip.bytes) throw new Error('Recorded clip byte count changed');
        writeFileSync(webm, bytes);
      } finally { await sink.dispose(); }
    } finally { await page.evaluate(source => { URL.revokeObjectURL(source); }, clip.url); }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-vf', 'scale=540:-2,format=yuv420p', '-c:v', 'libx264', '-b:v', '900k', '-maxrate', '1200k', '-bufsize', '2400k', '-r', '30', '-movflags', '+faststart', join(OUT, 'clip.mp4')]);
  }
  // the compiled programs after every view was drawn (E397: a program-key collision shows up as a lower count)
  const programs = await page.evaluate(() => window.__wildshard.world.game.renderer?.info?.programs?.length ?? null).catch(() => null);
  writeFileSync(join(OUT, 'meta.json'), `${JSON.stringify({ shard: SLUG, sha: SHA, when, label: LABEL, loadSeconds: loadS, shots, clip: CLIP && Boolean(CAMS.clip), programs, staged, camAt, qa, active: CAMS.shots.filter((x) => x.calm === false).map((x) => x.id), cameras: execFileSync('git', ['hash-object', flag('cameras', join(ROOT, 'art', SLUG, 'progress', 'cameras.json'))], { encoding: 'utf8' }).trim(), pageErrors: errors }, null, 1)}\n`);
  console.log(`progress: ${OUT.slice(ROOT.length + 1)} · ${shots.length} shots${CLIP && CAMS.clip ? ' + clip' : ''} · load ${loadS} s · qa ${qa.skipped ? `skipped (${qa.skipped})` : `${Object.values(qa.shots).filter((v) => v.flagged).length} flagged, re-taken: ${qa.retaken.join(', ') || 'none'}`}${errors.length > 0 ? ` · ${errors.length} page errors` : ''}`);
} finally {
  try { await browser?.close(); }
  finally { rmSync(TMP, { recursive: true, force: true }); }
}
