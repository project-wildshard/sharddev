// oxlint-disable-next-line import/no-nodejs-modules -- Serve only built static products from the local author tool.
import { createServer } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Author changes rebuild a private disposable product.
import { createReadStream, existsSync, mkdtempSync, realpathSync, readdirSync, rmSync, statSync, watch, readFileSync, writeFileSync, type Dirent } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve static requests inside the product directory.
import { extname, join, resolve, sep } from 'node:path';
import { buildProject } from '@wildshard/build/project';
import type { ProjectManifestSource } from '@wildshard/sdk/projectManifest';
import { shardRepoRoot } from '@wildshard/upload/sharddev/shardSource';
import { Scope } from '@wildshard/engine/app/scope';
import { scratchDir } from '@wildshard/sdk/scripts/scratch-dir.mjs';
import { createDevWorld, DEV_RELEASE, type DevWorld } from '../../scripts/dev-world.mjs';
import { renderDevMap } from './devMap';

// NEW-SHARD-E2E F18: a new build opens the same page under a new `devrev`, not location.reload(): Chromium reports a reload
// (or a same-URL replace) as navigation type `reload`, which engine's lastEnd reads as the player's own reload and sends to the title.
const POLL = '<script>let wsRevision=WS_REVISION;setInterval(async()=>{try{const r=await fetch("/__wildshard_dev_revision",{cache:"no-store"});const s=await r.json();if(s.error){console.error(s.error);return}if(s.revision!==wsRevision){const u=new URL(location.href);u.searchParams.set("devrev",String(s.revision));location.replace(u.href)}}catch{}},500)</script>';
/** A dev page's service worker: it answers no request and removes itself (NEW-SHARD-E2E F19). */
export const DEV_SERVICE_WORKER = "self.addEventListener('install',()=>{self.skipWaiting()});self.addEventListener('activate',(e)=>{e.waitUntil(self.registration.unregister())});\n";
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
// .worktrees: a shard repo's plan worktrees (DEV-SPEED DS11) are other checkouts, never this project's source.
const ignored = new Set(['node_modules', '.git', 'dist', 'out', 'public', '.worktrees', 'tmp']);

/** DK23: each dev process owns output inside the project's lane folder. */
export function createDevScratch(source: string): string {
  const session = process.env['CODEX_THREAD_ID'] ?? process.env['CLAUDE_SESSION_ID'] ?? process.env['CLAUDE_CODE_SESSION_ID'];
  const named = process.env['WS_LANE_NAME'] ?? `dev-${(session ?? String(process.pid)).replaceAll(/[^\w-]/gu, '-').slice(0, 80)}`;
  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,99}$/u.test(named) || named.includes('..')) throw new Error('Invalid dev lane name');
  const root = shardRepoRoot(source), env = { ...process.env, WS_LANE_NAME: named };
  let parent: string;
  try { parent = scratchDir(named, 'wildshard dev', { root, env }); }
  catch (cause) {
    // A second dev process started in the same instant (watch parity runs dev and watch together) can find the folder
    // before its .owner is written; it takes its own pid folder too.
    if (!(cause instanceof Error) || !/already belongs to session|already exists with no \.owner/u.test(cause.message)) throw cause;
    parent = scratchDir(`${named.slice(0, 80)}-${process.pid}`, 'wildshard dev', { root, env });
  }
  const record = { ...JSON.parse(readFileSync(join(parent, '.owner'), 'utf8')) as Record<string, unknown>, pid: process.pid };
  const scratch = realpathSync(mkdtempSync(join(parent, ['dev', String(process.pid), ''].join('-'))));
  writeFileSync(join(scratch, '.owner'), JSON.stringify(record), { flag: 'wx' });
  writeFileSync(join(scratch, 'server.pid'), String(process.pid), { flag: 'wx' });
  return scratch;
}

/** Synchronous author-source baseline: native recursive watch notifications can miss quick overwrites during startup.
 * Nanosecond change time also detects same-length edits whose modification time was restored. Symlink directories
 * are not traversed; output/dependency directories keep the existing watcher exclusions. */
