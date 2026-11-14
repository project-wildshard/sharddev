// oxlint-disable-next-line import/no-nodejs-modules -- The author tool serves the watched product and the scene stream.
import { createServer } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Author changes are watched; the product is a private disposable build.
import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Own temporary build directory.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve static requests inside the product directory.
import { extname, join, resolve, sep } from 'node:path';
import { build, type Plugin } from 'vite';
import * as THREE from 'three';
import { diagnosticNow } from '@wildshard/engine/core/clock';
import { Scope } from '@wildshard/engine/app/scope';
import { SDK_ROOT } from '../agentFiles';
import { buildProject } from '../project';
import { projectSourceStamp } from '../dev';
import { executeBundle } from '../executeBundle';
import type { ShardScene } from '../scene/description';
import * as liveAuthor from '../scene/author';
import { PaintMemo, withPaintMemo } from '../scene/author';
import * as liveCanvas from '../scene/canvas';
import * as liveLower from '../scene/lower';
import * as liveShard from '../scene/shard';
import * as liveShardfile from '../scene/shardfile';
import { hashOf } from '../scene/hash';
import { lampRows, sceneGroundBytes, sceneLook, waterRows } from '../scene/shardfile';
import { DEV_SCENE_PATH, WATCH_RESHELL, WATCH_SOCKET, WATCH_WIRE, budgetLines, budgetOf, encodeGeometry, encodePart, hookMismatch, liveShell, type WatchBuild, type WatchState } from './protocol';
import { CONTENT_CAPS } from '@wildshard/format/contentBounds';
// oxlint-disable-next-line import/no-nodejs-modules -- The idle full build runs `wildshard build` in a child process.
import { spawn, type ChildProcess } from 'node:child_process';
import { acceptSocket, type WatchSocket } from './socket';

/**
 * SHARD-SOURCE AP5 and AP6 (J347): `wildshard watch <source> [port]`. The page boots once from a live shell (the ground,
 * look and spawn; `liveShell`) with the watch page script injected (`page.ts`), then every source edit runs here, in this
 * long-lived process, with no product rebuild:
 *
 *   bundle  `shard.config.ts` (one rolldown pass, ~0.15 s), import it, call the scene shard's `describe()`
 *   diff    each part's content hash, and the look's day keys, against the last revision; only changed parts are
 *           re-encoded (per-part cache)
 *   push    one `WatchState` on the WebSocket; the page script fetches the changed parts, and only the geometry and
 *           rasters it lacks, and drives engine's dev hook
 *
 * A sky, fog, sun colour or ambient edit goes live (the look's day keys); a ground edit too (AP18: `setGround`). A spawn, grade or sun direction edit
 * can't in M1 (AP17's fast path): it rebuilds the shell and the page reloads, as `dev` does. `wildshard dev` is unchanged.
 */
export interface WatchProject { url: string; close: () => Promise<void> }

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
const ignored = new Set(['node_modules', '.git', 'dist', 'public', '.worktrees', 'tmp']);

/**
 * AP17: the modules a watched revision shares with this process instead of bundling and evaluating its own copy: `three`
 * and the scene API. An author's bundle is then only the author's own code (~20 ms, not ~170 ms), and three and the
 * lowering stay loaded and warm across revisions. Each is a virtual module that re-exports this process's instance, so
 * an author's `THREE.Mesh` is the lowering's `Mesh`.
 */
const LIVE_GLOBAL = '__wildshardWatchLive';
const LIVE: Readonly<Record<string, object>> = { three: THREE, '@wildshard/sdk/scene/author': liveAuthor, '@wildshard/sdk/scene/canvas': liveCanvas,
  '@wildshard/sdk/scene/lower': liveLower, '@wildshard/sdk/scene/shard': liveShard, '@wildshard/sdk/scene/shardfile': liveShardfile };
