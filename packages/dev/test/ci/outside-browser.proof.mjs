// TC14 / SD3, SD24. Explicit Ring 2 observation, outside hook/test discovery.
// J186: a cold published 299 MB engine client and a native browser need Ring 2.
// The installed-author job separately covers build/validate/pack/upload/worker input.
/* oxlint-disable import/no-nodejs-modules -- This explicit Node proof owns the installed CLI and native browser lifecycle. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from '../../scripts/browser-playwright.mjs';
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

const STARTUP_MS = 120_000, BOOT_MS = 120_000, CASE_MS = STARTUP_MS + BOOT_MS + 40_000;

async function observeAuthorBrowser(context, empty, view = 'play') {
  const parent = resolve(process.env.WS_PROOF_SCRATCH ?? 'tmp/outside-browser');
  const baseReport = resolve(process.env.WS_BROWSER_REPORT ?? 'tmp/outside-browser-report');
  const report = view === 'explore' ? join(baseReport, 'explore') : empty ? baseReport : join(baseReport, 'default-reference');
  const slug = empty ? 'outside-browser' : 'reference-browser';
  mkdirSync(parent, { recursive: true }); mkdirSync(report, { recursive: true });
  const root = mkdtempSync(join(parent, 'author-')), app = join(root, 'app');
  const faults = [], exceptions = [], requests = [], delivered = [], receipt = { faults, requests, delivered };
  let browser, server, dev, devClosed, page, output = '';
  const cancellation = new AbortController();
  const abort = () => cancellation.abort(new Error('outside-author deadline'));
  // Two budgets (AD2): the dev server's start, which on a cold runner includes the one-time 347 MB dev
  // client download, then the browser boot on hosted software rendering (the default reference's modules
  // step alone stalls 21 s there). The test's timeout reserves 40 seconds past both for cleanup.
  let deadlineAt = performance.now() + STARTUP_MS + BOOT_MS;
  const remaining = () => Math.max(1, deadlineAt - performance.now());
  let deadline = setTimeout(abort, STARTUP_MS + BOOT_MS);
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
      const timer = setTimeout(() => reject(new Error(`dev startup timeout: ${output}`)), STARTUP_MS);
      function clear() { clearTimeout(timer); cancellation.signal.removeEventListener('abort', cancelled); }
      function cancelled() { clear(); reject(cancellation.signal.reason); }
      cancellation.signal.addEventListener('abort', cancelled, { once: true });
      if (cancellation.signal.aborted) cancelled();
      dev.once('error', error => { clear(); reject(error); });
      dev.once('exit', code => { clear(); reject(new Error(`dev exited ${code}: ${output}`)); });
      dev.stdout.on('data', bytes => {
        output += bytes;
        const walk = /wildshard dev: (http:\/\/\S+\?skipintro)\r?\n/u.exec(output)?.[1];
        const explore = /wildshard dev: explore \(fly, inspect\) (http:\/\/\S+\?explore=world)\r?\n/u.exec(output)?.[1];
        if (walk !== undefined && explore !== undefined) { clear(); _resolve({ walk, explore }); }
      });
      dev.stderr.on('data', bytes => { output += bytes; });
    });
    const links = await ready;
    clearTimeout(deadline); deadlineAt = performance.now() + BOOT_MS; deadline = setTimeout(abort, BOOT_MS);
    assert.equal(new URL(links.walk).origin, new URL(links.explore).origin);
    const url = new URL(view === 'explore' ? links.explore : links.walk); url.searchParams.set('mute', '1'); url.searchParams.set('nolock', '1'); url.searchParams.set('sw', '0');
    receipt.url = url.href;
    cancellation.signal.throwIfAborted();
    // Linux CI's implicit Vulkan SwiftShader can miss the real-time frame
    // budget; select the explicit ANGLE software path used by the diagnostic.
    server = await chromium.launchServer({ timeout: 15_000, headless: true, args: ['--use-mock-keychain', '--password-store=basic', '--mute-audio', ...(process.env.WS_BROWSER_SOFTWARE === '1' || process.platform === 'linux' ? ['--use-angle=swiftshader'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
    if (cancellation.signal.aborted) { server.process().kill('SIGKILL'); cancellation.signal.throwIfAborted(); }
    browser = await chromium.connect(server.wsEndpoint(), { timeout: 10_000 });
    page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    page.on('pageerror', error => { exceptions.push(error.message); faults.push(error.message); });
    // Two expected answers are not boot faults:
    // - engine FM5b reads /code-retention.json and takes a 404 as "unknown" (codeRetention.ts); a dev
    //   client carries no signed retention file;
    // - on hosted software rendering the engine's slow-load strip (slowLoad.ts) posts a non-fatal
    //   `boot.slow` report to /api/errors, which the GET-only dev server answers 405, and runs a
    //   `version.json?check=` connection read its own deadline may abort. They are kept in the receipt;
    // - the client's /api/telemetry beacon, which the GET-only dev server also answers 405.
    // Any other report, status or failed request stays a fault.
    const slow = receipt.slow = [], slowPosts = new WeakSet();
    const expected = (url, status) => {
      const path = new URL(url).pathname;
      return (status === 404 && path === '/code-retention.json') || (status === 405 && path === '/api/telemetry') ||
        (status === 405 && path === '/api/errors' && slow.length > 0);
    };
    page.on('request', request => {
      const parsed = new URL(request.url());
      if (parsed.pathname.startsWith('/shardfiles/')) requests.push(parsed.pathname);
      if (parsed.pathname !== '/api/errors' || request.method() !== 'POST') return;
      let report;
      try { report = JSON.parse(request.postData() ?? ''); } catch { report = undefined; }
      if (report?.system === 'boot.slow' && report.fatal === false) { slowPosts.add(request); slow.push(report.message); }
      else faults.push(`error report: ${request.postData()?.slice(0, 500)}`);
    });
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const at = message.location().url, status = /status of (\d{3})/u.exec(message.text())?.[1];
      if (at && status && expected(at, Number(status))) return;
      faults.push(message.text());
    });
    page.on('response', response => {
      const benign = slowPosts.has(response.request()) || expected(response.url(), response.status());
      if (response.status() >= 400 && !benign) faults.push(`HTTP ${response.status()} ${response.url()}`);
      const parsed = new URL(response.url());
      const authoredSection = parsed.pathname.startsWith(`/shardfiles/${slug}/sections/`) || parsed.pathname.startsWith('/sections/');
      if (parsed.origin === url.origin && authoredSection && response.ok()) delivered.push(parsed.pathname);
    });
    page.on('requestfailed', request => {
      const parsed = new URL(request.url()), failure = `request failed: ${request.url()} ${request.failure()?.errorText}`;
      if (slow.length > 0 && parsed.pathname === '/version.json' && parsed.searchParams.has('check')) slow.push(failure);
      else faults.push(failure);
    });
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // A fresh browser has never answered the Name: engine MP2.4 asks it once per
    // device before a page that came in by link joins the world (namePrompt.ts
    // askNameToJoin), so play as well as explore waits on it. Skip, as an
    // author would, keeping the device's own Name (AD2: since 11-20 the play
    // cases timed out on this prompt).
    const result = await page.waitForFunction(expected => {
      if (window.__wildshard?.state().appState === expected) return 'entered';
      const skip = document.querySelector('#ws-name-box [data-name=skip]');
      return skip?.getClientRects().length > 0 ? 'name' : false;
    }, view, { timeout: Math.max(1, remaining() - 5000) });
    if (await result.jsonValue() === 'name') {
      await page.locator('#ws-name-box [data-name=skip]').click({ timeout: remaining() });
    }
    // A cold generated world on hosted software rendering is a Ring 2 boot
    // proof, not an FPS benchmark. Both waits share the existing hard deadline.
    await page.waitForFunction(expected => window.__wildshard?.state().appState === expected, view, { timeout: Math.max(1, remaining() - 5000) });
    receipt.before = await page.evaluate(observation);
    await page.waitForFunction(({ frame, drawn }) => {
      const probe = window.__wildshard;
      return probe?.app.clock.frame > frame + 12 && probe?.world?.game.renderer.info.render.frame > drawn + 12;
    }, receipt.before, { timeout: remaining() });
    receipt.after = await page.evaluate(observation);
    const current = receipt.after;
    assert.equal(current.slug, slug); assert.equal(current.state, view);
    if (view === 'play') {
      assert.equal(current.entered, true); assert.equal(current.paused, false);
      assert.ok(current.player.health > 0);
      assert.ok(['x', 'y', 'z'].every(key => Number.isFinite(current.player.pos[key])));
    }
    assert.deepEqual(current.fatal, []);
    assert.deepEqual(view === 'play' ? faults : exceptions, []);
    assert.ok(delivered.length > 0, 'The intended dev server must successfully deliver authored sections');
    receipt.flags = await (await fetch(new URL('/build-flags.json', url), { signal: cancellation.signal })).json();
    assert.equal(receipt.flags.devserver, true);
    receipt.version = await (await fetch(new URL('/version.json', url), { signal: cancellation.signal })).json();
    receipt.enginePin = JSON.parse(readFileSync(resolve(bin, '../../package.json'), 'utf8')).dependencies['@wildshard/engine'];
    // A git pin names `#<sha>`; an npm `next` pin names `X.Y.Z-next.<sha7>` (since 11-20): both name the client's build.
    const commit = /#([0-9a-f]{40})$/u.exec(receipt.enginePin)?.[1] ?? /-next\.([0-9a-f]{7,40})$/u.exec(receipt.enginePin)?.[1];
    if (commit) assert.ok(receipt.version.build.startsWith(commit.slice(0, 7)), 'The published client must match the declared engine commit');
    else {
      receipt.versionLabel = await page.locator('.ws-update').textContent();
      assert.ok(receipt.versionLabel.toLowerCase().includes(`v${receipt.enginePin}`), 'The published client must name the declared engine version');
    }
    cancellation.signal.throwIfAborted();
    clearTimeout(deadline); // Frame progress is proved; artifact capture uses the reserved cleanup budget.
    // SwiftShader readback can wedge shutdown after a timed-out screenshot.
    // Real rendered-frame progress remains mandatory; PNG is optional evidence.
    if (current.renderer?.includes('SwiftShader')) receipt.screenshotSkipped = 'software renderer readback can stall shutdown';
    else {
      try { await page.screenshot({ path: join(report, 'outside-author.png'), timeout: 3_000 }); }
      catch (error) { receipt.screenshotError = String(error); }
    }
    receipt.verdict = 'pass';
  } catch (error) {
    receipt.verdict = 'fail'; receipt.error = String(error);
    if (page) {
      try {
        receipt.last = await page.evaluate(observation);
        receipt.page = await page.evaluate(() => ({
          inlineShard: document.getElementById('ws-shardfile') !== null,
          world: typeof window.__WS_WORLD__ === 'object',
          path: location.pathname + location.search,
          exploreMetadata: window.__wildshard?.shard?.explore !== undefined,
          copy: document.body.innerText.slice(0, 1200),
        }));
        await page.screenshot({ path: join(report, 'failure.png'), timeout: 3_000 });
      }
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
      } catch (error) {
        // A disposable software browser may hang during graceful GPU shutdown.
        // Playwright's kill waits for actual process exit; only a failed kill
        // is a cleanup failure. Preserve the forced-shutdown diagnostic.
        receipt.browserShutdown = { forced: true, gracefulError: String(error) };
        clearTimeout(timer);
        try {
          await Promise.race([server.kill(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('browser kill timeout')), 5_000); })]);
          const process = server.process();
          assert.ok(process.exitCode !== null || process.signalCode !== null, 'Owned browser process must actually exit');
          receipt.browserShutdown.exitCode = process.exitCode;
          receipt.browserShutdown.signalCode = process.signalCode;
        } catch (killError) { cleanup.push(String(killError)); server.process().kill('SIGKILL'); }
      }
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

test('the packed outside author boots its own shard in the published engine client', { timeout: CASE_MS }, context => observeAuthorBrowser(context, true));
// TC13: fresh default content uses the same packed CLI and published client.
// The real door/cross/save journey remains in new-reference.test.mjs.
test('the packed default new reference enters play in the published engine client', { timeout: CASE_MS }, context => observeAuthorBrowser(context, false));

// EX6: an outside author's new link opens the same packed client in its viewer.
test('the packed outside author explores the published engine client', { timeout: CASE_MS }, context => observeAuthorBrowser(context, false, 'explore'));
