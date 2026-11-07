#!/usr/bin/env node
// Plain post-build bake: browser-lane.sh node --experimental-transform-types
// --import ./scripts/shard-platform-format.mjs scripts/entry-reads/crawl.ts
// --base=http://127.0.0.1:4400 --pin=<landed full SHA> [--shards=a,b]
// A fresh context per region/tier walks the maintained declared entry. No new
// Vite plugin, constructor shortcut, admission root or readiness claim is used.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import * as v from 'valibot';
import { crawlEntryReadSet, entryDemandUrls, type EntryCrawlDemand, type EntryCrawlRegion } from '@wildshard/sharddev/entryReads';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { parseOutputIndex } from '@wildshard/format/outputIndex';
import type { RegionEntryReads } from '@wildshard/format/entryReads';
import { saveFixture, harnessPins } from '@wildshard/engine/scripts/debug-settings.mjs';
import { entryReadsFile } from '@wildshard/engine/scripts/shard-public.mjs';
import { frameFloorSettingsCode } from '@wildshard/engine/scripts/frame-floor-settings.mjs';
import { floorGridBenchmarkUrl, FLOOR_GRID_ENTER } from '@wildshard/engine/scripts/frame-floor-navigation.mjs';
import { gridFloorPlans, gridFloorDeclaredPlan, gridFloorDocumentIdentity, stageFloorGrid, driveFloorGrid,
  gridFloorWitnessFailures, floorGridEntryRoute, type FloorGridWitness, type FloorGridState } from '@wildshard/engine/scripts/frame-floor-grid.mjs';

const stateSchema = v.object({ home: v.string(), pitch: v.pipe(v.number(), v.finite(), v.minValue(501)),
  cells: v.array(v.object({ instance: v.string(), slug: v.string(), cell: v.tuple([v.number(), v.number()]) })) });
const spansSchema = v.array(v.object({ name: v.string(), startTime: v.number(), duration: v.number() }));
const versionSchema = v.object({ build: v.string() });
const stateCode = 'window.__wildshard.shard.grid.state()';
const readyCode = 'window.__wildshard?.shard?.grid?.state().live?.live?.gameplayReady === true';
const arg = (key: string): string | undefined => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const base = arg('base'), pin = arg('pin'), network = arg('network') ?? 'local';
if (!['local', 'fast4g-crossing'].includes(network)) throw new Error('Unknown entry crawl network');
if (base === undefined || pin === undefined || !/^[a-f0-9]{40}$/u.test(pin)) throw new Error('Requires --base and --pin=<landed full SHA>');
const origin = new URL(base);
if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('HTTP preview required');
const out = arg('out'), requested = arg('shards')?.split(',');
if (requested?.some(slug => !/^_?[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))) throw new Error('Canonical shard names required');
const versionResponse = await fetch(new URL('/version.json', origin));
if (!versionResponse.ok) throw new Error('Preview identity unavailable');
const version = v.parse(versionSchema, await versionResponse.json());
if (!version.build.startsWith(pin.slice(0, 7))) throw new Error('Preview differs from the requested pin');
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const { defaultBrowserType: _type, ...phone } = devices['iPhone 16 Pro'];

