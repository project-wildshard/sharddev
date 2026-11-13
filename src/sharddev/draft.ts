// QA-FEEDBACK 11-13 row 2 (J198, J259): `wildshard build` writes a draft shard file, `sdk: "0.2"`. Only `wildshard prepare`
// (J198, scripts/prepare-product.mjs) makes it `"0.3"`, and api-server refuses a draft at commit (422). So build and check
// warn, and upload refuses a draft before a byte is sent (rule `shardfile-draft` in refusals.ts).

/** The `sdk` marker of an unprepared draft; a prepared shard file says `0.3`. */
export const DRAFT_SDK = '0.2';

/** The words build and check warn with and upload refuses with. */
export function draftMessage(slug: string): string {
  return `${slug} is an unprepared draft (sdk 0.2): api-server refuses a draft at commit, so prepare its folder and build it again before upload`;
}
