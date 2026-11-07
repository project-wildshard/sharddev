// oxlint-disable-next-line import/no-nodejs-modules -- Serve only built static products from the local author tool.
import { createServer } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Author changes rebuild a private disposable product.
import { createReadStream, existsSync, mkdtempSync, realpathSync, readdirSync, rmSync, statSync, watch, readFileSync, writeFileSync, type Dirent } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Own temporary build directory.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve static requests inside the product directory.
import { extname, join, resolve, sep } from 'node:path';
import { buildProject } from './project';
import { Scope } from '@wildshard/engine/app/scope';

const POLL = '<script>let wsRevision=WS_REVISION;setInterval(async()=>{try{const r=await fetch("/__wildshard_dev_revision",{cache:"no-store"});const s=await r.json();if(s.error){console.error(s.error);return}if(s.revision!==wsRevision)location.reload()}catch{}},500)</script>';
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
const ignored = new Set(['node_modules', '.git', 'dist', 'public']);

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
/** A rebuilt static author client. Closing it releases its watcher, socket and private build products. */
export interface DevProject { url: string; close: () => Promise<void> }
/** Only the author command chooses DEVSERVER; requests, cookies and URL switches cannot enable it. */
export async function devProject(project: string, options: { decisionLegacyLines?: number; port?: number; client?: string } = {}): Promise<DevProject> {
  const source = resolve(project), scratch = realpathSync(mkdtempSync(join(tmpdir(), 'wildshard-dev-')));
  let revision = 0, error: string | null = null, current = '', previous = '', stopped = false;
  const scope = new Scope('sdk.dev');
  let debounce: Scope | undefined, work = Promise.resolve();
  const rebuild = async (): Promise<void> => {
    if (stopped) return;
    const target = join(scratch, `build-${revision + 1}`);
    try {
      await buildProject(source, target, { devserver: true, ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }), ...(options.client === undefined ? {} : { client: options.client }) });
      const page = join(target, 'index.html');
      if (!existsSync(page)) throw new Error('wildshard dev requires the SDK devserver client; build/pack the SDK first');
      const flags: unknown = JSON.parse(readFileSync(join(target, 'build-flags.json'), 'utf8'));
      if (typeof flags !== 'object' || flags === null || !('devserver' in flags) || flags.devserver !== true) throw new Error('wildshard dev requires a client compiled in devserver mode');
      writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', `${POLL.replace('WS_REVISION', String(revision + 1))}</body>`));
      if (previous !== '') rmSync(previous, { recursive: true, force: true });
      previous = current; current = target; revision++; error = null;
    } catch (cause) {
      rmSync(target, { recursive: true, force: true }); error = cause instanceof Error ? cause.message : String(cause);
      if (current === '') throw cause;
      console.error(`wildshard dev: rebuild failed; serving previous product: ${error}`);
    }
  };
  try { await rebuild(); } catch (cause) { rmSync(scratch, { recursive: true, force: true }); throw cause; }
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (path === '/__wildshard_dev_revision') {
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ revision, error })); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      const local = path === '/' ? 'index.html' : path.slice(1);
      const file = [current, previous].filter((dir) => dir !== '').map((dir) => ({ dir, file: resolve(dir, local) }))
        .find(({ dir, file: candidate }) => candidate.startsWith(`${dir}${sep}`) && existsSync(candidate) && statSync(candidate).isFile() && realpathSync(candidate).startsWith(`${dir}${sep}`));
      if (file === undefined) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', MIME[extname(file.file)] ?? 'application/octet-stream');
      if (request.method === 'HEAD') response.end(); else createReadStream(file.file).on('error', () => { response.destroy(); }).pipe(response);
    } catch { response.writeHead(400); response.end(); }
  });
  try {
    await new Promise<void>((_resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', _resolve); });
  } catch (cause) { rmSync(scratch, { recursive: true, force: true }); throw cause; }
  let observed = projectSourceStamp(source);
  const reconcile = (): void => {
    const next = projectSourceStamp(source);
    if (next === observed) return;
    observed = next;
    debounce?.dispose(); debounce = scope.child('rebuild.debounce');
    debounce.timeout(100, () => { debounce?.dispose(); work = work.then(rebuild); });
  };
  const watcher = watch(source, { recursive: true }, (_event, filename) => {
    if (filename?.split(/[\\/]/u).some((part) => ignored.has(part))) return;
    reconcile();
  });
  // Capture before returning the ready server; polling covers native-event gaps without rebuilding unchanged input.
  scope.interval(250, reconcile);
  const address = server.address(); if (address === null || typeof address === 'string') throw new Error('No author server address');
  return { url: `http://127.0.0.1:${address.port}/`, close: async () => {
    if (stopped) return;
    stopped = true; watcher.close(); scope.dispose();
    await new Promise<void>((_resolve) => { server.close(() => { _resolve(); }); server.closeAllConnections(); });
    // A build already running owns its directory until its promise finishes.
    await work;
    rmSync(scratch, { recursive: true, force: true });
  } };
}
