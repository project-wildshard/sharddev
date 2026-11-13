// SD-2 (meta HOW-WE-BUILD-PLAN, SHARD-AUTHORING SA15, J314): an installed `wildshard dev` serves engine's devserver client,
// the normal game page compiled in devserver mode. The package can't build it (it is engine's whole app build), so engine
// publishes it on the GitHub release of every tag (ENG-16: `scripts/devserver-client.mjs`, server-release.yml) and this
// fetches it once per engine pin into the user's cache.
// oxlint-disable-next-line import/no-nodejs-modules -- The author tool downloads and unpacks one archive into its cache.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- `tar` unpacks the archive, as on every author machine.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The default cache is under the user's home.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Cache paths.
import { join, resolve } from 'node:path';

/** The release asset engine's `scripts/devserver-client.mjs` writes. */
export const DEV_CLIENT_ASSET = 'devserver-client.tar.gz';
/** SA43: the preparation client, `scripts/devserver-client.mjs --kind preparation`: engine's production build made with
 *  `WILDSHARD_PREPARATION_ONLY=1`, which `wildshard prepare` serves with the author's draft inline. */
export const PREPARATION_CLIENT_ASSET = 'preparation-client.tar.gz';
const RELEASES = 'https://github.com/project-wildshard/engine/releases/download';

/** The engine release that holds the client for this package's engine pin: a commit pin (a green main build) is its
 *  `server-staging-<sha>` release, a version pin is its `v<version>` tag. */
export function devClientTag(pin: string): string {
  const commit = /#([0-9a-f]{40})$/u.exec(pin)?.[1];
  if (commit !== undefined) return `server-staging-${commit}`;
  const version = /^[~^]?(\d+\.\d+\.\d+)$/u.exec(pin)?.[1];
  if (version !== undefined) return `v${version}`;
  throw new Error(`wildshard: the engine pin ${pin} names no release (a 40-character commit or an exact version)`);
}

/** This package's engine pin, from its own package.json. */
export function enginePin(): string {
  const manifest: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'));
  const pin: unknown = typeof manifest === 'object' && manifest !== null && 'dependencies' in manifest && typeof manifest.dependencies === 'object' && manifest.dependencies !== null
    ? (manifest.dependencies as Record<string, unknown>)['@wildshard/engine'] : undefined;
  if (typeof pin !== 'string') throw new Error('wildshard dev: this package names no @wildshard/engine dependency');
  return pin;
}

