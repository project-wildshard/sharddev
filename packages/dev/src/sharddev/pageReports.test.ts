// oxlint-disable-next-line import/no-nodejs-modules -- A loopback server stands in for dev's and watch's.
import { createServer, type Server } from 'node:http';
// oxlint-disable-next-line import/no-nodejs-modules -- Read dev's and watch's own source.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { pageErrorLine, takePageReport } from './pageReports';

// meta MMO-OBSERVABILITY OB10b (F33): on 11-16 `wildshard dev` and `watch` answered the page's `POST /api/errors` and
// `POST /api/telemetry` with 405, so a shard author's page errors went nowhere.

const lines: string[] = [];
let server: Server, origin = '';
beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (takePageReport(path, request, response, (line) => { lines.push(line); }, 'wildshard dev')) return;
    response.writeHead(405); response.end();
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => { server.close(() => { resolve(); }); }); });

const report = { system: 'level', message: 'AggregateError: Level load and cleanup failed', stack: 'AggregateError: Level load and cleanup failed\n    at load (load.ts:78)\n    at boot (boot.ts:12)', count: 1, fatal: true, disabled: false, sinceBootMs: 900, context: {} };

test('an error post is taken (204) and printed with its first stack lines', async () => {
  lines.length = 0;
  const response = await fetch(`${origin}/api/errors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
  expect(response.status).toBe(204);
  expect(lines).toEqual(['wildshard dev: page error [level] (fatal): AggregateError: Level load and cleanup failed\n  at load (load.ts:78)\n  at boot (boot.ts:12)']);
});

test('a telemetry post is taken (204) and prints nothing', async () => {
  lines.length = 0;
  const response = await fetch(`${origin}/api/telemetry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"kind":"crossroads"}' });
  expect(response.status).toBe(204);
  expect(lines).toEqual([]);
});

test('any other post still refuses with 405', async () => {
  expect((await fetch(`${origin}/api/inbox`, { method: 'POST', body: '{}' })).status).toBe(405);
});

test('a body that is not a report prints nothing', () => {
  expect(pageErrorLine('nope')).toBeUndefined();
  expect(pageErrorLine({ system: 'x' })).toBeUndefined();
  expect(pageErrorLine({ message: 'plain' })).toBe('page error [page]: plain');
});

test('dev and watch both take page reports before their 405', () => {
  for (const file of ['./dev.ts', './watch/watch.ts']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    const take = text.indexOf('takePageReport(path, request, response'), refuse = text.indexOf('response.writeHead(405)');
    expect(take, file).toBeGreaterThan(0);
    expect(take, file).toBeLessThan(refuse);
  }
});
