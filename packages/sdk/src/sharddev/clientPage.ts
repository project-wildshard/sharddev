/** The client page a build or `wildshard dev` serves: engine's built `index.html` with this shard's descriptor added.
 * A draft (never prepared) has no recorded entry programs, so the bank says so and the page skips the read that would
 * 404 (engine `spawnDownload.ts` `shardPackBase`: `entryPrograms[slug] === false` means the cook published none). */
const BACKSLASH = String.fromCodePoint(92);

const CATALOGUE = /(<script type="application\/json" id="ws-catalogue">)([^<]*)(<\/script>)/u;

/** CHUNK-PARAM-REMOVAL CP11 (J522): the page is a one-cell world, this shard's zone at (0, 0), so engine boots it on a bare `/`
 * on the grid path players take (engine `oneCellWorld`), never the one-shard page. A client with no catalogue keeps none. */
function oneCellWorld(html: string, slug: string): string {
  return html.replace(CATALOGUE, (whole, open: string, json: string, close: string) => {
    const catalogue: unknown = JSON.parse(json);
    if (typeof catalogue !== 'object' || catalogue === null || !('grid' in catalogue) || typeof catalogue.grid !== 'object' || catalogue.grid === null) return whole;
    const world = { ...catalogue, grid: { ...catalogue.grid, cells: [{ instance: slug, slug, cell: [0, 0] }] } };
    return `${open}${JSON.stringify(world).replaceAll('<', `${BACKSLASH}u003c`)}${close}`;
  });
}

export function clientPage(html: string, descriptorJson: string, slug: string, recordedPrograms: boolean): string {
  // A function replacement: a `$&` or `$'` in the shard's own text stays literal.
  const page = oneCellWorld(html, slug).replace('</head>', () => `<script id="ws-shardfile" type="application/json">${descriptorJson}</script></head>`);
  if (recordedPrograms) return page;
  const expression = /(<script type="application\/json" id="boot-module-files">)([^<]+)(<\/script>)/u, match = expression.exec(page);
  if (match?.[2] === undefined) return page;
  const bank: unknown = JSON.parse(match[2]);
  if (typeof bank !== 'object' || bank === null || Array.isArray(bank)) return page;
  const recorded: unknown = 'entryPrograms' in bank ? bank.entryPrograms : undefined;
  const entryPrograms = typeof recorded === 'object' && recorded !== null && !Array.isArray(recorded) ? { ...recorded, [slug]: false } : { [slug]: false };
  // `<` as its JSON escape, as project.ts writes the descriptor: the bank sits inside a <script>.
  const json = JSON.stringify({ ...bank, entryPrograms }).replaceAll('<', `${BACKSLASH}u003c`);
  return page.replace(expression, (_whole, open: string, _bank: string, close: string) => `${open}${json}${close}`);
}
