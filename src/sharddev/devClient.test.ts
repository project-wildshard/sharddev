import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns a bounded local release server and cache.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Packs the stand-in release asset the way engine's script does.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- A loopback stand-in for the GitHub release download.
import { createServer } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { join, resolve } from 'node:path';
import { DEV_CLIENT_ASSET, devClientTag, fetchDevClient } from './devClient';

// SD-2 (HOW-WE-BUILD, SHARD-AUTHORING SA15): an installed `wildshard dev` fetches engine's devserver client at its pin.
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function scratch(): string {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'dev-client-')); directories.push(root); return root;
}
function archive(root: string, flags: unknown): string {
  const client = join(root, 'client');
  mkdirSync(client, { recursive: true });
  writeFileSync(join(client, 'index.html'), '<html><head></head><body></body></html>');
  writeFileSync(join(client, 'build-flags.json'), JSON.stringify(flags));
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
