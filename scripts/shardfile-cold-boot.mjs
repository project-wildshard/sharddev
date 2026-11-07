#!/usr/bin/env node
// C0 (J137): prove a real boot needs nothing shard-owned from the tree. A built output is served with its product folders
// and every mount answered from the shard's tarball alone; a request for any other file a shard's name owns is refused with
// a 404 and counted as a leak. Each shard then cold boots on the phone profile, to control, in a fresh context.
//   scripts/browser-lane.sh node --import ./scripts/bake-loader.mjs scripts/shardfile-cold-boot.mjs \
//     --dist=<built output> --tars=<folder of <slug>.tar> [--engine=webkit|chromium] <slug> …
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { extname, join, resolve as resolvePath } from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import { readTar } from '@wildshard/format/tar';

const flag = name => process.argv.find(row => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const dist = resolvePath(flag('dist') ?? 'dist'), tars = resolvePath(flag('tars') ?? 'tmp/shardfiles'), engine = flag('engine') ?? 'chromium';
const slugs = process.argv.slice(2).filter(row => !row.startsWith('--'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/json' };
/** The names a shard's own files carry under /assets. A file directly in /assets is the bundle's own (thumbs, boot tables):
 *  those are the app's until C3's catalogue. */
const OWNED = /^\/assets\/(?:(?:gpu\/(?:baked\/)?|music\/|sfx\/|lut\/|baked\/|models\/)?(?:driftwood|far-reach|nalati|nine-dragon|pine-hollow|sunscar|open-plot))/u;

const shards = new Map();
for (const name of readdirSync(tars).filter(row => row.endsWith('.tar'))) {
  const files = readTar(readFileSync(join(tars, name))), slug = name.slice(0, -4);
  const data = files.get('cook.json'), mounts = data === undefined ? [] : JSON.parse(new TextDecoder().decode(data)).mounts;
  shards.set(slug, { files, mounts: new Map(mounts.map(row => [row.url, row.path])) });
}
const tally = { tar: new Map(), leaks: [] };
const count = (slug) => { tally.tar.set(slug, (tally.tar.get(slug) ?? 0) + 1); };
/** The tarball that answers a path, if one does. */
function fromTarball(path) {
  const product = /^\/(?:shardfiles|server-class)\/([^/]+)\/(.+)$/u.exec(path);
  if (product !== null) {
    const shard = shards.get(product[1] ?? ''), bytes = shard?.files.get(product[2] ?? '');
    if (bytes !== undefined) { count(product[1]); return bytes; }
    return undefined;
  }
  for (const [slug, shard] of shards) {
    const held = shard.mounts.get(path);
    if (held !== undefined) { count(slug); return shard.files.get(held); }
  }
  return undefined;
}
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const held = fromTarball(path);
  if (held !== undefined) { response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(held); return; }
  if (OWNED.test(path) && !/^\/assets\/[^/]+\.[a-z0-9]+$/u.test(path)) { tally.leaks.push(path); response.writeHead(404).end(); return; }
  const file = join(dist, path === '/' ? 'index.html' : path.slice(1));
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  // A part is stored as its q11 body; the test browser accepts br, and a plain read keeps this server small.
  const body = readFileSync(file), part = file.endsWith('.pack.br');
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(part ? brotliDecompressSync(body) : body);
});
await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
const address = server.address(), origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, args: engine === 'webkit' ? [] : ['--mute-audio'] });
const rows = [];
try {
  for (const slug of slugs) {
    tally.leaks.length = 0; tally.tar.delete(slug);
    const context = await browser.newContext({ ...devices['iPhone 16 Pro'], serviceWorkers: 'block', ...(engine === 'webkit' ? {} : { isMobile: false, defaultBrowserType: 'chromium' }) });
    const page = await context.newPage(), errors = [], started = Date.now();
    page.on('pageerror', error => { errors.push(String(error).slice(0, 200)); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
    let control = false;
    try {
      await page.goto(`${origin}/?chunk=${slug}&tier=phone&skipintro=1&nolock=1&mute=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__wildshard?.world?.hud?.entered === true, undefined, { timeout: Number(flag('timeout') ?? 150_000) });
      control = true;
    } catch (error) { errors.push(String(error).slice(0, 160)); }
    rows.push({ slug, control, seconds: Math.round((Date.now() - started) / 1000), fromTarball: tally.tar.get(slug) ?? 0, leaks: [...new Set(tally.leaks)], errors: [...new Set(errors)].slice(0, 6) });
    console.log(JSON.stringify(rows.at(-1)));
    await context.close();
  }
} finally { await browser.close(); server.close(); }
if (rows.some(row => !row.control || row.leaks.length > 0)) process.exitCode = 1;
