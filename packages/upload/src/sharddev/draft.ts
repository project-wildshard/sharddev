// QA-FEEDBACK 11-13 row 2 (J198, J259): `wildshard build` writes a draft shard file, `sdk: "0.2"`. Only `wildshard prepare`
// (J198, scripts/prepare-product.mjs) makes it `"0.3"`, and api-server refuses a draft at commit (422). So build and check
// warn, and upload refuses a draft before a byte is sent (rule `shardfile-draft` in refusals.ts).

/** The `sdk` marker of an unprepared draft below format 0.1.0.3; a prepared shard file says `0.3`. */
export const DRAFT_SDK = '0.2';

/**
 * Meta SHARD-COMPAT PR4: whether a shard index is an unprepared draft. Format 0.1.0.3 drops the `sdk` marker and a
 * prepared file records `preparation` (its spec number); older files say `sdk: "0.2"` (draft) or `"0.3"` (prepared).
 */
export function isDraftIndex(index: unknown): boolean {
  if (typeof index !== 'object' || index === null) return false;
  const marker: { readonly sdk?: unknown; readonly preparation?: unknown } = index;
  return typeof marker.preparation !== 'number' && marker.sdk !== '0.3';
}

/** The words build and check warn with and upload refuses with. */
export function draftMessage(slug: string): string {
  return `${slug} is an unprepared draft (no preparation): api-server refuses a draft at commit, so prepare its folder and build it again before upload`;
}
