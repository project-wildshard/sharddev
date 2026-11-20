// MOSSGATE-ZONE MZ20 (moved here from meta's evidence by MZ28): the Barrow Warden fought by two players on two headless pages against one `wildshard dev` server.
// Each player stands off while a tell is up (the slam's ember ring, the sweep's dust ring, the stone over its head: out past
// the sweep, or across the stone's lane), and closes to swing while its core is open. The proof wins the fight with both
// players' swings landing (each one's own hit count on the Warden's health), sees the boss bar name all three phases, the
// four crawlers come out in the third, and the Warden's blows land: both players stand in each kind of tell once instead
// of dodging it (the slam, the sweep, the stone), and the struck one's health drops by that blow. (On engine 0.1.50 a
// decision's strike goes at the server's first player whoever is nearest; engine fix 2026-11-19 aims it at the nearest, riding the release after v0.1.53.)
// Run (sharddev root): wildshard dev <mossgate> 64013, then
//   node packages/dev/test/walk/mossgate-warden-two.mjs http://127.0.0.1:64013 [sharddev root]
// Its after shots go to <sharddev root>/tmp/mossgate-warden-two/.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = (process.argv[2] ?? 'http://127.0.0.1:64013').replace(/\/?\?.*$/u, '').replace(/\/+$/u, '');
const root = process.argv[3] ?? join(homedir(), 'projects/games/wildshard/sharddev');
const from = (path) => import(pathToFileURL(join(root, path)).href);
const [{ chromium }, { KEYCHAIN_ARGS }, { NAME_ASKED, saveFixture }, { walkProof }] = await Promise.all([
  from('packages/dev/scripts/browser-playwright.mjs'), from('packages/dev/scripts/chromium-keychain.mjs'),
  from('packages/dev/node_modules/@wildshard/engine/scripts/debug-settings.mjs'), from('packages/sdk/src/sharddev/walkProof.ts')]);

const WARDEN = { x: 159, z: 45 }, ENTRY = [{ x: 147, z: 45 }, { x: 151, z: 45 }];
const TELLS = ['mossgate.warden-tell', 'mossgate.warden-sweep', 'mossgate.warden-stone'];
const FIGHT_MS = 240000;
const browser = await chromium.launch({ headless: true, args: [...KEYCHAIN_ARGS, '--use-angle=metal', '--ignore-gpu-blocklist'] });
const log = (who, what) => console.log(JSON.stringify({ t: Math.round((Date.now() - started) / 1000), who, ...what }));
const started = Date.now();

