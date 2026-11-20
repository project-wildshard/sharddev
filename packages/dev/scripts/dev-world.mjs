// STR5. The author page and Node world use separate loopback listeners. Its
// stable socket lets an open dev page survive replacement of the world process.
import { spawn } from 'node:child_process';
import { sign } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const here = import.meta.dirname;
const installedEngine = fileURLToPath(import.meta.resolve('@wildshard/engine/package.json'));
export const DEV_RELEASE = '/__dev/release.json';

// A Node author world hosts one cell at wire ordinal 1. The downloaded
// client's inline staging catalogue has a different order.
function authorCatalogue(html, slug) {
  return html.replace(/(<script type="application\/json" id="ws-catalogue">)([^<]*)(<\/script>)/u, (_all, open, json, close) => {
    const catalogue = JSON.parse(json);
    catalogue.grid.cells = [{ instance: slug, slug, cell: [0, 0] }];
    return open + JSON.stringify(catalogue).replaceAll('<', String.raw`\u003c`) + close;
  });
}

async function devBundle(engineRoot, version) {
  const packed = join(here, '../dist/dev-server');
  try {
    const builtFor = (await readFile(join(packed, 'engine-version'), 'utf8')).trim();
    if (builtFor === version) return packed;
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause;
  }
  // Author projects can override the engine pin. Its own bundle travels with it.
  const bundle = join(engineRoot, 'dist/dev-server');
  await readFile(join(bundle, 'bundle.json'));
  return bundle;
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(done => {
    const deadline = setTimeout(() => { child.kill('SIGKILL'); }, 10_000).unref();
    child.once('exit', () => { clearTimeout(deadline); done(); });
    child.kill('SIGTERM');
  });
}

export async function createDevWorld(origin, work, engineManifest = installedEngine) {
  const engineRoot = dirname(engineManifest);
  const engineScript = name => pathToFileURL(join(engineRoot, 'scripts', name)).href;
  const { devKey } = await import(engineScript('dev-world.mjs'));
  const { childListener, rigFront } = await import(engineScript('rig-listeners.mjs'));
  await mkdir(work, { recursive: true });
  const key = devKey(work);
  const db = new PGlite(join(work, 'saves'));
  const database = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 16 });
  let front;
  try { await database.start(); front = await rigFront(); }
  catch (cause) { await database.stop().finally(() => db.close()); throw cause; }
  const log = createWriteStream(join(work, 'server.log'), { flags: 'a' });
  const release = `${origin}${DEV_RELEASE}`;
  const socket = `ws://127.0.0.1:${front.port}/`;
  const { version } = JSON.parse(await readFile(engineManifest, 'utf8'));
  let serial = 0, room, current, bundle, signed = '';
  const stamp = `<script>globalThis.__WS_WORLD__=${JSON.stringify({ release, key: key.public }).replaceAll('<', String.raw`\u003c`)};</script>`;
  const start = async ({ build, epoch, slug, product, bundle }) => {
    const body = JSON.stringify({ channel: 'staging', serial: ++serial, engineBuild: build, saveEpoch: epoch, shards: [{ slug, revision: 1 }], socket });
    signed = JSON.stringify({ body, signature: sign(null, Buffer.from(body), key.private).toString('hex') });
    const child = spawn(process.execPath, [join(bundle, 'main.mjs')], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, RELEASE_URL: release, RELEASE_PUBLIC_KEY: key.public, RELEASE_CHANNEL: 'staging',
        PACK_ORIGIN: pathToFileURL(product + '/').href, WILDSHARD_DEV_PRODUCT: product, PACK_CACHE: join(work, 'packs'),
        DATABASE_URL: `postgresql://postgres@${database.getServerConn()}/postgres?sslmode=disable`,
        SEAT_SECRET: 'dev-world', HOST: '127.0.0.1', PORT: '0', ALLOWED_ORIGINS: [origin, origin.replace('127.0.0.1', 'localhost')].join(','),
        WILDSHARD_BUILD: build, WORLD_CELLS: slug, WORLD_WORKERS: '1', RELEASE_POLL_MS: '1000', GRACE_MS: '1000' },
    });
    room = child;
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.once('exit', () => { if (room === child) front.clear(); });
    front.point(await childListener(child, 'world-ready'));
  };
  return {
    get signed() { return signed; },
    stamp(html) {
      const page = current === undefined ? html : authorCatalogue(html, current.slug);
      return page.replace(/<head(?:\s[^>]*)?>/iu, head => head + stamp);
    },
    async move(product, slug, client = product) {
      const { build, clientVersion, saveEpoch: epoch } = JSON.parse(await readFile(join(client, 'version.json'), 'utf8'));
      if (clientVersion !== version || typeof build !== 'string' || !/^[\w.-]+$/u.test(build) || !Number.isSafeInteger(epoch)) {
        throw new Error(`wildshard: the dev client must be built with the installed engine (${version})`);
      }
      bundle ??= await devBundle(engineRoot, version);
      const next = { build, epoch, slug, product, bundle };
      await stopChild(room);
      try {
        await start(next);
      } catch (cause) {
        await stopChild(room);
        if (current) await start(current);
        const details = await readFile(join(work, 'server.log'), 'utf8').catch(() => '');
        throw new Error(`wildshard: dev server did not start\n${details.trim().split('\n').slice(-14).join('\n')}`, { cause });
      }
      current = next;
    },
    async close() {
      try { await stopChild(room); }
      finally {
        log.end();
        await front.close().finally(() => database.stop().finally(() => db.close()));
      }
    },
  };
}
