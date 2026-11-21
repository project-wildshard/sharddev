import { afterEach, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns a bounded local release server and cache.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Packs the stand-in release asset the way engine's script does.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- A loopback stand-in for the GitHub release download.
import { createServer } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { join, resolve } from 'node:path';
import { DEV_CLIENT_ASSET, devClientTag, engineClientTag, enginePin, fetchDevClient, fetchPreparationClient } from './devClient';

// SD-2 (HOW-WE-BUILD, SHARD-AUTHORING SA15): an installed `wildshard dev` fetches engine's devserver client at its pin.
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function scratch(): string {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'dev-client-')); directories.push(root); return root;
}
function archive(root: string, flags: unknown, version?: unknown): string {
  const client = join(root, 'client');
  mkdirSync(client, { recursive: true });
  writeFileSync(join(client, 'index.html'), '<html><head></head><body></body></html>');
  writeFileSync(join(client, 'build-flags.json'), JSON.stringify(flags));
  if (version !== undefined) writeFileSync(join(client, 'version.json'), JSON.stringify(version));
  const file = join(root, DEV_CLIENT_ASSET);
  execFileSync('tar', ['-czf', file, '-C', client, '.']);
  return file;
}
async function serve(file: string): Promise<{ url: string; reads: string[]; close: () => Promise<void> }> {
  const reads: string[] = [];
  const server = createServer((request, response) => { reads.push(request.url ?? ''); response.end(readFileSync(file)); });
  await new Promise<void>((_resolve) => { server.listen(0, "127.0.0.1", _resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  return { url: `http://127.0.0.1:${String(address.port)}/${DEV_CLIENT_ASSET}`, reads, close: () => new Promise((_resolve) => { server.close(() => { _resolve(); }); }) };
}

test('the engine pin names the release that holds its dev client', () => {
  const sha = '867f3b968429d8b90ae33b363dae3f15f16f6b84';
  expect(devClientTag(`github:project-wildshard/engine#${sha}`)).toBe(`server-staging-${sha}`);
  expect(devClientTag('0.1.17')).toBe('v0.1.17');
  expect(devClientTag('^0.1.17')).toBe('v0.1.17');
  expect(() => devClientTag('github:project-wildshard/engine#main')).toThrow(/engine pin/u);
});

// SHARD-SOURCE (opus-ss10k found it): a shard that overrides @wildshard/engine (pnpm.overrides, npm overrides) runs that
// engine, so prepare and dev must fetch its clients, not the ones at the version the dev package declares.
test('an installed engine the shard overrode names the pin, a commit pin stays', () => {
  const root = scratch(), modules = join(root, 'node_modules', '@wildshard'), dev = join(modules, 'dev');
  const write = (dir: string, manifest: unknown): void => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest)); };
  write(dev, { name: '@wildshard/dev', dependencies: { '@wildshard/engine': '0.1.35' } });
  expect(enginePin(dev)).toBe('0.1.35');
  write(join(modules, 'engine'), { name: '@wildshard/engine', version: '0.1.39' });
  expect(enginePin(dev)).toBe('0.1.39');
  const sha = '867f3b968429d8b90ae33b363dae3f15f16f6b84';
  write(dev, { name: '@wildshard/dev', dependencies: { '@wildshard/engine': `github:project-wildshard/engine#${sha}` } });
  expect(enginePin(dev)).toBe(`github:project-wildshard/engine#${sha}`);
});

test('the staging npm pin fetches both clients from its exact build release', () => {
  const root = scratch(), engine = join(root, 'node_modules', '@wildshard', 'engine');
  const build = '867f3b968429d8b90ae33b363dae3f15f16f6b84';
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@wildshard/engine': '0.1.44' },
    wildshardStagingClients: { '0.1.44': build }, wildshardPreparationClients: { '0.1.44': '0.1.46' } }));
  expect(enginePin(root)).toBe('0.1.44');
  expect(engineClientTag(root)).toBe(`server-staging-${build}`);
  expect(engineClientTag(root, true)).toBe('v0.1.46');
  expect(engineClientTag(root, false, '0.1.44')).toBe(`server-staging-${build}`);
  mkdirSync(engine, { recursive: true });
  writeFileSync(join(engine, 'package.json'), JSON.stringify({ version: '0.1.45' }));
  expect(engineClientTag(root)).toBe('v0.1.45');
  expect(engineClientTag(root, true)).toBe('v0.1.45');
});

test('the client is fetched once into the cache, then read from it', async () => {
  const root = scratch(), release = await serve(archive(root, { devserver: true }));
  try {
    const cache = join(root, 'cache');
    const first = await fetchDevClient({ pin: '0.1.17', cache, url: release.url });
    expect(readFileSync(join(first, 'index.html'), 'utf8')).toMatch(/<body>/u);
    expect(first).toBe(join(cache, 'v0.1.17'));
    expect(await fetchDevClient({ pin: '0.1.17', cache, url: release.url })).toBe(first);
    expect(release.reads).toHaveLength(1);
  } finally { await release.close(); }
});