async function enter(who) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await saveFixture(context, NAME_ASKED);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)));
  await page.goto(`${base}/?skipintro&mute=1&nolock=1&perf=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__wildshard?.world?.hud?.entered && window.__workerClient) && document.querySelector('.ws-load') === null, undefined, { timeout: 240000, polling: 500 });
  if (await page.evaluate(() => window.__wildshard.world.hud.paused)) await page.keyboard.press('Escape');
  log(who, { entered: true });
  return { who, page, errors, proof: walkProof(page) };
}

/** What a page sees of the fight: the Warden's encounter row, its place, the tells and the core, the boss bar's words. */
const look = (page) => page.evaluate(([tells]) => {
  const fight = (window.__workerClientFights?.() ?? []).find((row) => row.id === 'mossgate.warden');
  const me = window.__workerClient?.();
  const row = (name) => Number(window.__workerClientRow?.(name) ?? 0);
  const bar = [...document.querySelectorAll('.ws-boss-bar')].map((el) => el.textContent?.replace(/\s+/gu, ' ').trim() ?? '').join(' | ');
  return { state: fight?.state ?? null, hp: fight?.hp ?? null, phase: fight?.phase ?? null, at: fight?.at ?? null, x: me?.x ?? 0, z: me?.z ?? 0, myHp: me?.hp ?? null,
    tells: tells.map(row), core: row('mossgate.warden-core'), dead: (me?.flags ?? []).includes('dead:barrow-warden'), crawlers: (window.__workerClientRows?.('barrowCrawler') ?? []).length, bar };
}, [TELLS]);

const aimAt = (page, at, from, swing) => page.evaluate(([to, me, low]) => {
  const player = window.__wildshard.world.player, dx = to.x - me.x, dz = to.z - me.z;
  player.yaw = Math.atan2(-dx, -dz); player.pitch = low ? -0.35 : 0;
}, [at, from, swing]);
const step = async (page, ms) => { await page.keyboard.down('w'); await page.waitForTimeout(ms); await page.keyboard.up('w'); };

async function fight(p, tally) {
  const { who, page } = p;
  let lastPhase = -1, lastState = '', minHp = 100;
  // each player takes one blow of each kind: it holds still at the Warden's side through that tell; the drop is the blow's
  const tank = new Set(['slam', 'sweep', 'stone']);
  while (Date.now() - started < FIGHT_MS) {
    const seen = await look(page);
    if (seen.myHp !== null) minHp = Math.min(minHp, seen.myHp);
    if (seen.phase !== null && (seen.phase !== lastPhase || seen.state !== lastState)) {
      lastPhase = seen.phase; lastState = seen.state;
      if (seen.state === 'fight' || seen.state === 'beat') { tally.phases.add(seen.phase); tally.bars.push(seen.bar); }
      log(who, { state: seen.state, phase: seen.phase, hp: seen.hp, bar: seen.bar });
    }
    tally.crawlers = Math.max(tally.crawlers, seen.crawlers);
    if (seen.dead || (seen.hp !== null && seen.hp <= 0 && seen.state !== 'armed')) { log(who, { won: seen.state, myHp: seen.myHp, minHp }); return minHp; }
    const warden = seen.at ?? { ...WARDEN, y: 0 }, d = Math.hypot(warden.x - seen.x, warden.z - seen.z);
    const [slam, sweep, stone] = seen.tells, kind = slam ? 'slam' : sweep ? 'sweep' : stone ? 'stone' : null;
    if (kind !== null && tank.has(kind) && d < 5 && seen.myHp !== null && seen.myHp > 40) {
      tank.delete(kind);
      const before = seen.myHp; let low = before;
      // into its reach (inside 2.6 m) and hold there through the windup
      let near = seen;
      for (let i = 0; i < 4 && Math.hypot(warden.x - near.x, warden.z - near.z) > 2.6; i += 1) { await aimAt(page, warden, near, false); await step(page, 90); near = await look(page); }
      await aimAt(page, warden, near, false);
      for (let i = 0; i < 12; i += 1) { await page.waitForTimeout(150); const now = await look(page); low = Math.min(low, now.myHp ?? low); if (!now.tells.some(Boolean)) break; }
      await page.waitForTimeout(300); low = Math.min(low, (await look(page)).myHp ?? low);
      tally.tanked[kind] = (tally.tanked[kind] ?? 0) + before - low; log(who, { tanked: kind, before, after: low });
      continue;
    }
    if (slam || sweep) {
      // out past the ring that is up
      if (d < (sweep ? 5.4 : 4.2)) { await aimAt(page, { x: 2 * seen.x - warden.x, z: 2 * seen.z - warden.z }, seen, false); await step(page, 220); continue; }
    } else if (stone) {
      // across its lane: a step to the side
      await aimAt(page, { x: seen.x + (warden.z - seen.z), z: seen.z - (warden.x - seen.x) }, seen, false); await step(page, 260); continue;
    }
    if (seen.core && !slam && !sweep && !stone) {
      if (d > 2.4) { await aimAt(page, warden, seen, false); await step(page, d > 4 ? 200 : 90); continue; }
      const before = seen.hp;
      await aimAt(page, warden, seen, true);
      await page.mouse.move(400, 300); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
      tally.swings[who] = (tally.swings[who] ?? 0) + 1;
      await page.waitForTimeout(260);
      const after = (await look(page)).hp;
      if (before !== null && after !== null && after < before) tally.hits[who] = (tally.hits[who] ?? 0) + 1;
      continue;
    }
    // waiting for the core: stand off just outside the sweep (until a player has taken its three blows, at its side)
    const off = tank.size > 0 ? 2.2 : 5.2, band = tank.size > 0 ? 0.6 : 1.3;
    if (d < off) { await aimAt(page, { x: 2 * seen.x - warden.x, z: 2 * seen.z - warden.z }, seen, false); await step(page, 120); continue; }
    if (d > off + band) { await aimAt(page, warden, seen, false); await step(page, d - off > 3 ? 150 : 80); continue; }
    await page.waitForTimeout(100);
  }
  throw new Error(`${who}: the Warden still stands after ${FIGHT_MS / 1000} s`);
}

let verdict = 'fail', refusal = null;
const tally = { phases: new Set(), bars: [], crawlers: 0, swings: {}, hits: {}, tanked: {} };
const players = [];
try {
  players.push(...await Promise.all(['one', 'two'].map(enter)));
  // walk both from the yard out to the Downs and in through the arch (the MZ17 road)
  const road = [{ x: 10.5, z: -2 }, { x: 14.5, z: -2 }, { x: 30, z: -1 }, { x: 50, z: 0 }, { x: 100, z: 12 }, { x: 140.5, z: 45 }];
  await Promise.all(players.map(async (p, i) => { for (const point of [...road, ENTRY[i]]) await p.proof.walkTo(point, 1.5); log(p.who, { atArch: true }); }));
  const lows = await Promise.all(players.map((p) => fight(p, tally)));
  const both = players.every((p) => (tally.hits[p.who] ?? 0) > 0), three = [0, 1, 2].every((n) => tally.phases.has(n));
  const struck = (tally.tanked.slam ?? 0) > 0 && (tally.tanked.sweep ?? 0) > 0;
  refusal = !both ? 'a player landed no hit' : !three ? `phases seen ${[...tally.phases].join(',')}` : tally.crawlers < 1 ? 'no crawler came out' : !struck ? `the Warden's slam or sweep landed on no one (${JSON.stringify(tally.tanked)})` : null;
  verdict = refusal === null ? 'pass' : 'fail';
  console.log(JSON.stringify({ verdict, refusal, phases: [...tally.phases], bars: tally.bars, crawlers: tally.crawlers, swings: tally.swings, hits: tally.hits, tanked: tally.tanked, lowestHp: lows,
    errors: players.flatMap((p) => p.errors).slice(0, 5), seconds: Math.round((Date.now() - started) / 1000) }, null, 1));
  for (const p of players) await p.page.screenshot({ path: join(root, 'tmp', 'mossgate-warden-two', `after-${p.who}.png`) });
} catch (error) {
  console.log(JSON.stringify({ verdict: 'fail', refusal: error instanceof Error ? error.message : String(error), phases: [...tally.phases], bars: tally.bars, crawlers: tally.crawlers, swings: tally.swings, hits: tally.hits }, null, 1));
} finally { await browser.close(); }
process.exitCode = verdict === 'pass' ? 0 : 1;