/** The client's service worker, and what `watch` serves in its place: a worker that unregisters itself and serves nothing. */
const SERVICE_WORKER = '/sw.js';
export const NO_SERVICE_WORKER = "self.addEventListener('install', () => { self.skipWaiting(); });\nself.addEventListener('activate', (event) => { event.waitUntil(self.registration.unregister()); });\n";
/** AP17: how long after a guessed revision the true paint runs: once edits pause, so a paint (it holds this process) rarely delays one. */
const TRUTH_AFTER_MS = 1500;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u, LIVE_PREFIX = '\0wildshard-live:';
const livePlugin = (): Plugin => {
  (globalThis as Record<string, unknown>)[LIVE_GLOBAL] = LIVE;
  return {
    name: 'wildshard-watch-live', enforce: 'pre',
    resolveId: (id) => (Object.hasOwn(LIVE, id) ? `${LIVE_PREFIX}${id}` : null),
    load: (id) => {
      if (!id.startsWith(LIVE_PREFIX)) return null;
      const name = id.slice(LIVE_PREFIX.length), live = LIVE[name] ?? {}, keys = Object.keys(live).filter((key) => key !== 'default' && IDENTIFIER.test(key));
      return `const live = globalThis.${LIVE_GLOBAL}[${JSON.stringify(name)}];\nexport const { ${keys.join(', ')} } = live;\n${'default' in live ? 'export default live.default;\n' : ''}`;
    },
  };
};

/**
 * The scene shard `shard.config.ts` exports (its default or `generate`), read fresh from source. Its build runs under `memo`
 * in guess mode (AP17): `describe` runs it again, in guess or truth mode, without bundling again.
 */
