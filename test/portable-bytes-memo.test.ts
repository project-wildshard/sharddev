// oxlint-disable-next-line import/no-nodejs-modules -- The memo fixture owns repository scratch.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scratch paths never touch the shared gen cache.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { encodePortableBytes } from '../src/sharddev/bake/portableBytes';

// The portable deflate's memo (portableBytesMemo.ts, the build's encodePortableBytes capability): a cold call, a hit, a
// damaged memo and another level all return the uncached deflate's bytes.
test('the portable deflate memo returns the exact deflate bytes cold, warm and after damage', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/sp-o3-portable-deflate-'));
  process.env['WILDSHARD_PORTABLE_DEFLATE_CACHE'] = root;
  try {
    const { encodePortableBytesMemo } = await import('../src/sharddev/bake/portableBytesMemo');
    const data = Uint8Array.from({ length: 96 * 64 * 4 }, (_v, i) => ((i * 2654435761) >>> 0) % 251 & (i % 7 === 0 ? 0xff : 0x3f));
    const reference = encodePortableBytes(data, 9);
    const cold = encodePortableBytesMemo(data, 9);
    expect(Buffer.compare(cold, reference)).toBe(0);
    expect(readdirSync(root).filter(f => f.endsWith('.bin'))).toHaveLength(1);
    const warm = encodePortableBytesMemo(data, 9);
    expect(Buffer.compare(warm, reference)).toBe(0); expect(warm).not.toBe(cold);
    // a damaged body fails its hash and the deflate runs again
    const body = readdirSync(root).find(f => f.endsWith('.bin')); if (body === undefined) throw new Error('memo');
    writeFileSync(resolve(root, body), Buffer.from('damaged'));
    expect(Buffer.compare(encodePortableBytesMemo(data, 9), reference)).toBe(0);
    // another level and another payload are other entries
    expect(Buffer.compare(encodePortableBytesMemo(data, 6), encodePortableBytes(data, 6))).toBe(0);
    const other = data.map(v => v ^ 1);
    expect(Buffer.compare(encodePortableBytesMemo(other, 9), encodePortableBytes(other, 9))).toBe(0);
    expect(readdirSync(root).filter(f => f.endsWith('.bin'))).toHaveLength(3);
  } finally { delete process.env['WILDSHARD_PORTABLE_DEFLATE_CACHE']; rmSync(root, { recursive: true, force: true }); }
});
