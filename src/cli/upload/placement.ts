import { safeParse } from 'valibot'

import { PlacementSchema } from './wire.ts'

import type { Channel } from './api.ts'
import type { CommitAnswer, Placement } from './wire.ts'

// What the upload says about the grid (meta SHARD-AUTHORING SA32, J314):
// the cell the API gave the shard, or why it gave none, then the
// `/slug/<slug>` link on each channel the upload moved. api-server's SA30
// answers `placement` only while its `GRID_AUTOPLACE` is on, and then not
// for a shard with no cell past its first upload, so a missing answer says
// "no new cell" rather than guess which. Only a first upload (catalogue
// number 1) takes a cell: `--no-place` later leaves a held cell where it
// is, so that line says the grid was left alone. The page behind the link
// is SA36 and SA37's, not built yet, and the line says so.

/** The API's words for `place: false` and for a failed grid step (SA30). */
const NOT_ASKED = 'not placed (place: false)'
const FAILED = 'not placed: the grid step failed'
const FIRST_UPLOAD = 1
const NO_PLACE_LINE = 'not placed (--no-place)'
const LEFT_ALONE_LINE = 'grid left as it was (--no-place)'
const NO_ANSWER_LINE =
  "no new cell: grid placement is off on the API, or this is not the shard's first upload"
const FAILED_LINE =
  'not placed: the grid step failed; run the same upload again to retry'
const UNREAD_LINE = "grid: the API's placement answer was not understood"
const PAGE_NOT_BUILT = '(page not built yet)'

/** Each channel's host (GUIDE.md section 5). */
const HOSTS = {
  preview: 'preview.wildshard.io',
  staging: 'staging.wildshard.io',
  production: 'play.wildshard.io',
} as const

type ChannelName = keyof typeof HOSTS

interface Asked {
  readonly place: boolean
  /** The answer's catalogue number: 1 is the shard's first upload. */
  readonly revision: number
  readonly moved: readonly ChannelName[]
}

/** The grid line for a placed shard, naming any moved channel whose grid lacks it. */
function placedLine(
  placement: Extract<Placement, { placed: true }>,
  moved: readonly ChannelName[],
): string {
  const [col, row] = placement.cell
  const on = placement.channels.join(', ')
  const missed = moved
    .filter((name: ChannelName): boolean => !placement.channels.includes(name))
    .map((name: ChannelName): string => `; not on ${name}'s grid`)
  return `placed at (${String(col)},${String(row)}) on ${on}${missed.join('')}`
}

/** The `--no-place` line: a first upload took no cell; a later one left the grid alone. */
function noPlaceLine(asked: Asked): string {
  return asked.revision === FIRST_UPLOAD ? NO_PLACE_LINE : LEFT_ALONE_LINE
}

/** The line for `{ placed: false }`, by the API's reason. */
function notPlacedLine(reason: string, asked: Asked): string {
  if (reason === NOT_ASKED) {
    return noPlaceLine(asked)
  }
  return reason.startsWith(FAILED) ? FAILED_LINE : reason
}

/** The grid line: the cell, or why there is none. */
function gridLine(raw: unknown, asked: Asked): string {
  if (raw === undefined) {
    return asked.place ? NO_ANSWER_LINE : noPlaceLine(asked)
  }
  const parsed = safeParse(PlacementSchema, raw)
  if (!parsed.success) {
    return UNREAD_LINE
  }
  const placement = parsed.output
  return placement.placed
    ? placedLine(placement, asked.moved)
    : notPlacedLine(placement.reason, asked)
}

/** The channels an upload moves (J301); a revived shard moves preview only (DEL7). */
function movedChannels(
  channel: Channel,
  revived: boolean,
): readonly ChannelName[] {
  if (revived) {
    return ['preview']
  }
  return channel === 'production'
    ? ['preview', 'staging', 'production']
    : ['preview', 'staging']
}

/** The grid line, then one `/slug/<slug>` link per channel moved. */
function placementLines(
  answer: CommitAnswer,
  options: Readonly<{ channel: Channel; place: boolean }>,
): readonly string[] {
  const moved = movedChannels(options.channel, answer.revived === true)
  const asked = { place: options.place, revision: answer.revision, moved }
  const links = moved.map(
    (name: ChannelName): string =>
      `${name}: https://${HOSTS[name]}/slug/${answer.shard} ${PAGE_NOT_BUILT}`,
  )
  return [gridLine(answer.placement, asked), ...links]
}

export { placementLines }
