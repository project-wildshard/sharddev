#!/usr/bin/env node
// SHARD-SOURCE AP6 (and AP7's shots): drive a running `wildshard watch` (or `dev`) page in headless Chromium.
//
//   node src/sharddev/watch/proof.mjs --url http://127.0.0.1:<port>/ --out <dir> [--shots] [--time <file> --runs 10]
//
// --shots   three cleanroom cameras (Mossgate `scripts/cameras.json`: hut front, hut back, pond) to <out>/<id>.png
// --time    edits <file> `runs` times and times each write to the first frame the page draws with the edit (the page
//           script's `framedAt`, same machine clock); it checks the page never reloaded, the frame loop never stopped and
//           the player never moved, and writes <out>/<prefix>proof.json. The file is restored after.
// --edit    what --time edits (SHARD-SOURCE AP6, AP17): `roof` (a material colour, the default), `fog` (density), `exposure`
//           (the grade), `sun` (the key light's direction), `ambient` (the hemisphere's intensity), `lamp` (a point light's
//           intensity), `hill` (AP18: ground under the player), each a line of the authoring slice's `generators/world.ts`;
//           `quest` (AP19: the slice quest's objective, in `generators/shard.ts`), read from the page's own text.
// --fps     the page's frame cap (default 60: GPU benches share Jake's laptop; 0 leaves it uncapped)
// --motion  at the yard camera: frames 0.2 s apart; the flame (pulse), the near fern (sway) and the page's point lights
//           (flicker) must change with no shard code in the page (SHARD-SOURCE AP12); numbers to <out>/proof.json
// --draws   at each camera, the frame's draws (Game.lastFrame.calls, every pass) and the same with the shadow map held,
//           so view and shadow draws split, plus the props' distinct materials in the scene and the fps (SHARD-SOURCE AP8)
// --throttle N  slows the page's CPU N times (a phone stand-in: --url '<page>?tier=phone' --throttle 4)
import { chromium } from 'playwright';
// oxlint-disable-next-line import/no-nodejs-modules -- a node script: it writes the shots and the timing beside the source edit.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- a node script resolves its output folder.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- a node script reads its flags.
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { url: { type: 'string' }, out: { type: 'string' }, shots: { type: 'boolean' }, motion: { type: 'boolean' }, draws: { type: 'boolean' }, throttle: { type: 'string' }, time: { type: 'string' }, runs: { type: 'string' }, prefix: { type: 'string' }, edit: { type: 'string' }, fps: { type: 'string' } } });
if (values.url === undefined || values.out === undefined) throw new Error('usage: proof.mjs --url <page> --out <dir> [--shots] [--time <file> --runs N]');
const OUT = resolve(values.out), RUNS = Number(values.runs ?? 10), PREFIX = values.prefix ?? '';
mkdirSync(OUT, { recursive: true });
// Mossgate cleanroom scripts/cameras.json: [x, z, yaw, pitch], eye 1.68 m, vertical FOV 72
const CAMERAS = [['03-hut-front', -3.9, -5.6, 0.03, -0.04], ['05-door-lamp', -4.6, -7.8, 0.03, 0.05], ['04-hut-back', -3.9, -10.4, 3.4, -0.05], ['08-pond', -10.4, 0.3, 1.571, -0.08], ['yard-brazier', 2.6, -8.2, -0.62, 0.02], ['10-sky-sun', -10.4, 0.3, -0.31, 0.14]];
// 10-sky-sun: from the pond toward the low sun, the painted sky and its clouds (SHARD-SOURCE AP14)
// yard-brazier: the slice's brazier A (5.9, -12.8), its fire, sparks and ferns (SHARD-SOURCE AP10 to AP12)
const colourOf = (i) => ((0x40 + i * 17) << 16 | (0x90 - i * 7) << 8 | (0x30 + i * 13)).toString(16).padStart(6, '0');
/** The page's roof colour (page code, passed as text). */
const ROOF_HEX = `() => { let hex = null; window.__wildshard.world.game.rootScene.getObjectByName('devScene')?.traverse((o) => { if (o.material?.name === 'roof') hex = o.material.color.getHexString(); }); return hex; }`;
/** Each edit: the line it rewrites, its i-th value, and (optionally) a page reader whose value must equal `expect(i)`. */
const EDITS = {
  roof: { line: /shingle: new THREE\.MeshStandardMaterial\(\{ name: 'roof', (?:color: 0x[0-9a-f]{6}, )?map: tex\.shingle, roughness: 0\.95 \}\),/u,
    write: (i) => `shingle: new THREE.MeshStandardMaterial({ name: 'roof', color: 0x${colourOf(i)}, map: tex.shingle, roughness: 0.95 }),`, read: ROOF_HEX, expect: colourOf },
  fog: { line: /FogExp2\(new THREE\.Color\('#d898a0'\), [0-9.]+\)/u, write: (i) => `FogExp2(new THREE.Color('#d898a0'), ${(0.0040 + i * 0.0005).toFixed(4)})` },
  exposure: { line: /world\.post\(\{ tone: 'aces', exposure: [0-9.]+,/u, write: (i) => `world.post({ tone: 'aces', exposure: ${(0.8 + i * 0.06).toFixed(2)},` },
  sun: { line: /key\.position\.set\(-?[0-9.]+, 30, 34\)/u, write: (i) => `key.position.set(${-30 + i * 6}, 30, 34)` },
  ambient: { line: /new THREE\.Color\('#7a6a3c'\), [0-9.]+\)\);/u, write: (i) => `new THREE.Color('#7a6a3c'), ${(0.55 + i * 0.07).toFixed(2)}));` },
  lamp: { line: /new THREE\.PointLight\('#ffa040', [0-9.]+, 6\.5, 1\.4\)/u, write: (i) => `new THREE.PointLight('#ffa040', ${(4 + i * 0.7).toFixed(1)}, 6.5, 1.4)` },
  // AP18: a flat-topped hill (5 m top, 8 m foot) raised under the player at the first camera, a little higher each edit; the
  // page counts once the player's feet stand on its top, and again a second later (they did not fall through)
  hill: { line: /y \+= far \* \(noise\.fbm\(x \* 0\.02 \+ 50, z \* 0\.02 \+ 50, 3\) - 0\.35\) \* 7;(?: y \+= [0-9.]+ \* Math\.min\(1, Math\.max\(0, \(8 - Math\.hypot\(x \+ 3\.9, z \+ 5\.6\)\) \/ 3\)\);)?/u,
    write: (i) => `y += far * (noise.fbm(x * 0.02 + 50, z * 0.02 + 50, 3) - 0.35) * 7; y += ${(0.2 + i * 0.3).toFixed(1)} * Math.min(1, Math.max(0, (8 - Math.hypot(x + 3.9, z + 5.6)) / 3));`,
    read: '() => Math.round(window.__wildshard.world.player.position.y * 20) / 20', expect: (i) => Math.round((0.2 + i * 0.3) * 20) / 20, held: true },
};
// AP19: the quest's objective, as the page's quest panel says it once the simulation restarted on the new rows
EDITS.quest = { line: /objective: 'Walk down to the pond(?: \(\d+\))?'/u, write: (i) => `objective: 'Walk down to the pond (${i})'`,
  read: '() => /walk down to the pond \\(\\d+\\)/iu.exec(document.body.innerText)?.[0].toLowerCase() ?? null', expect: (i) => `walk down to the pond (${i})` };
