// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real built folder's index in a scratch folder.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { admissionLine } from './admissionLine';

// SHARD-COMPAT CP7: check's line names the file's format, the API's, and what admission will do; an older pin asks the
// API's dry run for the migrations, and no answer is "offline", never a failure.
const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
mkdirSync(parent, { recursive: true });
const scratch = mkdtempSync(join(parent, 'admission-line-'));
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

/** A built folder whose index declares `format`, and its written shard file. */
function built(format: string): { folder: string; file: string } {
  const folder = mkdtempSync(join(scratch, 'shard-'));
  writeFileSync(join(folder, 'shard.json'), JSON.stringify({ formatVersion: format }));
  const file = join(folder, 'shard.tar');
  writeFileSync(file, 'tar bytes');
  return { folder, file };
}

const NO_DRY_RUN = { status: 500, body: {} };
/** A fetch answering `/api/format` at `current` and the dry run with `dry`; it records the paths asked. */
function api(current: string, dry: { status: number; body: unknown } = NO_DRY_RUN): { asked: string[]; fetch: typeof fetch } {
  const asked: string[] = [];
  const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
    const { pathname } = new URL(String(input));
    asked.push(pathname);
    return await Promise.resolve(pathname === '/api/format' ? Response.json({ ok: true, current }) : Response.json(dry.body, { status: dry.status }));
  };
  return { asked, fetch: fetcher as typeof fetch };
}

const SERVER = 'http://api.test';

describe('check admission line', () => {
  it('takes a file at the API format as is, without sending it', async () => {
    const { folder, file } = built('0.1.0.3'), fake = api('0.1.0.3');
    expect(await admissionLine(folder, file, { server: SERVER, fetch: fake.fetch })).toBe('format 0.1.0.3, the API is at 0.1.0.3: admission takes it as is; deprecated: none');
    expect(fake.asked).toEqual(['/api/format']);
  });

  it('asks the dry run for an older pin and names the migrations', async () => {
    const { folder, file } = built('0.1.0.2');
    const fake = api('0.1.0.3', { status: 200, body: { ok: true, apiFormat: '0.1.0.3', migrations: ['preparation-marker'] } });
    expect(await admissionLine(folder, file, { server: SERVER, fetch: fake.fetch })).toBe('format 0.1.0.2, the API is at 0.1.0.3: admission will migrate (preparation-marker); deprecated: none');
    expect(fake.asked).toEqual(['/api/format', '/api/shardfiles/dry-run']);
  });

  it('says a newer file waits for the API', async () => {
    const { folder, file } = built('0.1.0.4');
    expect(await admissionLine(folder, file, { server: SERVER, fetch: api('0.1.0.3').fetch })).toBe("format 0.1.0.4 is newer than the API's 0.1.0.3: upload waits until the API updates");
  });

  it('names the API refusal of an older file', async () => {
    const { folder, file } = built('0.1.0.2');
    const fake = api('0.1.0.3', { status: 422, body: { ok: false, error: 'heights moved' } });
    expect(await admissionLine(folder, file, { server: SERVER, fetch: fake.fetch })).toBe('format 0.1.0.2, the API is at 0.1.0.3: the API refuses it (heights moved)');
  });

  it('is offline, never a failure, when the API does not answer', async () => {
    const { folder, file } = built('0.1.0.2');
    const down = (async () => await Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    expect(await admissionLine(folder, file, { server: SERVER, fetch: down })).toBe('format 0.1.0.2; offline: local format only');
  });
});
