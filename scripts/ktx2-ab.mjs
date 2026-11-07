#!/usr/bin/env node
import { debugSettings, harnessPins } from '@wildshard/engine/scripts/debug-settings.mjs';
// ktx2-ab.mjs — the E157 A/B: the same poses in each shard with the images and the KTX2 textures (the `textures` harness pin, G386),
// on the iPhone portrait the user judges on (iPhone 16 Pro UA, 390×844 @3, touch, the phone tier) — or, `--tier=desktop`
// (E173), the desktop's 1600×900 @1 landscape, the desktop tier. Every DOM layer but the
// game canvas is hidden, the clock is held (`tod` + a day of ~3 years), the weather clear; per pose the player is spawned,
// the loop runs 4 s, then stops drawing (game.frameGate) and the frozen frame is captured.
//
// Wind, animals and the weapon's idle sway still differ between two page loads, so each shard is captured TWICE with the
// images (`img`, `img2`): their difference is the run-to-run floor the KTX2 difference is read against (ktx2-ab-board.py).
//
//   node scripts/ktx2-ab.mjs --url=http://localhost:4760 --out=<dir> [--shards=pine-hollow,nalati-grasslands,driftwood-isle] [--modes=img,img2,ktx2] [--tier=phone|desktop] [--viewport=phone]
//
// One headless Chromium on Metal, muted (`--mute-audio`, `mute=1`), closed at the end. Writes <out>/<shard>-<pose>-<mode>.png.
import { readShards } from '@wildshard/engine/scripts/shards.mjs';
import { mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const { chromium, devices } = await import('playwright');
const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const URL_BASE = flag('url', 'http://localhost:4760');
const OUT = resolvePath(flag('out', 'ktx2-ab'));
const manifests = await readShards();
const SHARDS = flag('shards', manifests.filter((m) => m.status === 'live' || m.status === 'earlyAccess').map((m) => m.slug).join(',')).split(',');
const MODES = flag('modes', 'img,img2,ktx2').split(',');
const TIER = flag('tier', 'phone');
/** --viewport=phone: the iPhone portrait frame whatever the tier (a desktop-tier board for the phone-portrait review) */
const VIEW = flag('viewport', TIER);
mkdirSync(OUT, { recursive: true });

/** per shard: the held time of day and the poses. `x, z, yaw` spawn the player (yaw faces (-sin, -cos)); `pitch` looks down */
const SHARD = {
  'pine-hollow': {
    q: 'tod=0.45&weather=clear',
    poses: [
      { id: 'hollow', x: 6, z: 4, yaw: 2.8, pitch: -0.08 },
      { id: 'ground', x: 6, z: 4, yaw: 2.8, pitch: -1.05 },
      { id: 'stones', x: 140, z: -30, yaw: -1.5708, pitch: -0.2 },
      { id: 'bark', x: 118, z: -118, yaw: 3.6, pitch: 0.05 },
    ],
  },
  'nalati-grasslands': {
    q: 'tod=0.45&weather=clear',
    poses: [
      { id: 'spawn', pitch: -0.05 },
      { id: 'ground', pitch: -1.0 },
      { id: 'turn', yawAdd: 2.2, pitch: -0.25 },
    ],
  },
  'driftwood-isle': {
    q: 'tod=0.45',
    poses: [
      { id: 'spawn', pitch: -0.05 },
      { id: 'sand', pitch: -1.0 },
      { id: 'turn', yawAdd: 2.6, pitch: -0.2 },
    ],
  },
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const browser = await chromium.launch({ args: ['--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const iphone = devices['iPhone 16 Pro'];
  for (const shard of SHARDS) {
    const spec = SHARD[shard] ?? { q: 'tod=0.45', poses: [{ id: 'spawn', pitch: -0.05 }] };
    for (const mode of MODES) {
      const tex = mode.startsWith('img') ? 'img' : 'ktx2';
      const ctx = await browser.newContext(VIEW === 'phone'
        ? { userAgent: iphone.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 3, viewport: { width: 390, height: 844 } }
        : { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
      // the textures are a harness pin (`__wildshardHarness.textures`, G386), never a setting or URL switch; no background prefetch
      await debugSettings(ctx, { prefetch: 'off' });
      await harnessPins(ctx, { textures: tex });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
      const url = `${URL_BASE}/?chunk=${shard}&mute=1&skipintro=1&nolock=1&sw=0&tier=${TIER}${TIER === 'phone' ? '&touch=1' : ''}&clock=100000000&${spec.q}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.__wildshard?.world?.game && window.__wildshard.world.player), undefined, { timeout: 300000, polling: 500 });
      await sleep(8000);
      const start = await page.evaluate(() => {
        const w = window.__wildshard?.world;
        const st = document.createElement('style');
        st.textContent = 'body *{visibility:hidden!important} canvas.__game{visibility:visible!important}';
        w.game.renderer.domElement.classList.add('__game');
        document.head.append(st);
        window.__gate = w.game.frameGate;
        return { x: w.player.position.x, z: w.player.position.z, yaw: w.player.yaw ?? 0 };
      });
      for (const p of spec.poses) {
        await page.evaluate(([pp, s]) => {
          const w = window.__wildshard?.world;
          w.game.frameGate = window.__gate;
          w.player.spawn(pp.x ?? s.x, pp.z ?? s.z, (pp.yaw ?? s.yaw) + (pp.yawAdd ?? 0));
          w.player.pitch = pp.pitch ?? 0;
        }, [p, start]);
        await sleep(4000);
        await page.evaluate(() => { window.__wildshard.world.game.frameGate = () => false; });
        await sleep(250);
        await page.screenshot({ path: resolvePath(OUT, `${shard}-${p.id}-${mode}.png`) });
      }
      console.log(`[ab] ${shard} ${mode}: ${spec.poses.length} poses${errors.length > 0 ? ` · errors: ${errors.slice(0, 3).join(' / ')}` : ''}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
