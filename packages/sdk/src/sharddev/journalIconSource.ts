import type { Shardfile } from '@wildshard/format/shardSchema';

/** Enforce image-only journal selectors while the author tool pins the earlier format. */
export function requireJournalImages(source: Shardfile): void {
  for (const row of source.rows.compendiums) {
    if ('kind' in row && row.kind === 'journal' && row.icons.some(icon => !Object.hasOwn(icon, 'image'))) {
      throw new Error(`Journal selectors require a declared image (${row.id})`);
    }
  }
}
