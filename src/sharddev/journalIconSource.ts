// oxlint-disable-next-line import/no-nodejs-modules -- The producer copies finite immutable kit image assets.
import { readFileSync } from 'node:fs';
import { legacyJournalIcon } from '@wildshard/kit/legacyJournalIcons';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { nameBlob, type NamedBlob } from './blobs';

/** Compile the former glyph names to ordinary charged images; preserve selectors and inherited sticker paint. */
export function expandJournalIconSource(source: Shardfile, sections?: ReadonlyMap<string, unknown>): { shard: Shardfile; blobs: readonly NamedBlob[] } {
  const blobs = new Map<string, NamedBlob>();
  const compendiums = source.rows.compendiums.map(row => {
    if (!('kind' in row) || row.kind !== 'journal' || row.icons.every(icon => 'image' in icon)) return row;
    return { ...row, icons: row.icons.map(icon => {
      if ('image' in icon) return icon;
      const { icon: name, ...selectors } = icon;
      legacyJournalIcon(name);
      let blob = blobs.get(name);
      if (blob === undefined) {
        const bytes = readFileSync(new URL(import.meta.resolve(`@wildshard/kit/content/journal-icons/${name}.png`)));
        blob = nameBlob(`kit/journal/${name}.png`, 'image', bytes); blobs.set(name, blob);
      }
      return { ...selectors, image: blob.file.hash, tint: 'currentColor' as const };
    }) };
  });
  if (blobs.size === 0) return { shard: source, blobs: [] };
  const files = [...source.files], library = new Set(source.library);
  let compressed = 0, resident = 0;
  for (const { file } of blobs.values()) {
    if (!files.some(row => row.hash === file.hash)) files.push({ hash: file.hash, kind: 'image', compressed: file.compressed,
      decoded: file.decoded, gpu: file.gpu, triangles: file.triangles, draws: file.draws, dependencies: file.dependencies, critical: false });
    if (!library.has(file.hash)) { library.add(file.hash); compressed += file.compressed; resident += file.decoded + file.gpu; }
  }
  return { shard: parseShardfile({ ...source, files, library: [...library], rows: { ...source.rows, compendiums },
    budgets: { ...source.budgets, library: { ...source.budgets.library,
      compressed: source.budgets.library.compressed + compressed, resident: source.budgets.library.resident + resident,
      ...(source.budgets.library.downloadAllowance === undefined ? {} : { downloadAllowance: source.budgets.library.downloadAllowance + compressed }) } } }, sections),
    blobs: [...blobs.values()] };
}