test('a client not compiled in devserver mode is refused and not kept', async () => {
  const root = scratch(), release = await serve(archive(root, { devserver: false }));
  try {
    const cache = join(root, 'cache');
    await expect(fetchDevClient({ pin: '0.1.17', cache, url: release.url })).rejects.toThrow(/devserver/u);
    await expect(fetchDevClient({ pin: '0.1.17', cache, url: release.url })).rejects.toThrow(/devserver/u);
    expect(release.reads).toHaveLength(2);
  } finally { await release.close(); }
});

test('a missing release names the tag and the asset', async () => {
  const root = scratch();
  const server = createServer((_request, response) => { response.writeHead(404); response.end(); });
  await new Promise<void>((_resolve) => { server.listen(0, "127.0.0.1", _resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  try {
    await expect(fetchDevClient({ pin: '0.1.17', cache: join(root, 'cache'), url: `http://127.0.0.1:${String(address.port)}/x` }))
      .rejects.toThrow(/v0\.1\.17.*devserver-client\.tar\.gz.*404/u);
  } finally { await new Promise<void>((_resolve) => { server.close(() => { _resolve(); }); }); }
});

// SA43: `wildshard prepare` with no --base fetches engine's preparation client the same way, beside the dev client.
test('the preparation client is a preparation-only production build, kept beside the dev client', async () => {
  const root = scratch(), release = await serve(archive(root, { devserver: false }, { preparationOnly: true }));
  try {
    const cache = join(root, 'cache'), folder = await fetchPreparationClient({ pin: '0.1.17', cache, url: release.url });
    expect(folder).toBe(join(cache, 'v0.1.17-preparation'));
    expect(await fetchPreparationClient({ pin: '0.1.17', cache, url: release.url })).toBe(folder);
    expect(release.reads).toHaveLength(1);
  } finally { await release.close(); }
  for (const [flags, version] of [[{ devserver: true }, { preparationOnly: true }], [{ devserver: false }, { preparationOnly: false }]] as const) {
    const other = scratch(), refused = await serve(archive(other, flags, version));
    try {
      await expect(fetchPreparationClient({ pin: '0.1.17', cache: join(other, 'cache'), url: refused.url })).rejects.toThrow(/preparation-only production build/u);
    } finally { await refused.close(); }
  }
});

test('the installed SDK defaults to the v0.1.59 preparation client', async () => {
  const root = scratch();
  const file = archive(root, { devserver: false }, { preparationOnly: true });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(readFileSync(file))));
  try {
    const cache = join(root, 'cache');
    expect(await fetchPreparationClient({ cache })).toBe(join(cache, 'v0.1.59-preparation'));
    expect(await fetchPreparationClient({ pin: '0.1.59', cache })).toBe(join(cache, 'v0.1.59-preparation'));
    expect(engineClientTag(undefined, true, '0.1.54')).toBe('v0.1.59');
    expect(engineClientTag(undefined, false, '0.1.54')).toBe('v0.1.54');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://github.com/project-wildshard/engine/releases/download/v0.1.59/preparation-client.tar.gz');
  } finally { fetch.mockRestore(); }
});

test('a preparation client URL from another engine release is fetched, named and cached as that release', async () => {
  // meta NET-LAG NL12: publish.yml's `preparation` input sets the URL; the log named the sdk's pin, so it read as ignored.
  const root = scratch(), tag = `server-staging-${'2'.repeat(40)}`;
  const file = archive(root, { devserver: false }, { preparationOnly: true });
  const url = `https://github.com/project-wildshard/engine/releases/download/${tag}/preparation-client.tar.gz`;
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(readFileSync(file)));
  const progress = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const cache = join(root, 'cache');
    expect(await fetchPreparationClient({ pin: '0.1.17', cache, url })).toBe(join(cache, `${tag}-preparation`));
    expect(fetch).toHaveBeenCalledWith(url);
    expect(progress.mock.calls.flat().join('\n')).toContain(`preparation client (${tag})`);
  } finally { fetch.mockRestore(); progress.mockRestore(); }
});

test('preparation announces the download size before receiving the archive body', async () => {
  const root = scratch(), bytes = readFileSync(archive(root, { devserver: false }, { preparationOnly: true }));
  let announced = false, sent = false;
  let release: (() => void) | undefined;
  const progress = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
    if (String(message).includes('downloading')) { announced = !sent; release?.(); }
  });
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Length': bytes.length }); response.flushHeaders();
    const timer = setTimeout(() => { sent = true; response.end(bytes); }, 1000);
    release = (): void => { clearTimeout(timer); sent = true; response.end(bytes); };
  });
  await new Promise<void>((_resolve) => { server.listen(0, '127.0.0.1', _resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  try {
    await fetchPreparationClient({ pin: '0.1.17', cache: join(root, 'cache'), url: `http://127.0.0.1:${String(address.port)}/client` });
    expect(announced).toBe(true);
    expect(sent).toBe(true);
  } finally { progress.mockRestore(); await new Promise<void>((_resolve) => { server.close(() => { _resolve(); }); }); }
});
