import { installFormatHook } from '@wildshard/format/formatHook'

// Meta NEW-SHARD-E2E F29: `wildshard grid` reads the world grid a channel's
// page builds from, read-only and with no key: the public
// `GET /api/catalogue.json?channel=<channel>` (api-server
// `routes/catalogue-reads.ts`). It prints each taken cell with its shard,
// then the free cells inside the grid's radius (format's GRID_RADIUS), so
// an author sees where a new shard can go without reading source.

/** The API upload talks to when neither --server nor WILDSHARD_API_URL is set. */
const DEFAULT_SERVER = 'https://api.wildshard.io'

/** `--channel`'s name to the API's (J301): `prod` is `production`. */
const CHANNELS: Readonly<Record<string, string>> = {
  preview: 'preview',
  staging: 'staging',
  prod: 'production',
}

type Cell = readonly [east: number, north: number]

/** One cell to the next along a grid row or column. */
const STEP = 1

interface GridCell {
  readonly slug: string
  readonly cell: Cell
}

interface GridOptions {
  /** --server, else WILDSHARD_API_URL, else empty (then the default API). */
  readonly server: string
  /** --channel as typed; staging when absent. */
  readonly channel: string | undefined
  readonly report: (line: string) => void
}

/** The API's channel name, or undefined for one `--channel` does not take. */
function channelOf(raw = 'staging'): string | undefined {
  return Object.hasOwn(CHANNELS, raw) ? CHANNELS[raw] : undefined
}

/** One catalogue grid row as a cell, or nothing for a row of another shape. */
function cellOf(row: unknown): GridCell[] {
  if (typeof row !== 'object' || row === null) {
    return []
  }
  const { slug, cell } = row as { slug?: unknown; cell?: unknown }
  if (typeof slug !== 'string' || !Array.isArray(cell)) {
    return []
  }
  const [east, north] = cell as unknown[]
  return typeof east === 'number' && typeof north === 'number'
    ? [{ slug, cell: [east, north] }]
    : []
}

/** The cells of a catalogue.json document's `grid`. */
function cellsOf(document: unknown): readonly GridCell[] {
  const grid =
    typeof document === 'object' && document !== null && 'grid' in document
      ? document.grid
      : undefined
  const cells =
    typeof grid === 'object' && grid !== null && 'cells' in grid
      ? grid.cells
      : undefined
  if (!Array.isArray(cells)) {
    throw new TypeError('the catalogue has no grid cells')
  }
  return cells.flatMap((row: unknown): GridCell[] => cellOf(row))
}

const at = ([east, north]: Cell): string => `(${String(east)},${String(north)})`

const byRow = (left: GridCell, right: GridCell): number => {
  const [leftEast, leftNorth] = left.cell
  const [rightEast, rightNorth] = right.cell
  return leftNorth - rightNorth || leftEast - rightEast
}

/** Every cell inside the radius that no shard holds, row by row. */
function freeCells(taken: ReadonlySet<string>, radius: number): string[] {
  const free: string[] = []
  for (let north = -radius; north <= radius; north += STEP) {
    for (let east = -radius; east <= radius; east += STEP) {
      if (!taken.has(at([east, north]))) {
        free.push(at([east, north]))
      }
    }
  }
  return free
}

/** The channel's grid document from the API. */
async function fetchGrid(
  server: string,
  channel: string,
): Promise<{ readonly url: string; readonly cells: readonly GridCell[] }> {
  const url = new URL(
    '/api/catalogue.json',
    server === '' ? DEFAULT_SERVER : server,
  )
  url.searchParams.set('channel', channel)
  const reply = await fetch(url)
  if (!reply.ok) {
    throw new Error(`GET ${url.href} answered ${String(reply.status)}`)
  }
  return {
    url: url.href,
    cells: cellsOf(await reply.json()).toSorted(
      (left: GridCell, right: GridCell): number => byRow(left, right),
    ),
  }
}

/** The API channel `--channel` names, or a refusal for one it does not take. */
function requireChannel(raw: string | undefined): string {
  const channel = channelOf(raw)
  if (channel === undefined) {
    throw new Error(
      `grid takes --channel staging, prod or preview, not --channel ${String(raw)}`,
    )
  }
  return channel
}

/** The grid's radius in cells from its centre (format's GRID_RADIUS). */
async function gridRadius(): Promise<number> {
  installFormatHook()
  const { GRID_RADIUS: radius } =
    await import('@wildshard/format/contentBounds')
  return radius
}

/** Print the channel's grid: every taken cell, then the free ones. */
async function showGrid(options: GridOptions): Promise<void> {
  const channel = requireChannel(options.channel)
  const radius = await gridRadius()
  const { url, cells } = await fetchGrid(options.server, channel)
  const side = String(radius + radius + STEP)
  options.report(
    `grid on ${channel}: ${side}x${side} cells, x and z from -${String(radius)} to ${String(radius)} (from ${url})`,
  )
  for (const row of cells) {
    options.report(`taken ${at(row.cell)} ${row.slug}`)
  }
  const free = freeCells(
    new Set(cells.map((row: GridCell): string => at(row.cell))),
    radius,
  )
  options.report(`free ${String(free.length)}: ${free.join(' ')}`)
}

export { cellsOf, channelOf, showGrid }
