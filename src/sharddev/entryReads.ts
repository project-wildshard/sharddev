import * as v from 'valibot';
import { EntryReadUrlSchema, parseEntryReadSet, type EntryRead, type EntryReadSet, type RegionEntryReads } from '@wildshard/format/entryReads';
import { hashImmutableBytes } from './immutable';

/** Build-owned entry addresses. A crawl runs the same native entry read adapter
 * for each tier, not a second runtime or an authored callback at prefetch time. */
export interface EntryCrawlRegion { readonly region: string; readonly at: readonly [number, number] }
export interface EntryCrawlPorts {
  readonly read: (url: string) => Promise<Uint8Array>;
  readonly visit: (entry: EntryCrawlRegion, tier: RegionEntryReads['tier'], read: EntryCrawlPorts['read']) => Promise<void>;
}

/** Observe actual entry demands at build time. Only immutable metadata escapes
 * the crawl. Repeated reads retain their real behavior; first-demand order is
 * recorded once, and a changing body at one URL refuses the product. Every
 * started read drains even when entry construction or a sibling read refuses. */
export async function crawlEntryReadSet(entries: readonly EntryCrawlRegion[], ports: EntryCrawlPorts): Promise<EntryReadSet> {
  const result: RegionEntryReads[] = [];
  for (const entry of entries) for (const tier of ['phone', 'desktop'] as const) {
    parseEntryReadSet([...result, { ...entry, tier, reads: [] }]);
    const urls = new Map<string, number>(), rows: (EntryRead | undefined)[] = [], pending: Promise<void>[] = [];
    const read = (url: string): Promise<Uint8Array> => {
      const work = (async (): Promise<Uint8Array> => {
        v.parse(EntryReadUrlSchema, url);
        let index = urls.get(url);
        if (index === undefined) {
          if (urls.size >= 8192) throw new Error('Entry read set exceeds its URL bound');
          index = rows.length; urls.set(url, index); rows.push(undefined);
        }
        const bytes = await ports.read(url), row = { url, hash: hashImmutableBytes(bytes), bytes: bytes.byteLength };
        const previous = rows[index];
        if (previous !== undefined && (previous.hash !== row.hash || previous.bytes !== row.bytes)) throw new Error('Entry URL changed during its crawl');
        rows[index] = row;
        return bytes;
      })();
      const observed = (async (): Promise<void> => { await work; })();
      pending.push(observed);
      // Attach an observer immediately; a native entry can demand a later read
      // before awaiting an earlier one. The original rejection stays in work.
      void observed.catch(() => undefined);
      return work;
    };
    let failed = false, failure: unknown;
    try { await ports.visit(entry, tier, read); } catch (error: unknown) { failed = true; failure = error; }
    const finished = await Promise.allSettled(pending);
    if (failed) throw failure;
    for (const row of finished) if (row.status === 'rejected') throw row.reason;
    const reads = rows.map(row => { if (row === undefined) throw new Error('Entry read did not settle'); return row; });
    result.push({ ...entry, tier, reads });
  }
  return parseEntryReadSet(result);
}

export interface EntryCrawlDemand { readonly url: string; readonly range?: string }
export interface EntryCrawlInventory {
  readonly files: readonly { readonly path: string; readonly hash: string; readonly compressed: number }[];
}

/** The product files and `/assets/` URLs an entry demanded, in first-demand order. Metadata sections are already
 * acquired by admission. SHARD-SIZE S5: a product holds no packs, so every demand names one file. */
export function entryDemandUrls(slug: string, inventory: EntryCrawlInventory, demands: readonly EntryCrawlDemand[]): readonly string[] {
  if (!/^[a-zA-Z0-9_-]+$/u.test(slug)) throw new Error('Canonical entry slug required');
  const prefix = `/shardfiles/${slug}/`, result = new Set<string>();
  for (const demand of demands) {
    const url = v.parse(EntryReadUrlSchema, demand.url), path = url.split('?')[0] ?? '';
    if (path.endsWith('/entry-reads.json') || /\.(?:js|css|wasm)$/u.test(path)) continue;
    if (path.startsWith('/assets/')) { result.add(url); continue; }
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    if (inventory.files.some(file => file.path === relative)) result.add(url);
  }
  return [...result];
}
