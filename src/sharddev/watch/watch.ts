// oxlint-disable-next-line import/no-nodejs-modules -- The author tool serves the watched product and the scene stream.
import { createServer } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Author changes are watched; the product is a private disposable build.
import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Own temporary build directory.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve static requests inside the product directory.
import { extname, join, resolve, sep } from 'node:path';
import { build } from 'vite';
import { diagnosticNow } from '@wildshard/engine/core/clock';
import { Scope } from '@wildshard/engine/app/scope';
import { SDK_ROOT } from '../agentFiles';
import { buildProject } from '../project';
import { projectSourceStamp } from '../dev';
import { executeBundle } from '../executeBundle';
import type { ShardScene } from '../scene/description';
import { hashOf } from '../scene/hash';
import { lampRows, sceneLook, waterRows } from '../scene/shardfile';
import { DEV_SCENE_PATH, WATCH_SOCKET, WATCH_WIRE, encodeGeometry, encodePart, hookMismatch, liveShell, type WatchState } from './protocol';
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
 * A sky, fog, sun colour or ambient edit goes live (the look's day keys). A ground, spawn, grade or sun direction edit
 * can't in M1 (AP17's fast path): it rebuilds the shell and the page reloads, as `dev` does. `wildshard dev` is unchanged.
 */
export interface WatchProject { url: string; close: () => Promise<void> }

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
const ignored = new Set(['node_modules', '.git', 'dist', 'public', '.worktrees', 'tmp']);

/** The scene shard `shard.config.ts` exports (its default or `generate`), read fresh from source. */
async function describeSource(source: string): Promise<{ scene: ShardScene; bundleMs: number; describeMs: number }> {
  const started = diagnosticNow();
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: resolve(source, 'shard.config.ts'), formats: ['es'], fileName: 'config' }, rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  const chunk = built !== undefined && 'output' in built ? built.output.find((out) => out.type === 'chunk') : undefined;
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('watch: shard.config.ts did not bundle to one module');
  const loaded = await executeBundle(chunk.code, source) as Record<string, unknown>;
  const bundled = diagnosticNow();
  const shard = [loaded['default'], loaded['generate']].find((value): value is { describe: () => ShardScene } => typeof value === 'function' && 'describe' in value && typeof value.describe === 'function');
  if (shard === undefined) throw new Error('watch: shard.config.ts exports no scene shard (defineShard from @wildshard/sdk/scene/shard)');
  const scene = shard.describe();
  return { scene, bundleMs: Math.round(bundled - started), describeMs: Math.round(diagnosticNow() - bundled) };
}

/** The shell's look, as the shardfile back end writes it for the live shell: its day keys go live, the rest is the shell's. */
const shellLook = (scene: ShardScene): ReturnType<typeof sceneLook> => sceneLook(scene, liveShell(scene).parts.flatMap((p) => p.lights), {});

/** What a page boots from: a ground, spawn or look change other than its day keys needs a new shell. */
const shellKey = (scene: ShardScene): string => {
  const { keys: _keys, ...look } = shellLook(scene);
  return hashOf((hash) => hash.json({ look, ground: scene.ground?.hash ?? null, spawn: scene.spawn, identity: scene.identity }));
};

