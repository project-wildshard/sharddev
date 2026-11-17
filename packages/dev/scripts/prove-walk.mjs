#!/usr/bin/env node
// `wildshard prove <source> <walk.mjs> --base <dev url>`: play a walk proof (meta NEW-SHARD-E2E F27). A walk proof is a
// small script whose default export gets the walk helpers (src/sharddev/walkProof.ts) and plays the shard on a served page
// by real inputs: walk to an NPC, E to talk, a digit to answer, a click to swing; then it asserts what the server says
// (flags, quest steps). A tape (`prove <source> proof.json`) plays the headless simulation; a walk plays the page.
//
// Serve the shard first with `wildshard dev .` and pass the URL it prints. Headless Chromium on the real GPU (Metal), muted,
// 60 fps, never a visible window. Prints the steps and the server's final flags and quests as JSON; exit 1 on a refusal.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findShardSource } from '@wildshard/upload/sharddev/shardSource.ts';
import { walkProof, WalkProofError } from '../src/sharddev/walkProof.ts';

const USAGE = 'usage: wildshard prove <source> <walk.mjs> --base <url>  (serve the shard first: `wildshard dev .` prints its URL)';

/** The served root, so the URL `wildshard dev` prints (`…/?skipintro`) works as `--base`. */
function servedRoot(base) {
  const url = new URL(base); url.search = ''; url.hash = '';
  return url.href.replace(/\/+$/u, '');
}
/** True when `base` is a `wildshard dev` server: it answers its reload poll. */
async function isDevServer(base) {
  try {
    const response = await fetch(`${base}/__wildshard_dev_revision`, { cache: 'no-store' });
    return response.ok && typeof (await response.json()).revision === 'number';
  } catch { return false; }
}

/** Play `walk` against the shard served at `base`; returns the report (verdict pass or fail, never throws for the walk). */
export async function proveWalk(source, walk, given, { log = console.info } = {}) {
  const shard = findShardSource(source), script = resolve(walk), base = servedRoot(given);
  if (!existsSync(script)) throw new WalkProofError(`${walk}: no such walk script`);
  const { default: play } = await import(pathToFileURL(script).href);
  if (typeof play !== 'function') throw new WalkProofError(`${walk}: export default async function ({ talk, choose, expectFlags, ... }) { ... }`);
  if (!(await isDevServer(base))) throw new WalkProofError(`${given} is not a \`wildshard dev\` page (no /__wildshard_dev_revision); run \`wildshard dev ${source}\` and pass the URL it prints`);
  const [{ chromium }, { NAME_ASKED, saveFixture }, { KEYCHAIN_ARGS }] = await Promise.all([
    import("./browser-playwright.mjs"), import('@wildshard/engine/scripts/debug-settings.mjs'), import('./chromium-keychain.mjs')]);
  const started = Date.now(), errors = [];
  const browser = await chromium.launch({ headless: true, args: [...KEYCHAIN_ARGS, '--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
  let report;
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await saveFixture(context, NAME_ASKED);
    // the game at 60 fps, as a player's phone would run it
    await context.addInitScript(() => {
      const frame = window.requestAnimationFrame.bind(window); let last = 0;
      window.requestAnimationFrame = callback => frame(function tick(at) { if (at - last < 1000 / 60 - 1) return frame(tick); last = at; return callback(at); });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message.slice(0, 300)));
    log(`prove: entering ${base} (wildshard dev) for ${shard}`);
    await page.goto(`${base}/?skipintro&mute=1&nolock=1&perf=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__wildshard?.world?.hud?.entered && window.__workerClient) && document.querySelector('.ws-load') === null,
      undefined, { timeout: 240000, polling: 500 });
    if (await page.evaluate(() => window.__wildshard.world.hud.paused)) await page.keyboard.press('Escape');
    const proof = walkProof(page);
    let failure = null;
    try { await play({ ...proof, page }); } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    if (failure === null && errors.length > 0) failure = `page errors: ${errors.slice(0, 3).join(' | ')}`;
    const end = await proof.state().catch(() => null);
    report = { verdict: failure === null ? 'pass' : 'fail', ...(failure === null ? {} : { refusal: failure }), walk: script, base,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)), steps: proof.steps, flags: end?.flags ?? null, quests: end?.quests ?? null, errors };
    await context.close();
  } finally { await browser.close(); }
  return report;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [source, walk, flag, base] = process.argv.slice(2);
  if (source === undefined || walk === undefined || flag !== '--base' || base === undefined) { console.error(USAGE); process.exit(2); }
  try {
    const report = await proveWalk(source, walk, base, { log: line => console.error(line) });
    console.info(JSON.stringify(report, null, 2));
    if (report.verdict !== 'pass') {
      console.error(`${report.refusal}\n  [proof-failed] fix: Walk the quest in \`wildshard dev\`, then fix the data or the walk step that did not happen. (GUIDE.md#walk-proofs)`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof WalkProofError ? `${error.message}\n  [proof-failed] ${USAGE}` : error);
    process.exitCode = 1;
  }
}