/** `$WILDSHARD_DEV_CLIENT_CACHE`, else `$XDG_CACHE_HOME/wildshard/dev-client`, else `~/.cache/wildshard/dev-client`. */
export function devClientCache(): string {
  const env = process.env['WILDSHARD_DEV_CLIENT_CACHE'];
  if (env !== undefined && env !== '') return env;
  const xdg = process.env['XDG_CACHE_HOME'];
  return join(xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.cache'), 'wildshard', 'dev-client');
}

function assertDevserver(folder: string): void {
  if (!existsSync(join(folder, 'index.html'))) throw new Error(`wildshard dev: the dev client has no index.html (${folder})`);
  const flags: unknown = JSON.parse(readFileSync(join(folder, 'build-flags.json'), 'utf8'));
  if (typeof flags !== 'object' || flags === null || !('devserver' in flags) || flags.devserver !== true) throw new Error('wildshard dev: the dev client was not compiled in devserver mode');
}

/** The client `wildshard dev` serves: `$WILDSHARD_DEV_CLIENT` (a folder, such as an engine checkout's devserver build), a
 *  client packed into this package (`client-devserver` beside the author tools), else engine's release at the pin. */
export function devClient(): Promise<string> {
  const named = process.env['WILDSHARD_DEV_CLIENT'];
  if (named !== undefined && named !== '') { const folder = resolve(named); assertDevserver(folder); return Promise.resolve(folder); }
  const packed = [resolve(import.meta.dirname, 'client-devserver'), resolve(import.meta.dirname, 'dist', 'client-devserver')].find((path) => existsSync(join(path, 'index.html')));
  return packed === undefined ? fetchDevClient() : Promise.resolve(packed);
}

/** SA43: a preparation client is a production build (DEVSERVER off) whose version document says preparation-only. */
function assertPreparation(folder: string): void {
  if (!existsSync(join(folder, 'index.html'))) throw new Error(`wildshard prepare: the preparation client has no index.html (${folder})`);
  const read = (name: string): unknown => existsSync(join(folder, name)) ? JSON.parse(readFileSync(join(folder, name), 'utf8')) : null;
  const flags = read('build-flags.json'), version = read('version.json');
  if (typeof flags !== 'object' || flags === null || !('devserver' in flags) || flags.devserver !== false
    || typeof version !== 'object' || version === null || !('preparationOnly' in version) || version.preparationOnly !== true) {
    throw new Error('wildshard prepare: the preparation client is not a preparation-only production build');
  }
}

/** The client `wildshard prepare` serves: `$WILDSHARD_PREPARATION_CLIENT` (a folder, such as an engine checkout's
 *  `devserver-client.mjs --kind preparation --keep <folder>`), else engine's release at this package's pin. */
export function preparationClient(): Promise<string> {
  const named = process.env['WILDSHARD_PREPARATION_CLIENT'];
  if (named !== undefined && named !== '') { const folder = resolve(named); assertPreparation(folder); return Promise.resolve(folder); }
  return fetchPreparationClient();
}

/** The unpacked preparation client for `pin`, fetched on first use beside the dev client (`<tag>-preparation`). `url`
 *  replaces the GitHub download (`$WILDSHARD_PREPARATION_CLIENT_URL`). */
export function fetchPreparationClient(options: { pin?: string; cache?: string; url?: string } = {}): Promise<string> {
  return fetchClient({ ...options, url: options.url ?? process.env['WILDSHARD_PREPARATION_CLIENT_URL'] }, {
    asset: PREPARATION_CLIENT_ASSET, suffix: '-preparation', verb: 'prepare', label: 'preparation client', check: assertPreparation });
}

/** The unpacked client folder for `pin`, fetched on first use. `url` replaces the GitHub download (tests, mirrors:
 *  `$WILDSHARD_DEV_CLIENT_URL`). A failed or refused download keeps nothing. */
export function fetchDevClient(options: { pin?: string; cache?: string; url?: string } = {}): Promise<string> {
  return fetchClient({ ...options, url: options.url ?? process.env['WILDSHARD_DEV_CLIENT_URL'] }, {
    asset: DEV_CLIENT_ASSET, suffix: '', verb: 'dev', label: 'dev client', check: assertDevserver });
}

interface ClientAsset { asset: string; suffix: string; verb: string; label: string; check: (folder: string) => void }
async function fetchClient(options: { pin?: string; cache?: string; url?: string | undefined }, kind: ClientAsset): Promise<string> {
  const tag = devClientTag(options.pin ?? enginePin()), cache = options.cache ?? devClientCache(), folder = join(cache, `${tag}${kind.suffix}`);
  if (existsSync(join(folder, 'index.html'))) return folder;
  const url = options.url ?? `${RELEASES}/${tag}/${kind.asset}`;
  // prepare prints its result as JSON on stdout, so its progress goes to stderr
  const progress = kind.verb === 'prepare' ? console.error : console.info;
  progress(`wildshard ${kind.verb}: fetching engine's ${kind.label} (${tag}) once, into ${cache}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`wildshard ${kind.verb}: engine release ${tag} has no ${kind.asset} (${url}: ${String(response.status)})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(cache, { recursive: true });
  const part = join(cache, `${tag}${kind.suffix}.part-${String(process.pid)}`), archive = `${part}.tar.gz`;
  rmSync(part, { recursive: true, force: true }); mkdirSync(part);
  try {
    writeFileSync(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', part]);
    kind.check(part);
    if (!existsSync(join(folder, 'index.html'))) { rmSync(folder, { recursive: true, force: true }); renameSync(part, folder); }
  } finally { rmSync(part, { recursive: true, force: true }); rmSync(archive, { force: true }); }
  progress(`wildshard ${kind.verb}: engine's ${kind.label} ${tag}, ${(bytes.length / 1e6).toFixed(1)} MB`);
  return folder;
}
