import * as v from 'valibot';
import { EntryReadUrlSchema, parseEntryReadSet, type EntryRead, type EntryReadSet, type RegionEntryReads } from '@wildshard/format/entryReads';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';

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
  readonly packs?: readonly { readonly path: string; readonly bytes: number; readonly entries: readonly { readonly hash: string; readonly offset: number; readonly bytes: number }[] }[];
}

/** Expand observed pack ranges to the exact declared file members they covered.
 * Metadata sections are already acquired by admission. Partial members refuse;
 * an entry hint must never replace a range with an unrelated full-pack fetch. */
export function entryDemandUrls(slug: string, inventory: EntryCrawlInventory, demands: readonly EntryCrawlDemand[]): readonly string[] {
  if (!/^[a-zA-Z0-9_-]+$/u.test(slug)) throw new Error('Canonical entry slug required');
  const prefix = `/shardfiles/${slug}/`, result = new Set<string>();
  for (const demand of demands) {
    const url = v.parse(EntryReadUrlSchema, demand.url), path = url.split('?')[0] ?? '';
    if (path.endsWith('/entry-reads.json') || /\.(?:js|css|wasm)$/u.test(path)) continue;
    if (path.startsWith('/assets/')) { result.add(url); continue; }
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length), pack = inventory.packs?.find(row => row.path === relative);
    if (pack === undefined) {
      if (inventory.files.some(file => file.path === relative)) result.add(url);
      continue;
    }
    const match = demand.range === undefined ? null : /^bytes=(\d+)-(\d+)$/u.exec(demand.range);
    if (demand.range !== undefined && match === null) throw new Error('Entry pack requires one bounded range');
    const start = match === null ? 0 : Number(match[1]), end = match === null ? pack.bytes : Number(match[2]) + 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > pack.bytes) throw new Error('Entry pack range outside its inventory');
    for (const member of pack.entries) {
      const limit = member.offset + member.bytes;
      if (limit <= start || member.offset >= end) continue;
      if (member.offset < start || limit > end) throw new Error('Entry pack range cuts a member');
      const file = inventory.files.find(row => row.hash === member.hash);
      if (file === undefined) continue;
      if (file.compressed !== member.bytes) throw new Error('Entry pack file size differs');
      result.add(`${prefix}${file.path}`);
    }
  }
  return [...result];
}