async function contextFor(host: Browser, tier: RegionEntryReads['tier']): Promise<BrowserContext> {
  const context = await host.newContext(phone);
  await context.addInitScript({ content: frameFloorSettingsCode({ tier, fps: 'auto' }) });
  await saveFixture(context, { scope: 'global', key: 'gfx', data: { dpr: '2', aa: 'auto' } });
  await saveFixture(context, { scope: 'device', key: 'devMode', data: true });
  await harnessPins(context, { seed: 357, browser: 'Chromium / iPhone 16 Pro', lane: 'entry-read-bake' });
  // A previous optional hint must not prewarm the crawl and erase its own input.
  // Actual asset, worker and product responses stay unchanged.
  await context.route('**/assets/*/entry-reads.json', route => route.fulfill({ status: 404, body: '' }));
  return context;
}
async function openGrid(page: Page, fresh: boolean): Promise<void> {
  await page.goto(floorGridBenchmarkUrl(origin.href), { waitUntil: 'load' });
  if (fresh) await page.locator('.ws-main-grid').click();
  await page.waitForFunction(readyCode, undefined, { timeout: 240_000 });
  await page.evaluate(FLOOR_GRID_ENTER);
  await page.waitForFunction('!document.querySelector("#hud")?.classList.contains("ws-grid-revealing")', undefined, { timeout: 30_000 });
}
async function catalogue(): Promise<v.InferOutput<typeof stateSchema>> {
  const context = await contextFor(browser, 'phone');
  try { const page = await context.newPage(); await openGrid(page, true); return v.parse(stateSchema, await page.evaluate(stateCode)); }
  finally { await context.close(); }
}
try {
  const declared = await catalogue(), cells = declared.cells.filter(cell => requested === undefined || requested.includes(cell.slug));
  if (cells.length === 0 || requested?.some(slug => !cells.some(cell => cell.slug === slug))) throw new Error('Requested entry missing from the served grid');
  const entries: EntryCrawlRegion[] = cells.map(cell => ({ region: cell.instance, at: [0, 0] }));
  const index = new Map<string, ReturnType<typeof parseOutputIndex>>();
  for (const slug of new Set(cells.map(cell => cell.slug))) {
    const response = await fetch(new URL(`/shardfiles/${slug}/shard.json`, origin));
    if (!response.ok) throw new Error(`Entry descriptor unavailable: ${slug}`);
    index.set(slug, parseOutputIndex(await response.json()));
  }
  const productFailures: unknown[] = [];
  for (const productSlug of new Set(cells.map(cell => cell.slug))) {
    const regions = new Set(cells.filter(cell => cell.slug === productSlug).map(cell => cell.instance));
    try {
      const rows = await crawlEntryReadSet(entries.filter(entry => regions.has(entry.region)), {
        read: async url => {
          const response = await fetch(new URL(url, origin), { headers: { 'accept-encoding': 'identity' } });
          if (!response.ok) throw new Error(`Entry body refused: ${response.status} ${url}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          for (const [slug, product] of index) {
            const file = product.files.find(row => url.split('?')[0] === `/shardfiles/${slug}/${row.path}`);
            if (file !== undefined && (bytes.length !== file.compressed || hashImmutableBytes(bytes) !== file.hash)) throw new Error('Crawled product body differs from its descriptor');
          }
          return bytes;
        },
        visit: async (entry, tier, read) => {
          const cell = cells.find(row => row.instance === entry.region), source = cell === undefined ? undefined : index.get(cell.slug);
          if (cell === undefined || source === undefined) throw new Error('Crawl region lacks its descriptor');
          const home = declared.cells.find(row => row.slug === '_template' && row.instance !== cell.instance)
            ?? declared.cells.find(row => row.slug === 'driftwood-isle' && row.instance !== cell.instance);
          if (home === undefined) throw new Error('Crawl requires a distinct cold source');
          const context = await contextFor(browser, tier), demands: (EntryCrawlDemand & { readonly at: number })[] = [];
          try {
            const catalogueId = JSON.stringify({ pitch: declared.pitch, cells: declared.cells.map(row => [row.instance, row.slug, ...row.cell]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
            await saveFixture(context, { scope: 'session', key: 'grid.recovery.once', once: 'entry-read-cold-source', data: {
              instance: home.instance, slug: home.slug, catalogue: catalogueId, at: Date.now(), reason: 'reload',
              road: { x: home.cell[0] * declared.pitch + declared.pitch / 2 + 3.6, z: home.cell[1] * declared.pitch, yaw: 0 } } });
            const page = await context.newPage(), errors: string[] = [];
            const cdp = await context.newCDPSession(page);
            if (network === 'fast4g-crossing') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
            page.on('pageerror', error => { errors.push(error.stack ?? error.message); });
            context.on('request', request => {
              const url = new URL(request.url());
              if (url.origin !== origin.origin || !['/assets/', `/shardfiles/${cell.slug}/blobs/`].some(prefix => url.pathname.startsWith(prefix))) return;
              const { range } = request.headers();
              demands.push({ url: `${url.pathname}${url.search}`, at: Date.now(), ...(range === undefined ? {} : { range }) });
            });
            await openGrid(page, false);
            const state = await page.evaluate(stateCode) as FloorGridState;
            if (state.home !== home.instance || state.live.live.residents.includes(cell.instance)) throw new Error('Crawl target is not a cold entry');
            if (network === 'fast4g-crossing') {
              await cdp.send('Network.enable');
              await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
            }
            const identity = await page.evaluate(gridFloorDocumentIdentity), route = floorGridEntryRoute(gridFloorPlans(state, 'cell', { cell: cell.instance, roadApproach: true }), cell.instance);
            for (const plan of [...route.setup, route.entry]) {
              const live = await page.evaluate(stateCode) as FloorGridState, resolved = await gridFloorDeclaredPlan(page, live, plan);
              await page.evaluate(`(${stageFloorGrid.toString()})(${JSON.stringify(resolved)},${JSON.stringify(identity)},(${driveFloorGrid.toString()}))`);
              const witness = await page.evaluate<FloorGridWitness>(`(${driveFloorGrid.toString()})(${JSON.stringify(resolved)},${JSON.stringify(identity)})`);
              const failures = gridFloorWitnessFailures(witness);
              if (failures.length > 0) throw new Error(`Entry crawl refused: ${failures.join('; ')}`);
            }
            if (errors.length > 0) throw new Error(`Entry crawl page errors: ${errors.join('; ')}`);
            const timeOrigin = v.parse(v.number(), await page.evaluate('performance.timeOrigin'));
            const spans = v.parse(spansSchema, await page.evaluate('performance.getEntriesByType("measure").map(row=>({name:row.name,startTime:row.startTime,duration:row.duration}))'));
            const spansForEntry = spans.filter(row => row.name === `wildshard.prepare:${cell.slug}:grid.prepare:${cell.instance}.create`);
            if (spansForEntry.length !== 1) throw new Error(`Expected one completed cold entry span: ${cell.slug}`);
            const hold = spansForEntry[0]; if (hold === undefined) throw new Error('Entry span missing');
            const urls = entryDemandUrls(cell.slug, source, demands.filter(row => row.at >= timeOrigin + hold.startTime && row.at <= timeOrigin + hold.startTime + hold.duration));
            for (const url of urls) await read(url);
            console.log(JSON.stringify({ region: cell.instance, tier, pin, network, complete: true, errors, heldMs: hold.duration, files: urls.length }));
          } finally { await context.close(); }
        },
      });
      // Publish only a complete product: every selected region/tier and all its
      // bodies succeeded. An independent product failure never erases this data.
      const path = out === undefined ? entryReadsFile(process.cwd(), productSlug) : resolve(out, productSlug, 'entry-reads.json');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(rows, null, 1)}\n`);
    } catch (error: unknown) {
      productFailures.push(error);
      console.error({ product: productSlug, error: error instanceof Error ? error.stack ?? error.message : String(error) });
    }
  }
  if (productFailures.length > 0) throw new AggregateError(productFailures, 'Entry crawl has refused products; completed tables are retained');
} finally { await browser.close(); }