export function projectSourceStamp(source: string): string {
  const directories = [source], rows: string[] = [];
  while (directories.length > 0) {
    const directory = directories.pop(); if (directory === undefined) break;
    let entries: Dirent[];
    try { entries = readdirSync(directory, { withFileTypes: true }); }
    catch (cause) { if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue; throw cause; }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { directories.push(file); continue; }
      const metadata = statSync(file, { bigint: true, throwIfNoEntry: false });
      if (metadata === undefined) continue;
      if (metadata.isFile()) rows.push(`${file}\0${metadata.ino}:${metadata.size}:${metadata.mtimeNs}:${metadata.ctimeNs}`);
    }
  }
  return rows.sort().join('\n');
}
/** The file a dev request reads: the shard's own root first (SD-2: `/shardfiles/<slug>/` is the product's root), then
 *  the product's own `shardfiles/<slug>/` folder, where the folder build writes the shard's discovery document (SP13c:
 *  an engine 0.1.35 client asks `/shardfiles/<slug>/discovery.json`, which only the second path holds). */
export function devFile(dirs: readonly string[], shardRoot: string, path: string): { dir: string; file: string } | undefined {
  const served = shardRoot !== '' && path.startsWith(shardRoot) ? path.slice(shardRoot.length - 1) : path;
  for (const each of served === path ? [path] : [served, path]) {
    const local = each === '/' ? 'index.html' : each.slice(1);
    const file = dirs.filter((dir) => dir !== '').map((dir) => ({ dir, file: resolve(dir, local) }))
      .find(({ dir, file: candidate }) => candidate.startsWith(`${dir}${sep}`) && existsSync(candidate) && statSync(candidate).isFile() && realpathSync(candidate).startsWith(`${dir}${sep}`));
    if (file !== undefined) return file;
  }
  return undefined;
}
/** SDK-SPLIT SP13f: a file under one of the manifest's image roots (`/assets/` is the source's `static/assets/`), which a
 *  release serves beside the shard and the page asks for at run time (Signal Dunes' painted skies). */
export function imageRootFile(manifest: ProjectManifestSource | undefined, path: string): { dir: string; file: string } | undefined {
  const root = manifest?.imageRoots.find(each => path.startsWith(each.prefix));
  return root === undefined || !existsSync(root.directory) ? undefined : devFile([realpathSync(root.directory)], '', `/${path.slice(root.prefix.length)}`);
}
/** A local game and its rebuilt author client. Closing it drains the world and drops its socket and private products.
 *  On process exit the OS closes the watchers (SD-6: closing a recursive watch can block on macOS). */
export interface DevProject { url: string; close: (options?: { exiting?: boolean }) => Promise<void> }
/** Only the author command chooses DEVSERVER; requests, cookies and URL switches cannot enable it. */
/** SDK-SPLIT SP13f: `manifest` is the source `wildshard build` is given (its image roots name `/assets/` and the shard's own
 *  folder), so a generator that reads `/assets/...` inputs builds under dev as it does under build. `build` stands in for
 *  buildProject in a test. */