const EDIT = EDITS[values.edit ?? 'roof'];
const FPS = Number(values.fps ?? 60);
if (EDIT === undefined) throw new Error(`--edit: one of ${Object.keys(EDITS).join(', ')}`);

const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic', '--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const result = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // engine's probe controls (pose) answer only a harness-pinned page (engine scripts/debug-settings.mjs harnessPins)
  await page.addInitScript({ content: 'window.__wildshardHarness=Object.assign(window.__wildshardHarness??{},{seed:357});' });
  // the lane rule's 60 fps cap: a frame's callbacks run together, at most one frame per 1/FPS s
  if (FPS > 0) await page.addInitScript({ content: `(() => { const raf = window.requestAnimationFrame.bind(window), gap = 1000 / ${FPS} - 1; let at = -1e9;
    window.requestAnimationFrame = (run) => raf(function held(t) { if (t !== at && t - at < gap) { raf(held); return; } at = t; run(t); }); })();` });
  page.on('pageerror', (error) => { console.error(`page error: ${error.message}`); });
  if (values.throttle !== undefined) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(values.throttle) });
  await page.goto(`${values.url}${values.url.includes('?') ? '&' : '?'}skipintro`);
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

  if (values.draws === true) {
    // median of 20 drawn frames' whole-frame draw count (the composer's passes included)
    const sample = `new Promise((done) => { const g = window.__wildshard.world.game, seen = []; const stop = g.watchFrames(() => { seen.push(g.lastFrame.calls); if (seen.length >= 20) { stop(); seen.sort((a, b) => a - b); done(seen[10]); } }); })`;
    result.draws = [];
    for (const [id, x, z, yaw, pitch] of CAMERAS) {
      await page.evaluate(async (pose) => { await window.__wildshard.pose(pose); }, { x, z, yaw, pitch });
      await page.waitForTimeout(2500);
      const total = await page.evaluate(sample);
      await page.evaluate(() => { const s = window.__wildshard.world.game.renderer.shadowMap; s.autoUpdate = false; s.needsUpdate = false; });
      const view = await page.evaluate(sample);
      await page.evaluate(() => { window.__wildshard.world.game.renderer.shadowMap.autoUpdate = true; });
      result.draws.push({ id, total, view, shadow: total - view });
      console.info(`draws ${id}: ${total} (view ${view}, shadow ${total - view})`);
    }
    result.materials = await page.evaluate(() => { const seen = new Set(); window.__wildshard.world.game.rootScene.traverse((o) => { if (o.isMesh && o.visible) for (const m of [o.material].flat()) seen.add(m.uuid); }); return seen.size; });
    console.info(`${result.materials} distinct mesh materials in the scene`);
    result.fps = await page.evaluate(`new Promise((done) => { const w = window.__wildshard.world, t0 = Date.now(); let n = 0; const stop = w.game.watchFrames(() => { n++; if (Date.now() - t0 >= 5000) { stop(); done(Math.round(n / ((Date.now() - t0) / 1000))); } }); })`);
    console.info(`fps ${result.fps} (headless, 5 s at the last camera)`);
  }

  if (values.motion === true) {
    const yard = CAMERAS.find(([id]) => id === 'yard-brazier') ?? CAMERAS[0];
    await page.evaluate(async (pose) => { await window.__wildshard.pose(pose); }, { x: yard[1], z: yard[2], yaw: yard[3], pitch: yard[4] });
    await page.waitForTimeout(2500);
    // regions at 1280x720: the fire's cards, the fern at the left edge, and still ground beside them (the control)
    const regions = { flame: [560, 250, 160, 170], fern: [0, 500, 100, 220], still: [880, 560, 160, 100] };
    const { default: sharp } = await import('sharp');
    const crop = (png, [left, top, width, height]) => sharp(png).extract({ left, top, width, height }).raw().toBuffer();
    const lamps = () => { const out = []; window.__wildshard.world.game.rootScene.traverse((o) => { if (o.isPointLight && o.intensity > 0) out.push(o.intensity); }); return out; };
    const frames = [];
    for (let i = 0; i < 4; i++) { frames.push({ png: await page.screenshot(), lamps: await page.evaluate(`(${lamps.toString()})()`) }); await page.waitForTimeout(200); }
    result.motion = {};
    for (const [name, box] of Object.entries(regions)) {
      let sum = 0, n = 0;
      for (let i = 1; i < frames.length; i++) {
        const a = await crop(frames[i - 1].png, box), b = await crop(frames[i].png, box);
        for (let k = 0; k < a.length; k++) sum += Math.abs(a[k] - b[k]);
        n += a.length;
      }
      result.motion[name] = Number((sum / n).toFixed(2));
    }
    const first = frames[0].lamps, changed = frames.slice(1).some((f) => f.lamps.some((v, k) => Math.abs(v - (first[k] ?? v)) > 1e-4));
    result.motion.lamps = { count: first.length, changed };
    result.motion.shardCode = await page.evaluate(() => Object.keys(globalThis).filter((k) => /^__wsShard|shardModule/u.test(k)));
    await page.screenshot({ path: join(OUT, `${PREFIX}motion.png`) });
    // AP11: the bloom catches the fire: the glow round it with the page's bloom on, less with it set to 0 for a frame
    const ring = [520, 200, 240, 300];
    const mean = async (png) => { const px = await crop(png, ring); let t = 0; for (const v of px) t += v; return t / px.length; };
    const bloomOn = await page.evaluate(() => window.__wildshard.world.game.post?.bloom?.intensity ?? null);
    if (bloomOn !== null && bloomOn > 0) {
      const lit = await mean(await page.screenshot());
      await page.evaluate(() => { window.__wildshard.world.game.post.bloom.intensity = 0; });
      await page.waitForTimeout(300);
      const dark = await mean(await page.screenshot());
      await page.evaluate((v) => { window.__wildshard.world.game.post.bloom.intensity = v; }, bloomOn);
      result.motion.bloom = { intensity: bloomOn, glow: Number((lit - dark).toFixed(2)) };
    } else result.motion.bloom = { intensity: bloomOn, glow: 0 };
    console.info(`bloom ${JSON.stringify(result.motion.bloom)} (mean of 255 round the fire, on minus off)`);
    console.info(`motion: flame ${result.motion.flame}, fern ${result.motion.fern}, still ${result.motion.still} (mean |frame step| of 255), ${first.length} lamps lit, intensities change: ${changed}`);
  }

  if (values.time !== undefined) {
    if (!watched) throw new Error('--time needs a `wildshard watch` page');
    const file = resolve(values.time), original = readFileSync(file, 'utf8');
    if (!EDIT.line.test(original)) throw new Error(`--time: ${file} has no ${values.edit ?? 'roof'} line to edit`);
    await page.evaluate(async (pose) => { await window.__wildshard.pose(pose); window.__ap6Marker = 'same page'; }, { x: CAMERAS[0][1], z: CAMERAS[0][2], yaw: CAMERAS[0][3], pitch: CAMERAS[0][4] });
    await page.waitForTimeout(2000);
    const runs = [];
    try {
      for (let i = 0; i < RUNS; i++) {
        // the first edit's value is a change from the file's own (i = 0 may equal it), so count from 1
        const value = i + 1, written = EDIT.write(value);
        if (EDIT.line.exec(readFileSync(file, 'utf8'))?.[0] === written) throw new Error(`--time: edit ${value} writes the line as it is`);
        const before = await page.evaluate(() => ({ revision: window.__wsDevScene.framedRevision, frames: window.__wsDevScene.frames, at: window.__wildshard.world.player.position.toArray() }));
        const at = Date.now();
        writeFileSync(file, original.replace(EDIT.line, written));
        const handle = await page.waitForFunction(([revision, expected, read]) => {
          const report = window.__wsDevScene;
          if (report.framedRevision <= revision) return false;
          // eslint-disable-next-line no-new-func -- the reader is passed in as text
          return read === null || new Function(`return (${read})()`)() === expected ? report.framedAt : false;
        }, [before.revision, EDIT.expect?.(value) ?? null, EDIT.read ?? null], { timeout: 30_000, polling: 'raf' });
        const framedAt = await handle.jsonValue();
        const after = await page.evaluate(() => ({ frames: window.__wsDevScene.frames, at: window.__wildshard.world.player.position.toArray(), marker: window.__ap6Marker, kind: window.__wsDevScene.kind ?? null, restart: window.__wsDevScene.restart ?? null, steps: { ...window.__wsDevScene.steps } }));
        const moved = Math.hypot(...after.at.map((v, k) => v - before.at[k]));
        // the page's own steps, from the file write: its state received, its parts fetched, swapped in, the first frame after
        const steps = after.steps === undefined ? null : { seen: after.steps.seen - at, sent: after.steps.sent - at, received: after.steps.received - at, fetched: after.steps.fetched - at, swapped: after.steps.swapped - at, framed: framedAt - at };
        // a ground edit: still standing on it a second later
        let held = null;
        if (EDIT.held === true) { await page.waitForTimeout(1000); held = await page.evaluate(`(${EDIT.read})()`) === EDIT.expect(value); }
        runs.push({ value: written, ms: framedAt - at, frames: after.frames - before.frames, moved: Number(moved.toFixed(4)), reloaded: after.marker !== 'same page', kind: after.kind, steps, ...(after.kind === 'gameplay' ? { restart: after.restart } : {}), ...(held === null ? {} : { held }) });
        console.info(`edit ${value}: ${written} on screen in ${framedAt - at} ms${after.kind === null ? '' : ` (${after.kind})`}${after.kind === 'gameplay' && after.restart !== null ? ` [server restart ${after.restart.serverMs} ms, quest views ${after.restart.questsMs} ms]` : ''}${steps === null ? '' : ` [seen ${steps.seen}, sent ${steps.sent}, received ${steps.received}, fetched ${steps.fetched}, swapped ${steps.swapped}]`}`);
        await page.waitForTimeout(400);
      }
    } finally { writeFileSync(file, original); }
    const sorted = runs.map((r) => r.ms).sort((a, b) => a - b), median = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    result.timing = { edit: values.edit ?? 'roof', runs, median, min: sorted[0], max: sorted.at(-1), reloads: runs.filter((r) => r.reloaded).length, maxMoved: Math.max(...runs.map((r) => r.moved)), frameLoopStopped: runs.some((r) => r.frames <= 0),
      ...(EDIT.held === true ? { stood: runs.filter((r) => r.held === true).length } : {}) };
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, `${PREFIX}timing-last.png`) });
    console.info(`median ${median} ms (min ${sorted[0]}, max ${sorted.at(-1)}), reloads ${result.timing.reloads}, player moved ≤ ${result.timing.maxMoved} m${result.timing.stood === undefined ? '' : `, still on the hill 1 s later in ${result.timing.stood} of ${runs.length}`}`);
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, `${PREFIX}proof.json`), `${JSON.stringify(result, null, 2)}\n`);
}