async function describeSource(source: string, memo: PaintMemo): Promise<{ scene: ShardScene; describe: (mode: 'guess' | 'truth') => ShardScene; bundleMs: number; describeMs: number }> {
  const started = diagnosticNow();
  const result = await build({ configFile: false, logLevel: 'silent', plugins: [livePlugin()], build: { write: false, minify: false, lib: { entry: resolve(source, 'shard.config.ts'), formats: ['es'], fileName: 'config' }, rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  const chunk = built !== undefined && 'output' in built ? built.output.find((out) => out.type === 'chunk') : undefined;
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('watch: shard.config.ts did not bundle to one module');
  const loaded = await executeBundle(chunk.code, source) as Record<string, unknown>;
  const bundled = diagnosticNow();
  const shard = [loaded['default'], loaded['generate']].find((value): value is { describe: () => ShardScene } => typeof value === 'function' && 'describe' in value && typeof value.describe === 'function');
  if (shard === undefined) throw new Error('watch: shard.config.ts exports no scene shard (defineShard from @wildshard/sdk/scene/shard)');
  const describe = (mode: 'guess' | 'truth'): ShardScene => { memo.begin(mode); return withPaintMemo(memo, () => shard.describe()); };
  const scene = describe('guess');
  return { scene, describe, bundleMs: Math.round(bundled - started), describeMs: Math.round(diagnosticNow() - bundled) };
}

/** The shell's look, as the shardfile back end writes it for the live shell: its day keys go live, the rest is the shell's. */
const shellLook = (scene: ShardScene): ReturnType<typeof sceneLook> => sceneLook(scene, liveShell(scene).parts.flatMap((p) => p.lights), {});

/** The shell's look as the page takes it live (AP17): the whole section but its materials, which ride the parts. */
const liveLook = (scene: ShardScene): { keys: readonly unknown[]; look: unknown } => {
  const { materials: _materials, ...look } = shellLook(scene);
  return { keys: look.keys, look };
};

/**
 * What a page boots from: a ground or spawn change, or a look change engine's dev hook can't set live, needs a new shell.
 * The day keys, the sun's arc, exposure, tone, vignette and bloom go live (AP17); a page whose hook refuses one anyway asks
 * for a new shell (`WATCH_RESHELL`).
 */
/** A built product's files (its `shard.json`) and tiles (format 2: the `world/tiles` section), for the budget table. */
function builtProduct(folder: string): Parameters<typeof budgetOf>[0] {
  const shard = JSON.parse(readFileSync(join(folder, 'shard.json'), 'utf8')) as { files: { compressed: number }[]; sections?: { name: string; path: string }[] };
  const section = shard.sections?.find((row) => row.name === 'world/tiles');
  const tiles = section === undefined ? [] : (JSON.parse(readFileSync(join(folder, section.path), 'utf8')) as { tiles: Parameters<typeof budgetOf>[0]['tiles'] }).tiles;
  return { files: shard.files, tiles };
}

/** AP20: how long edits rest before watch runs the full build. */
const IDLE_BUILD_MS = 5000;

const shellKey = (scene: ShardScene): string => {
  const { keys: _keys, materials: _materials, day, grade, ...look } = shellLook(scene);
  const { exposure: _exposure, tone: _tone, vignette: _vignette, bloom: _bloom, ...fixedGrade } = grade as typeof grade & { tone?: unknown; vignette?: unknown; bloom?: unknown };
  // engine's live look keeps its fog kind: linear against exponential needs a new shell
  return hashOf((hash) => hash.json({ look, grade: fixedGrade, day: day === undefined ? null : { minutes: day.minutes, start: day.start },
    linearFog: scene.look.fog?.kind === 'linear', spawn: scene.spawn, identity: scene.identity }));
};

/** The page script, bundled once per process from `pageEntry.ts` into one classic script for the page's body. */
export async function pageScript(): Promise<string> {
  // from the sdk's root: the author CLI is one bundle whose import.meta.dirname is src/sharddev (scripts/wildshard.mjs)
  const entry = resolve(SDK_ROOT, 'src/sharddev/watch/pageEntry.ts');
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: true, lib: { entry, formats: ['iife'], name: 'wildshardWatch', fileName: 'watch' }, rolldownOptions: { output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  const chunk = built !== undefined && 'output' in built ? built.output.find((out) => out.type === 'chunk') : undefined;
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('watch: the page script did not bundle to one module');
  return `<script>${chunk.code.replaceAll(/<\/script/giu, '<\\/script')}</script>`;
}

/** Refuse a devserver client whose dev hook this sdk can't drive (its `build-flags.json`, written by engine's app build). */
function assertHook(client: string): void {
  const file = join(client, 'build-flags.json');
  const problem = hookMismatch(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as unknown : null);
  if (problem !== null) throw new Error(`wildshard watch: ${problem}`);
}

export async function watchProject(project: string, options: { port?: number; client?: string | null; log?: (line: string) => void } = {}): Promise<WatchProject> {
  if (typeof options.client === 'string') assertHook(options.client);
  const source = resolve(project), scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wildshard-watch-'))), log = options.log ?? ((line: string): void => { console.info(line); });
  let product = '', shardRoot = '', shell = 0, shellHash = '', revision = 0, error: string | null = null, stopped = false, script = '';
  let parts: { name: string; hash: string }[] = [], look: WatchState['look'] = { hash: '', keys: [], look: null }, reshell = false;
  let ground: WatchState['ground'] = { hash: '', shell: '' }, lastBuild: WatchBuild | null = null, idle: Scope | null = null, building: ChildProcess | null = null;
  const encodedParts = new Map<string, Uint8Array>(), geometries = new Map<string, Uint8Array>(), textures = new Map<string, Uint8Array>(), grounds = new Map<string, Uint8Array>();
  const clients = new Set<WatchSocket>(), scope = new Scope('sdk.watch');
  let seenAt = 0, observed = projectSourceStamp(source), work = Promise.resolve(), pending = false, stampMs = 0;
  const state = (): string => JSON.stringify({ wire: WATCH_WIRE, shell, revision, parts, look, ground, build: lastBuild, error, seenAt, sentAt: Date.now() } satisfies WatchState);
  const announce = (): void => { const message = state(); for (const client of clients) client.send(message); };

  const buildShell = async (): Promise<void> => {
    const target = join(scratch, `shell-${shell + 1}`);
    const before = process.env['WILDSHARD_SCENE_LIVE'];
    process.env['WILDSHARD_SCENE_LIVE'] = '1';
    try {
      const built = await buildProject(source, target, { devserver: true, ...(options.client === undefined ? {} : { client: options.client }) });
      const page = join(target, 'index.html');
      script ||= await pageScript();
      // the shell's number first: the page script reloads on a state for another shell, even on its first message
      const tags = `<script>window.__wsShell=${shell + 1}</script>${script}</body>`;
      if (existsSync(page)) writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', () => tags));
      if (product !== '') rmSync(product, { recursive: true, force: true });
      product = target; shardRoot = `/shardfiles/${built.identity.slug}/`; shell++;
    } finally { if (before === undefined) delete process.env['WILDSHARD_SCENE_LIVE']; else process.env['WILDSHARD_SCENE_LIVE'] = before; }
  };

  /**
   * AP20: once edits rest `IDLE_BUILD_MS`, the full `wildshard build` of the source (the shardfile back end, as an upload
   * would carry it) in a child process, so a long build never holds an edit back; an edit kills it. Its budget table goes to
   * the page (`WatchState.build`) and the log.
   */
  const fullBuild = async (): Promise<void> => {
    if (stopped || building !== null) return;
    const of = revision, started = diagnosticNow(), target = join(scratch, 'build');
    rmSync(target, { recursive: true, force: true });
    const child = spawn(process.execPath, [join(SDK_ROOT, 'bin/wildshard.mjs'), 'build', source, target, '--folder-only'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WILDSHARD_SCENE_LIVE: '' } });
    building = child;
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += String(chunk); }); child.stderr?.on('data', (chunk: Buffer) => { output += String(chunk); });
    const code = await new Promise<number | null>((_resolve) => { child.on('close', _resolve); });
    building = null;
    if (stopped || of !== revision || child.signalCode !== null) return;
    const ms = Math.round(diagnosticNow() - started), refused = (reason: string): WatchBuild => ({ revision: of, ms, error: reason, download: 0, files: 0, tiles: 0, triangles: 0, draws: 0, over: [] });
    let table: WatchBuild;
    try {
      table = code === 0 ? { revision: of, ms, error: null, ...budgetOf(builtProduct(target), CONTENT_CAPS) }
        : refused(output.trim().split('\n').reverse().find((row: string) => row !== '' && !row.includes('ExperimentalWarning') && !row.includes('--trace-warnings')) ?? `exit ${String(code)}`);
    } catch (cause) { table = refused(cause instanceof Error ? cause.message : String(cause)); }
    lastBuild = table;
    for (const row of budgetLines(table)) log(`wildshard watch: ${row}`);
    announce();
  };

  const idleBuild = (): void => {
    idle?.dispose();
    idle = scope.child('sdk.watch.idle');
    idle.timeout(IDLE_BUILD_MS, () => { void fullBuild(); });
  };
  /** Push one described revision: a new shell if it needs one, the changed parts and the look. */
  const push = async (scene: ShardScene, timing: string, started: number): Promise<void> => {
    const key = shellKey(scene);
    const reshelled = key !== shellHash || reshell;
    if (reshelled) {
      if (shellHash !== '') log(`wildshard watch: ${reshell ? 'the page can\'t take this look live' : 'the ground, spawn or a fixed look field changed'}; rebuilding the shell (the page reloads)`);
      // the first shell's failure is the command's; a later one is the page's error, and the old shell keeps serving
      if (shellHash === '') await buildShell();
      else try { await buildShell(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); log(`wildshard watch: ${error}`); revision++; announce(); return; }
      shellHash = key; reshell = false;
    }
    // AP18: the ground goes live (`setGround`); the shell keeps the one it was built with
    const groundHash = scene.ground?.hash ?? 'flat';
    if (!grounds.has(groundHash)) {
      if (grounds.size > 8) grounds.clear();
      grounds.set(groundHash, sceneGroundBytes(scene));
    }
    const groundChanged = ground.hash !== '' && groundHash !== ground.hash;
    const changed = scene.parts.filter((part) => parts.find((live) => live.name === part.name)?.hash !== part.hash).map((part) => part.name);
    for (const part of scene.parts) {
      if (encodedParts.has(part.hash)) continue;
      encodedParts.set(part.hash, new TextEncoder().encode(JSON.stringify(encodePart(scene, part, { lamps: lampRows(part.lights), water: waterRows(part) }))));
      for (const g of part.geometries) { const geometry = scene.geometries[g]; if (!geometries.has(g) && geometry !== undefined) geometries.set(g, encodeGeometry(geometry)); }
      for (const t of part.textures) { const texture = scene.textures[t]; if (!textures.has(t) && texture !== undefined) textures.set(t, texture.rgba); }
    }
    const next = scene.parts.map((part) => ({ name: part.name, hash: part.hash }));
    const live = liveLook(scene), lookHash = hashOf((hash) => hash.json(live));
    const same = !reshelled && error === null && !groundChanged && lookHash === look.hash && next.length === parts.length && next.every((part, i) => part.name === parts[i]?.name && part.hash === parts[i]?.hash);
    error = null;
    if (same) return;
    const lookChanged = look.hash !== '' && lookHash !== look.hash;
    parts = next; look = { hash: lookHash, ...live }; ground = { hash: groundHash, shell: reshelled ? groundHash : ground.shell }; revision++;
    announce();
    const what = [...changed.length === 0 ? [] : [`changed ${changed.join(', ')}`], ...lookChanged ? ['the look'] : [], ...groundChanged && !reshelled ? ['the ground'] : []];
    idleBuild();
    log(`wildshard watch: revision ${revision}, ${what.length === 0 ? (reshelled ? 'a new shell' : 'parts removed') : what.join(' and ')} in ${Math.round(diagnosticNow() - started)} ms ${timing}`);
  };

  const memo = new PaintMemo();
  let edits = 0, truth: Scope | null = null;
  const compile = async (): Promise<void> => {
    const started = diagnosticNow();
    let described: Awaited<ReturnType<typeof describeSource>>;
    try { described = await describeSource(source, memo); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); log(`wildshard watch: ${error}`); revision++; announce(); return; }
    const guessed = memo.hits, edit = ++edits;
    await push(described.scene, `(bundle ${described.bundleMs} ms, describe ${described.describeMs} ms${guessed > 0 ? `, ${guessed} of ${guessed + memo.misses} textures kept` : ''})`, started);
    // AP17: a kept texture was a guess. Once the page has fetched this revision (painting holds this process), and unless a
    // newer edit came, paint every texture again and push what differs.
    if (guessed === 0) return;
    const verify = async (): Promise<void> => {
      if (edit !== edits || stopped) return;
      const checked = diagnosticNow();
      let painted: ShardScene;
      try { painted = described.describe('truth'); } catch (cause) { log(`wildshard watch: ${cause instanceof Error ? cause.message : String(cause)}`); return; }
      await push(painted, `(a kept texture changed; repainted in ${Math.round(diagnosticNow() - checked)} ms)`, checked);
    };
    truth?.dispose();
    truth = scope.child('sdk.watch.truth');
    truth.timeout(TRUTH_AFTER_MS, () => { work = work.then(verify); });
  };

  // Edits: a native watch per top-level folder (and the root), plus a stamp poll for what native events miss. AP17: the poll
  // runs every 40 to 250 ms, twenty times as long as a stamp takes, since native events don't always come (on a Mac whose
  // FSEvents streams are used up, none do, and a fixed 250 ms poll alone cost an edit 125 ms on average).
  const reconcile = (): void => {
    if (stopped || pending) return;
    const stamped = diagnosticNow(), next = projectSourceStamp(source);
    stampMs = diagnosticNow() - stamped;
    if (next === observed) return;
    observed = next; pending = true; seenAt = Date.now();
    // an edit: the idle full build waits for the next rest, and one running is of a stale source
    idle?.dispose(); idle = null; building?.kill('SIGTERM');
    const run = async (): Promise<void> => {
      pending = false;
      try { if (!stopped) await compile(); } catch (cause) { log(`wildshard watch: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    work = work.then(run);
  };
  try { await compile(); } catch (cause) { rmSync(scratch, { recursive: true, force: true }); throw cause; }
  if (product === '') { rmSync(scratch, { recursive: true, force: true }); throw new Error(`wildshard watch: ${error ?? 'no shell was built'}`); }

  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (path === WATCH_RESHELL && request.method === 'POST') {
        // the page's look refused this revision live: the next compile builds a new shell, which the page reloads into
        reshell = true; observed = ''; reconcile();
        response.writeHead(204); response.end(); return;
      }
      if (path.startsWith(DEV_SCENE_PATH)) {
        const rest = path.slice(DEV_SCENE_PATH.length), [kind = '', name = ''] = rest.split(/\/(.*)/su);
        const hash = kind === 'part' ? parts.find((part) => part.name === name)?.hash : undefined;
        const body = kind === 'part' ? (hash === undefined ? undefined : encodedParts.get(hash)) : kind === 'geometry' ? geometries.get(name) : kind === 'texture' ? textures.get(name) : kind === 'ground' ? grounds.get(name) : undefined;
        if (body === undefined) { response.writeHead(404); response.end(); return; }
        response.setHeader('Content-Type', kind === 'part' ? 'application/json' : 'application/octet-stream');
        response.end(body); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      // AP17: the client's service worker would serve a reloaded page its cached index.html, which has no page script (and
      // an older shell); a watched page runs without one, so watch serves one that removes itself
      if (path === SERVICE_WORKER) { response.setHeader('Content-Type', 'text/javascript'); response.end(NO_SERVICE_WORKER); return; }
      const served = shardRoot !== '' && path.startsWith(shardRoot) ? path.slice(shardRoot.length - 1) : path;
      const file = resolve(product, served === '/' ? 'index.html' : served.slice(1));
      if (!file.startsWith(`${product}${sep}`) || !existsSync(file) || !statSync(file).isFile() || !realpathSync(file).startsWith(`${product}${sep}`)) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      if (request.method === 'HEAD') response.end(); else createReadStream(file).on('error', () => { response.destroy(); }).pipe(response);
    } catch { response.writeHead(400); response.end(); }
  });
  server.on('upgrade', (request, socket) => {
    if (stopped) { socket.destroy(); return; }
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== WATCH_SOCKET) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    // a browser page from anywhere else may not read the scene stream (a Node client sends no Origin)
    const origin = request.headers.origin, address = server.address(), port = address !== null && typeof address === 'object' ? address.port : 0;
    if (origin !== undefined && origin !== `http://127.0.0.1:${String(port)}` && origin !== `http://localhost:${String(port)}`) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const client: WatchSocket | null = acceptSocket(request, socket, () => { if (client !== null) clients.delete(client); });
    if (client === null) return;
    clients.add(client); client.send(state());
  });
  await new Promise<void>((_resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', _resolve); });

  const onChange = (prefix: string) => (_event: string, filename: string | null): void => {
    if (`${prefix}${filename ?? ''}`.split(/[\\/]/u).some((part) => ignored.has(part))) return;
    reconcile();
  };
  const watchers = [watch(source, onChange('')), ...readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignored.has(entry.name))
    .map((entry) => watch(join(source, entry.name), { recursive: true }, onChange(`${entry.name}/`)))];
  const poll = (): void => { reconcile(); scope.timeout(Math.min(250, Math.max(40, Math.round(stampMs * 20))), poll); };
  poll();
  const address = server.address(); if (address === null || typeof address === 'string') throw new Error('No watch server address');
  return { url: `http://127.0.0.1:${address.port}/`, close: async () => {
    if (stopped) return;
    stopped = true; scope.dispose(); building?.kill('SIGTERM');
    for (const client of clients) client.close();
    await new Promise<void>((_resolve) => { server.close(() => { _resolve(); }); server.closeAllConnections(); });
    await work;
    for (const watcher of watchers) watcher.close();
    rmSync(scratch, { recursive: true, force: true });
  } };
}
