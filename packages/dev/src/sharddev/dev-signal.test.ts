// oxlint-disable-next-line import/no-nodejs-modules -- Spawn the real `wildshard dev` and signal it.
import { spawn, type ChildProcess } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- A scratch shard and a stand-in devserver client.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Probe whether the port is still bound.
import { connect } from 'node:net';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the bin and the scratch project.
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeShardRepo } from '../../../sdk/src/sharddev/newProject';
import { closeFixtures, fixtureRoot } from '../../../sdk/src/sharddev/test/ownedScratch';

// HOW-WE-BUILD SD-6: Ctrl-C (SIGINT) or SIGTERM ends `wildshard dev` and frees its port within 2 s, page open or not.
const BIN = resolve(import.meta.dirname, '../../bin/wildshard.mjs');
let root = '';
beforeAll(() => {
  root = fixtureRoot('dev-signal-');
  const client = join(root, 'client');
  mkdirSync(client);
  writeFileSync(join(client, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
  writeFileSync(join(client, 'build-flags.json'), JSON.stringify({ devserver: true }));
  writeShardRepo(join(root, 'shard'), 'dev-signal');
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); closeFixtures(); });

/** Starts `wildshard dev` on the scratch shard; resolves with the child and the URL it prints. */
async function startDev(): Promise<{ child: ChildProcess; url: URL }> {
  const child = spawn(process.execPath, [BIN, 'dev', join(root, 'shard', 'src')], { env: { ...process.env, WS_LANE_NAME: `test-dev-${process.pid}`, WILDSHARD_DEV_CLIENT: join(root, 'client') } });
  let output = '';
  const url = await new Promise<URL>((_resolve, reject) => {
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); const found = /wildshard dev: (http:\/\/\S+)/u.exec(output); if (found?.[1] !== undefined) _resolve(new URL(found[1])); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.once('exit', (code) => { reject(new Error(`wildshard dev exited ${String(code)} before serving: ${output}`)); });
  });
  return { child, url };
}

/** True while something accepts connections on `port`. */
const bound = (port: number): Promise<boolean> => new Promise((_resolve) => {
  const socket = connect(port, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); _resolve(true); });
  socket.once('error', () => { _resolve(false); });
});

describe('wildshard dev on a signal', () => {
  it('a killed dev process leaves an owned pidfile for the manual audit', async () => {
    const { child, url } = await startDev();
    try {
      const scratch = join(root, 'shard', 'tmp', `test-dev-${process.pid}`);
      const output = readdirSync(scratch).find(name => name.startsWith(['dev', String(child.pid), ''].join('-')));
      expect(output).toBeDefined();
      const directory = join(scratch, output ?? '');
      expect(readFileSync(join(directory, 'server.pid'), 'utf8')).toBe(String(child.pid));
      const exited = new Promise<void>((_resolve) => { child.once('exit', () => { _resolve(); }); });
      child.kill('SIGKILL');
      await exited;
      expect(await bound(Number(url.port))).toBe(false);
      expect(existsSync(join(directory, '.owner'))).toBe(true);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  }, 60_000);
  // NEW-SHARD-E2E F18, F19: a rebuild reopens the page under a new devrev (never location.reload, which the engine reads as
  // the player's own reload and sends to the title), and the page's service worker takes nothing and unregisters itself.
  it('serves a page that reopens under a new devrev and a service worker that removes itself', async () => {
    const { child, url } = await startDev();
    try {
      const page = await (await fetch(new URL('/', url))).text();
      expect(page).toContain('searchParams.set("devrev"');
      expect(page).not.toContain('location.reload()');
      const worker = await fetch(new URL('/sw.js', url));
      expect(worker.headers.get('content-type')).toBe('text/javascript');
      const code = await worker.text();
      expect(code).toContain('registration.unregister()');
      expect(code).not.toContain('fetch');
    } finally { child.kill('SIGKILL'); }
  }, 60_000);
  it.each([
    ['SIGINT', false], ['SIGTERM', false], ['SIGINT', true],
  ] as const)('%s ends it and frees the port within 2 s (page open: %s)', async (signal, pageOpen) => {
    const { child, url } = await startDev();
    try {
      const port = Number(url.port);
      expect(await bound(port)).toBe(true);
      // An open page polls the revision over a kept-alive connection; hold one open across the signal.
      const held = pageOpen ? connect(port, '127.0.0.1') : undefined;
      if (held !== undefined) {
        await new Promise<void>((_resolve) => { held.once('connect', () => { _resolve(); }); });
        held.write(`GET /__wildshard_dev_revision HTTP/1.1\r\nHost: ${url.host}\r\nConnection: keep-alive\r\n\r\n`);
        await new Promise<void>((_resolve) => { held.once('data', () => { _resolve(); }); });
        held.on('error', () => { /* the server closing it is the point */ });
      }
      const started = Date.now();
      const exited = new Promise<number | null>((_resolve) => { child.once('exit', (code) => { _resolve(code); }); });
      child.kill(signal);
      const code = await Promise.race([exited, new Promise<'timeout'>((_resolve) => { setTimeout(() => { _resolve('timeout'); }, 2000); })]);
      expect(code).toBe(0);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(await bound(port)).toBe(false);
      held?.destroy();
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  }, 60_000);
});