/** The page script, bundled once per process from `pageEntry.ts` into one classic script for the page's body. */
export async function pageScript(): Promise<string> {
  // from the sdk's root: the author CLI is one bundle whose import.meta.dirname is src/sharddev (scripts/wildshard.mjs)
  const entry = resolve(SDK_ROOT, 'src/sharddev/watch/pageEntry.ts');
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: true, lib: { entry, formats: ['iife'], name: 'wildshardWatch', fileName: 'watch' }, rolldownOptions: { output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  const chunk = built !== undefined && 'output' in built ? built.output.find((out) => out.type === 'chunk') : undefined;
  if (chunk === undefined || chunk.type !== 'chunk') throw new Error('watch: the page script did not bundle to one module');
  return `<script>${chunk.code.replaceAll('</script', '<\\/script')}</script>`;
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
  let parts: { name: string; hash: string }[] = [], look: WatchState['look'] = { hash: '', keys: [] };
  const encodedParts = new Map<string, Uint8Array>(), geometries = new Map<string, Uint8Array>(), textures = new Map<string, Uint8Array>();
  const clients = new Set<WatchSocket>();
  const state = (): string => JSON.stringify({ wire: WATCH_WIRE, shell, revision, parts, look, error } satisfies WatchState);
  const announce = (): void => { const message = state(); for (const client of clients) client.send(message); };

  const buildShell = async (): Promise<void> => {
    const target = join(scratch, `shell-${shell + 1}`);
    const before = process.env['WILDSHARD_SCENE_LIVE'];
    process.env['WILDSHARD_SCENE_LIVE'] = '1';
    try {
      const built = await buildProject(source, target, { devserver: true, ...(options.client === undefined ? {} : { client: options.client }) });
      const page = join(target, 'index.html');
      script ||= await pageScript();
      if (existsSync(page)) writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', `${script}</body>`));
      if (product !== '') rmSync(product, { recursive: true, force: true });
      product = target; shardRoot = `/shardfiles/${built.identity.slug}/`; shell++;
    } finally { if (before === undefined) delete process.env['WILDSHARD_SCENE_LIVE']; else process.env['WILDSHARD_SCENE_LIVE'] = before; }
  };

  const compile = async (): Promise<void> => {
    const started = diagnosticNow();
    let described: Awaited<ReturnType<typeof describeSource>>;
    try { described = await describeSource(source); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); log(`wildshard watch: ${error}`); revision++; announce(); return; }
    const { scene } = described, key = shellKey(scene);
    if (key !== shellHash) {
      if (shellHash !== '') log('wildshard watch: the ground, spawn or grade changed; rebuilding the shell (the page reloads)');
      // the first shell's failure is the command's; a later one is the page's error, and the old shell keeps serving
      if (shellHash === '') await buildShell();
      else try { await buildShell(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); log(`wildshard watch: ${error}`); revision++; announce(); return; }
      shellHash = key;
    }
    const changed = scene.parts.filter((part) => parts.find((live) => live.name === part.name)?.hash !== part.hash).map((part) => part.name);
    for (const part of scene.parts) {
      if (encodedParts.has(part.hash)) continue;
      encodedParts.set(part.hash, new TextEncoder().encode(JSON.stringify(encodePart(scene, part, { lamps: lampRows(part.lights), water: waterRows(part) }))));
      for (const g of part.geometries) { const geometry = scene.geometries[g]; if (!geometries.has(g) && geometry !== undefined) geometries.set(g, encodeGeometry(geometry)); }
      for (const t of part.textures) { const texture = scene.textures[t]; if (!textures.has(t) && texture !== undefined) textures.set(t, texture.rgba); }
    }
    const next = scene.parts.map((part) => ({ name: part.name, hash: part.hash }));
    const { keys } = shellLook(scene), lookHash = hashOf((hash) => hash.json(keys));
    const same = error === null && lookHash === look.hash && next.length === parts.length && next.every((part, i) => part.name === parts[i]?.name && part.hash === parts[i]?.hash);
    error = null;
    if (same) return;
    const lookChanged = look.hash !== '' && lookHash !== look.hash;
    parts = next; look = { hash: lookHash, keys }; revision++;
    announce();
    const what = [...changed.length === 0 ? [] : [`changed ${changed.join(', ')}`], ...lookChanged ? ['the look'] : []];
    log(`wildshard watch: revision ${revision}, ${what.length === 0 ? 'parts removed' : what.join(' and ')} in ${Math.round(diagnosticNow() - started)} ms (bundle ${described.bundleMs} ms, describe ${described.describeMs} ms)`);
  };

  try { await compile(); } catch (cause) { rmSync(scratch, { recursive: true, force: true }); throw cause; }
  if (product === '') { rmSync(scratch, { recursive: true, force: true }); throw new Error(`wildshard watch: ${error ?? 'no shell was built'}`); }

  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (path.startsWith(DEV_SCENE_PATH)) {
        const rest = path.slice(DEV_SCENE_PATH.length), [kind = '', name = ''] = rest.split(/\/(.*)/su);
        const hash = kind === 'part' ? parts.find((part) => part.name === name)?.hash : undefined;
        const body = kind === 'part' ? (hash === undefined ? undefined : encodedParts.get(hash)) : kind === 'geometry' ? geometries.get(name) : kind === 'texture' ? textures.get(name) : undefined;
        if (body === undefined) { response.writeHead(404); response.end(); return; }
        response.setHeader('Content-Type', kind === 'part' ? 'application/json' : 'application/octet-stream');
        response.end(body); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      const served = shardRoot !== '' && path.startsWith(shardRoot) ? path.slice(shardRoot.length - 1) : path;
      const file = resolve(product, served === '/' ? 'index.html' : served.slice(1));
      if (!file.startsWith(`${product}${sep}`) || !existsSync(file) || !statSync(file).isFile() || !realpathSync(file).startsWith(`${product}${sep}`)) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      if (request.method === 'HEAD') response.end(); else createReadStream(file).on('error', () => { response.destroy(); }).pipe(response);
    } catch { response.writeHead(400); response.end(); }
  });
  server.on('upgrade', (request, socket) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== WATCH_SOCKET) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    const client: WatchSocket | null = acceptSocket(request, socket, () => { if (client !== null) clients.delete(client); });
    if (client === null) return;
    clients.add(client); client.send(state());
  });
  await new Promise<void>((_resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', _resolve); });

  // Edits: a native watch per top-level folder (and the root), plus a 250 ms stamp poll for what native events miss.
  let observed = projectSourceStamp(source), work = Promise.resolve(), pending = false;
  const reconcile = (): void => {
    if (stopped || pending) return;
    const next = projectSourceStamp(source);
    if (next === observed) return;
    observed = next; pending = true;
    const run = async (): Promise<void> => {
      pending = false;
      try { if (!stopped) await compile(); } catch (cause) { log(`wildshard watch: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    work = work.then(run);
  };
  const onChange = (prefix: string) => (_event: string, filename: string | null): void => {
    if (`${prefix}${filename ?? ''}`.split(/[\\/]/u).some((part) => ignored.has(part))) return;
    reconcile();
  };
  const watchers = [watch(source, onChange('')), ...readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignored.has(entry.name))
    .map((entry) => watch(join(source, entry.name), { recursive: true }, onChange(`${entry.name}/`)))];
  const scope = new Scope('sdk.watch');
  scope.interval(250, reconcile);
  const address = server.address(); if (address === null || typeof address === 'string') throw new Error('No watch server address');
  return { url: `http://127.0.0.1:${address.port}/`, close: async () => {
    if (stopped) return;
    stopped = true; scope.dispose();
    for (const client of clients) client.close();
    await new Promise<void>((_resolve) => { server.close(() => { _resolve(); }); server.closeAllConnections(); });
    await work;
    for (const watcher of watchers) watcher.close();
    rmSync(scratch, { recursive: true, force: true });
  } };
}
