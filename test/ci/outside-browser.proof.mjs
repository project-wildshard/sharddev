// TC14 / SD3, SD24. Explicit Ring 2 observation, outside hook/test discovery.
// J186: a cold published 299 MB engine client and a native browser need Ring 2.
// The installed-author job separately covers build/validate/pack/upload/worker input.
/* oxlint-disable import/no-nodejs-modules -- This explicit Node proof owns the installed CLI and native browser lifecycle. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { installWildshard } from '../../src/test/helpers/install.ts';

function observation() {
  const probe = window.__wildshard, game = probe?.world?.game, state = probe?.state();
  const gl = game?.renderer.getContext(), debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return { slug: probe?.shard?.slug, state: state?.appState, frame: probe?.app.clock.frame,
    drawn: game?.renderer.info.render.frame, player: state?.player,
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
    entered: probe?.world?.hud.entered, paused: probe?.world?.hud.paused,
    fatal: [...document.querySelectorAll('#wserr,.ws-load-error,.ws-game-dev-alert,[data-boot-fatal]')].map(node => node.textContent) };
}

async function observeAuthorBrowser(context, empty) {
  const parent = resolve(process.env.WS_PROOF_SCRATCH ?? 'tmp/outside-browser');
  const baseReport = resolve(process.env.WS_BROWSER_REPORT ?? 'tmp/outside-browser-report');
  const report = empty ? baseReport : join(baseReport, 'default-reference');
  const slug = empty ? 'outside-browser' : 'reference-browser';
  mkdirSync(parent, { recursive: true }); mkdirSync(report, { recursive: true });
  const root = mkdtempSync(join(parent, 'author-')), app = join(root, 'app');
  const faults = [], requests = [], delivered = [], receipt = { faults, requests, delivered };
  let browser, server, dev, devClosed, page, output = '';
  const cancellation = new AbortController();
  const abort = () => cancellation.abort(new Error('outside-author deadline'));
  const deadline = setTimeout(abort, 80_000); // reserve 40 seconds for bounded operations and cleanup
  const stop = () => { dev?.kill('SIGTERM'); server?.process().kill('SIGTERM'); };
  cancellation.signal.addEventListener('abort', stop, { once: true });
  context.signal.addEventListener('abort', abort, { once: true });
  try {
    const bin = installWildshard(root), project = join(app, 'isle');
    const env = { ...process.env, WILDSHARD_GEN_CACHE: join(root, 'generation'), WILDSHARD_SHARDFILE_CACHE: join(root, 'compiler') };
    // No WILDSHARD_DEV_CLIENT[_URL] substitute: the package's actual engine pin selects its published client.
    delete env.WILDSHARD_DEV_CLIENT; delete env.WILDSHARD_DEV_CLIENT_URL;
    const fresh = spawnSync(process.execPath, [bin, 'new', project, slug, ...(empty ? ['--empty'] : [])], { cwd: app, env, encoding: 'utf8', timeout: 15_000 });
    assert.ifError(fresh.error); assert.equal(fresh.status, 0, `${fresh.stdout}\n${fresh.stderr}`);
    dev = spawn(process.execPath, [bin, 'dev', join(project, 'src')], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'] });
    devClosed = new Promise(_resolve => { dev.once('close', _resolve); });
    const ready = new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`dev startup timeout: ${output}`)), 45_000);
      function clear() { clearTimeout(timer); cancellation.signal.removeEventListener('abort', cancelled); }
      function cancelled() { clear(); reject(cancellation.signal.reason); }
      cancellation.signal.addEventListener('abort', cancelled, { once: true });
      if (cancellation.signal.aborted) cancelled();
      dev.once('error', error => { clear(); reject(error); });
      dev.once('exit', code => { clear(); reject(new Error(`dev exited ${code}: ${output}`)); });
      dev.stdout.on('data', bytes => { output += bytes; const found = /wildshard dev: (http:\/\/\S+)/u.exec(output); if (found) { clear(); _resolve(found[1]); } });
      dev.stderr.on('data', bytes => { output += bytes; });
    });
    const url = new URL(await ready); url.searchParams.set('mute', '1'); url.searchParams.set('nolock', '1'); url.searchParams.set('sw', '0');
    receipt.url = url.href;
    cancellation.signal.throwIfAborted();
    // Linux CI's implicit Vulkan SwiftShader can miss the real-time frame
    // budget; select the explicit ANGLE software path used by the diagnostic.
    server = await chromium.launchServer({ timeout: 15_000, headless: true, args: ['--use-mock-keychain', '--password-store=basic', '--mute-audio', ...(process.env.WS_BROWSER_SOFTWARE === '1' || process.platform === 'linux' ? ['--use-angle=swiftshader'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
    if (cancellation.signal.aborted) { server.process().kill('SIGKILL'); cancellation.signal.throwIfAborted(); }
    browser = await chromium.connect(server.wsEndpoint(), { timeout: 10_000 });
    page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    page.on('pageerror', error => faults.push(error.message));
    page.on('console', message => { if (message.type() === 'error') faults.push(message.text()); });
    page.on('response', response => {
      if (response.status() >= 400) faults.push(`HTTP ${response.status()} ${response.url()}`);
      const parsed = new URL(response.url());
      if (parsed.origin === url.origin && parsed.pathname.startsWith(`/shardfiles/${slug}/sections/`) && response.ok()) delivered.push(parsed.pathname);
    });
    page.on('requestfailed', request => faults.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));
    page.on('request', request => { const parsed = new URL(request.url()); if (parsed.pathname.startsWith('/shardfiles/')) requests.push(parsed.pathname); });
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__wildshard?.state().appState === 'play', undefined, { timeout: 30_000 });
    receipt.before = await page.evaluate(observation);
    await page.waitForFunction(({ frame, drawn }) => {
      const probe = window.__wildshard;
      return probe?.app.clock.frame > frame + 12 && probe?.world?.game.renderer.info.render.frame > drawn + 12;
    }, receipt.before, { timeout: 10_000 });
    receipt.after = await page.evaluate(observation);
    const current = receipt.after;
    assert.equal(current.slug, slug); assert.equal(current.state, 'play');
    assert.equal(current.entered, true); assert.equal(current.paused, false);
    assert.ok(current.player.health > 0);
    assert.ok(['x', 'y', 'z'].every(key => Number.isFinite(current.player.pos[key])));
    assert.deepEqual(current.fatal, []); assert.deepEqual(faults, []);
    assert.ok(delivered.length > 0, 'The intended dev server must successfully deliver authored sections');
    receipt.flags = await (await fetch(new URL('/build-flags.json', url), { signal: cancellation.signal })).json();
    assert.equal(receipt.flags.devserver, true);
    receipt.version = await (await fetch(new URL('/version.json', url), { signal: cancellation.signal })).json();
    receipt.enginePin = JSON.parse(readFileSync(resolve(bin, '../../package.json'), 'utf8')).dependencies['@wildshard/engine'];
    const commit = /#([0-9a-f]{40})$/u.exec(receipt.enginePin)?.[1];
    if (commit) assert.ok(receipt.version.build.startsWith(commit.slice(0, 7)), 'The published client must match the declared engine commit');
    else {
      receipt.versionLabel = await page.locator('.ws-update').textContent();
      assert.ok(receipt.versionLabel.toLowerCase().includes(`v${receipt.enginePin}`), 'The published client must name the declared engine version');
    }
    await page.screenshot({ path: join(report, 'outside-author.png') });
    receipt.verdict = 'pass';
  } catch (error) {
    receipt.verdict = 'fail'; receipt.error = String(error);
    if (page) {
      try { receipt.last = await page.evaluate(observation); await page.screenshot({ path: join(report, 'failure.png'), timeout: 3_000 }); }
      catch (diagnostic) { receipt.diagnosticError = String(diagnostic); }
    }
    throw error;
  }
  finally {
    clearTimeout(deadline);
    context.signal.removeEventListener('abort', abort);
    cancellation.signal.removeEventListener('abort', stop);
    const cleanup = [];
    // Keep each cleanup independent so the primary error and receipt survive a failed close.
    if (server) {
      let timer;
      try {
        await Promise.race([server.close(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('browser close timeout')), 5_000); })]);
      } catch (error) { cleanup.push(String(error)); server.process().kill('SIGKILL'); }
      finally { clearTimeout(timer); }
    }
    if (dev) {
      dev.kill('SIGTERM');
      const kill = setTimeout(() => dev.kill('SIGKILL'), 3_000);
      let timer;
      try {
        await Promise.race([devClosed, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('dev close timeout')), 6_000); })]);
      } catch (error) { cleanup.push(String(error)); }
      finally { clearTimeout(kill); clearTimeout(timer); }
    }
    receipt.cleanup = cleanup;
    if (cleanup.length > 0) receipt.verdict = 'fail';
    writeFileSync(join(report, 'dev.log'), output);
    writeFileSync(join(report, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    rmSync(root, { recursive: true, force: true });
    if (!receipt.error) assert.deepEqual(cleanup, [], 'Owned resources must close');
  }
}

test('the packed outside author boots its own shard in the published engine client', { timeout: 120_000 }, context => observeAuthorBrowser(context, true));
// TC13: fresh default content uses the same packed CLI and published client.
// The real door/cross/save journey remains in new-reference.test.mjs.
test('the packed default new reference enters play in the published engine client', { timeout: 120_000 }, context => observeAuthorBrowser(context, false));
