// oxlint-disable-next-line import/no-nodejs-modules -- The memo fixture owns repository scratch.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scratch paths never touch the shared gen cache.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The uncached reference is the gzip itself.
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';

// The keyed sky's gzip memo (keyedSkyMemo.ts, the build's encodeGainKey capability): a cold call, a hit and a damaged memo all return the uncached transform's bytes.
test('the gain-key memo returns the exact gzip bytes cold, warm and after damage', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/sp-o5-gain-key-'));
  process.env['WILDSHARD_GAIN_KEY_CACHE'] = root;
  try {
    const { encodeGainKeyMemo: encodeGainKey } = await import('../src/sharddev/bake/keyedSkyMemo');
    const data = Uint16Array.from({ length: 64 * 32 * 3 }, (_v, i) => (i * 2654435761) % 31744);
    const reference = gzipSync(new Uint8Array(data.buffer), { level: 9 }); reference[9] = 19;
    const cold = encodeGainKey(data);
    expect(Buffer.compare(cold, reference)).toBe(0);
    expect(readdirSync(root).filter(f => f.endsWith('.bin'))).toHaveLength(1);
    const warm = encodeGainKey(data);
    expect(Buffer.compare(warm, reference)).toBe(0); expect(warm).not.toBe(cold);
    // a damaged body fails its hash and the gzip runs again
    const body = readdirSync(root).find(f => f.endsWith('.bin')); if (body === undefined) throw new Error('memo');
    writeFileSync(resolve(root, body), Buffer.from('damaged'));
    expect(Buffer.compare(encodeGainKey(data), reference)).toBe(0);
    // another sky is another entry
    const other = data.map(v => v ^ 1);
    const otherReference = gzipSync(new Uint8Array(other.buffer), { level: 9 }); otherReference[9] = 19;
    expect(Buffer.compare(encodeGainKey(other), otherReference)).toBe(0);
  } finally { delete process.env['WILDSHARD_GAIN_KEY_CACHE']; rmSync(root, { recursive: true, force: true }); }
});
