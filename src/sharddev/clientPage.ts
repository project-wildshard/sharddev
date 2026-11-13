/** The client page a build or `wildshard dev` serves: engine's built `index.html` with this shard's descriptor added.
 * A draft (never prepared) has no recorded entry programs, so the bank says so and the page skips the read that would
 * 404 (engine `spawnDownload.ts` `shardPackBase`: `entryPrograms[slug] === false` means the cook published none). */
export function clientPage(html: string, descriptorJson: string, slug: string, recordedPrograms: boolean): string {
  const page = html.replace('</head>', `<script id="ws-shardfile" type="application/json">${descriptorJson}</script></head>`);
  if (recordedPrograms) return page;
  const expression = /(<script type="application\/json" id="boot-module-files">)([^<]+)(<\/script>)/u, match = expression.exec(page);
  if (match?.[2] === undefined) return page;
  const bank: unknown = JSON.parse(match[2]);
  if (typeof bank !== 'object' || bank === null || Array.isArray(bank)) return page;
  const recorded: unknown = 'entryPrograms' in bank ? bank.entryPrograms : undefined;
  const entryPrograms = typeof recorded === 'object' && recorded !== null && !Array.isArray(recorded) ? { ...recorded, [slug]: false } : { [slug]: false };
  const json = JSON.stringify({ ...bank, entryPrograms }).replaceAll('<', String.raw`<`);
  return page.replace(expression, (_whole, open: string, _bank: string, close: string) => `${open}${json}${close}`);
}
