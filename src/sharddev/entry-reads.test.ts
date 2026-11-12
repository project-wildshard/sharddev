import { expect, test, vi } from 'vitest';
import { crawlEntryReadSet, entryDemandUrls, type EntryCrawlPorts } from './entryReads';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';

test('entry crawling records demand order across out-of-order completion without changing repeated reads', async () => {
  const requested: string[] = [], first = new Uint8Array([7, 8]), second = new Uint8Array([9]);
  let finish = (): void => undefined;
  const earlier = new Promise<Uint8Array>(resolve => { finish = () => { resolve(first); }; });
  const rows = await crawlEntryReadSet([{ region: 'north', at: [0, 250] }], {
    read: url => { requested.push(url); return url === 'blobs/first.bin' ? earlier : Promise.resolve(second); },
    visit: async (_entry, tier, read) => {
      if (tier === 'desktop') { await read('/assets/native/source.bin'); return; }
      const a = read('blobs/first.bin');
      await read('blobs/second.bin'); finish();
      expect(await a).toBe(first); expect(await read('blobs/first.bin')).toBe(first);
    },
  });
  expect(rows[0]?.reads).toEqual([{ url: 'blobs/first.bin', hash: hashImmutableBytes(first), bytes: 2 },
    { url: 'blobs/second.bin', hash: hashImmutableBytes(second), bytes: 1 }]);
  expect(rows[1]?.reads).toEqual([{ url: '/assets/native/source.bin', hash: hashImmutableBytes(second), bytes: 1 }]);
  expect(requested).toEqual(['blobs/first.bin', 'blobs/second.bin', 'blobs/first.bin', '/assets/native/source.bin']);
});

test('an entry refusal drains every started read and preserves the original failure', async () => {
  const refusal = new Error('Original native entry refusal');
  let finish = (): void => undefined, started = (): void => undefined;
  const reading = new Promise<Uint8Array>(resolve => { finish = () => { resolve(new Uint8Array([1])); }; });
  const begun = new Promise<void>(resolve => { started = resolve; });
  const visit = vi.fn<EntryCrawlPorts['visit']>((_entry, _tier, read) => {
    void read('blobs/body.bin'); started(); return Promise.reject(refusal);
  });
  let settled = false;
  const pending = (async () => { try { return await crawlEntryReadSet([{ region: 'south', at: [0, -250] }], { read: () => reading, visit }); }
    finally { settled = true; } })();
  await begun; await Promise.resolve(); expect(settled).toBe(false);
  finish(); await expect(pending).rejects.toBe(refusal); expect(visit).toHaveBeenCalledOnce();
});

test('changing bodies and invalid URLs refuse the crawl without a product or a network fallback', async () => {
  let value = 0;
  await expect(crawlEntryReadSet([{ region: 'spawn', at: [0, 0] }], {
    read: () => Promise.resolve(new Uint8Array([++value])),
    visit: async (_entry, _tier, read) => { await read('blobs/body.bin'); await read('blobs/body.bin'); },
  })).rejects.toThrow('changed');
  const read = vi.fn(() => Promise.resolve(new Uint8Array()));
  await expect(crawlEntryReadSet([{ region: 'spawn', at: [0, 0] }], { read,
    visit: async (_entry, _tier, take) => { await take('https://foreign.invalid/file'); },
  })).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});

test('entry demands keep listed product files and assets in first-demand order', () => {
  const inventory = { files: [{ path: 'blobs/bin/one.bin', hash: 'one', compressed: 3 }, { path: 'blobs/bin/two.bin', hash: 'two', compressed: 4 }] };
  expect(entryDemandUrls('fixture', inventory, [{ url: '/shardfiles/fixture/blobs/bin/two.bin' }, { url: '/shardfiles/fixture/blobs/bin/missing.bin' },
    { url: '/assets/fixture/skin.ktx2?v=abcdef' }, { url: '/shardfiles/fixture/blobs/bin/one.bin' }, { url: '/shardfiles/other/blobs/bin/one.bin' }])).toEqual([
    '/shardfiles/fixture/blobs/bin/two.bin', '/assets/fixture/skin.ktx2?v=abcdef', '/shardfiles/fixture/blobs/bin/one.bin']);
});