export async function devProject(project: string, options: { decisionLegacyLines?: number; port?: number; client?: string; manifest?: ProjectManifestSource; build?: typeof buildProject } = {}): Promise<DevProject> {
  const source = resolve(project), scratch = createDevScratch(source);
  let revision = 0, error: string | null = null, current = '', previous = '', stopped = false, shardRoot = '';
  const scope = new Scope('sdk.dev');
  let debounce: Scope | undefined, work = Promise.resolve();
  let origin = '', world: DevWorld | undefined;
  const rebuild = async (): Promise<void> => {
    if (stopped) return;
    const target = join(scratch, `build-${revision + 1}`);
    try {
      const built = await (options.build ?? buildProject)(source, target, { devserver: true, ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }), ...(options.client === undefined ? {} : { client: options.client }), ...(options.manifest === undefined ? {} : { manifest: options.manifest }) });
      const page = join(target, 'index.html');
      if (!existsSync(page)) throw new Error('wildshard dev requires the SDK devserver client; build/pack the SDK first');
      const flags: unknown = JSON.parse(readFileSync(join(target, 'build-flags.json'), 'utf8'));
      if (typeof flags !== 'object' || flags === null || !('devserver' in flags) || flags.devserver !== true) throw new Error('wildshard dev requires a client compiled in devserver mode');
      await renderDevMap(target);
      const document = readFileSync(page, 'utf8');
      world ??= await createDevWorld(origin, join(scratch, 'world'));
      await world.move(target, built.identity.slug);
      const map = `<script>globalThis.__WS_DEV_COOKED_MAP__=${JSON.stringify(built.identity.slug)};</script>`;
      writeFileSync(page, world.stamp(document).replace('</body>', `${map}${POLL.replace('WS_REVISION', String(revision + 1))}</body>`));
      if (previous !== '') rmSync(previous, { recursive: true, force: true });
      previous = current; current = target; shardRoot = `/shardfiles/${built.identity.slug}/`; revision++; error = null;
    } catch (cause) {
      rmSync(target, { recursive: true, force: true }); error = cause instanceof Error ? cause.message : String(cause);
      if (current === '') throw cause;
      console.error(`wildshard dev: rebuild failed; serving previous product: ${error}`);
    }
  };
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (path === DEV_RELEASE && request.method === 'GET') {
        response.setHeader('Content-Type', 'application/json'); response.end(world?.signed); return;
      }
      if (path === '/__wildshard_dev_revision') {
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ revision, error })); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      // NEW-SHARD-E2E F19: no service worker on a dev page. Once one controls the tab, the next load of the page (a rebuild's
      // reload, or the URL typed again) is answered from its cache with the app's own shell, not this build's page with its
      // inline shard, and that shell's level download asks for a packs book a dev build never writes (404). The page's
      // `sw.js` is one that takes nothing and unregisters itself (and a worker an older `dev` left on this port).
      if (path === '/sw.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(DEV_SERVICE_WORKER); return; }
      // Serve the author's product at the same shardfile path as a release.
      const file = devFile([current, previous], shardRoot, path) ?? imageRootFile(options.manifest, path);
      if (file === undefined) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', MIME[extname(file.file)] ?? 'application/octet-stream');
      if (request.method === 'HEAD') response.end(); else createReadStream(file.file).on('error', () => { response.destroy(); }).pipe(response);
    } catch { response.writeHead(400); response.end(); }
  });
  const closeServer = (): Promise<void> => new Promise((_resolve) => { server.close(() => { _resolve(); }); server.closeAllConnections(); });
  try {
    await new Promise<void>((_resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', _resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No author server address');
    origin = `http://127.0.0.1:${address.port}`;
    await rebuild();
  } catch (cause) {
    await world?.close();
    await closeServer();
    rmSync(scratch, { recursive: true, force: true });
    throw cause;
  }
  let observed = projectSourceStamp(source);
  const reconcile = (): void => {
    if (stopped) return;
    const next = projectSourceStamp(source);
    if (next === observed) return;
    observed = next;
    debounce?.dispose(); debounce = scope.child('rebuild.debounce');
    debounce.timeout(100, () => { debounce?.dispose(); work = work.then(rebuild); });
  };
  // One recursive watch per top-level folder that isn't ignored, and a flat one on the root: a recursive watch on the
  // root would still walk and watch every ignored folder on Linux (a shard repo's .worktrees/ holds whole checkouts).
  // A folder made later is seen by the 250 ms poll below.
  const onChange = (prefix: string) => (_event: string, filename: string | null): void => {
    if (`${prefix}${filename ?? ''}`.split(/[\\/]/u).some((part) => ignored.has(part))) return;
    reconcile();
  };
  const watchers = [watch(source, onChange('')), ...readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignored.has(entry.name))
    .map((entry) => watch(join(source, entry.name), { recursive: true }, onChange(`${entry.name}/`)))];
  // Capture before returning the ready server; polling covers native-event gaps without rebuilding unchanged input.
  scope.interval(250, reconcile);
  return { url: `${origin}/`, close: async (closing = {}) => {
    if (stopped) return;
    // The port goes first: closing the watchers can block for seconds (SD-6), and `wildshard dev` frees it within 2 s.
    stopped = true; scope.dispose();
    try {
      await closeServer();
      // A running build owns the world until it returns, including on exit.
      await work;
      await world?.close();
      rmSync(scratch, { recursive: true, force: true });
    } finally { if (closing.exiting !== true) for (const watcher of watchers) watcher.close(); }
  } };
}
