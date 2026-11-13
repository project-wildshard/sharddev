import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// A shard's hero (its SHARD SELECT card: thumb, portrait and landscape) is a
// picture of its world, so it goes stale when the world changes (Jake,
// 2026-11-12 17:14 Cancún: "you have to update the hero images for the
// templates"). Rendering it needs a real GPU and a served build of the exact
// candidate, which no cut step or CI runner has, so the cut refuses instead:
// `hero.json` beside `manifest.json` records the hash of the shard's content
// when the hero was captured, and `wildshard build` refuses a product whose
// source hashes differently now, whose hero files are not the ones stamped,
// or which does not carry the stamped hero files as blobs (built before the
// capture). `wildshard hero` captures and re-stamps.

const STAMP = 'hero.json'
const MANIFEST = 'manifest.json'
const SLOTS = ['thumb', 'portrait', 'landscape'] as const
// Generated, ignored, test or prose files are not the world a hero shows.
// The directories are skipped at the shard folder's top level only.
const SKIPPED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.worktrees',
  'dist',
  'node_modules',
  'public',
  'tmp',
])
const SKIPPED_SUFFIXES = [
  '.generated.ts',
  '.test.ts',
  '.test.mjs',
  '.md',
  '.DS_Store',
]
const NOT_FOUND = 'ENOENT'
const VALUE = 1
const NONE = 0
const INDENT = 2
const UNKNOWN_TIME = 'at an unknown time'

type HeroCondition = 'fresh' | 'generated' | 'stale' | 'unstamped'

interface HeroState {
  readonly state: HeroCondition
  /** The content hash now. */
  readonly content: string
  /** What the stamp recorded, if there is one. */
  readonly stamped?: string | undefined
  /** When the stamp says the hero was captured. */
  readonly captured?: string | undefined
}

interface HeroStamp {
  readonly content: string
  readonly captured: string
  readonly base: string
  readonly card: Readonly<Record<string, string>>
  readonly camera?: unknown
}

function sha256(bytes: Readonly<Uint8Array> | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === NOT_FOUND
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch (error: unknown) {
    if (isMissing(error)) {
      return undefined
    }
    throw error
  }
}

/** The stamp, or undefined when it is missing or unreadable (unstamped). */
async function readStamp(shard: string): Promise<unknown> {
  try {
    return await readJson(path.join(shard, STAMP))
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  return Object.entries(value).find(
    ([name]: readonly [string, unknown]): boolean => name === key,
  )?.[VALUE]
}

/** The manifest's card urls, by slot. */
async function cardUrls(
  shard: string,
): Promise<Readonly<Record<string, string>>> {
  const card = field(await readJson(path.join(shard, MANIFEST)), 'card')
  const urls: Record<string, string> = {}
  for (const slot of SLOTS) {
    const url = field(card, slot)
    if (typeof url === 'string') {
      urls[slot] = url
    }
  }
  return urls
}

/**
 * The files a card url names inside this shard folder: `/src/shards/<folder>/x`
 * or a path relative to the folder. A `data:` card names none.
 */
function cardFile(shard: string, url: string): string | undefined {
  if (url.startsWith('data:') || url.includes('://')) {
    return undefined
  }
  const prefix = `/src/shards/${path.basename(shard)}/`
  const relative = url.startsWith(prefix) ? url.slice(prefix.length) : url
  const file = path.resolve(shard, relative.replace(/^\/+/u, ''))
  return file.startsWith(`${path.resolve(shard)}${path.sep}`) ? file : undefined
}

/** The hero file each card slot names; a `data:` slot names none. */
async function heroSlotFiles(
  shard: string,
): Promise<Readonly<Record<string, string>>> {
  const files: Record<string, string> = {}
  for (const [slot, url] of Object.entries(await cardUrls(shard))) {
    const file = cardFile(path.resolve(shard), url)
    if (file !== undefined) {
      files[slot] = file
    }
  }
  return files
}

async function heroFiles(shard: string): Promise<ReadonlySet<string>> {
  return new Set(Object.values(await heroSlotFiles(shard)))
}

async function contentFiles(
  directory: string,
  skip: ReadonlySet<string>,
  top = true,
): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(
      async (
        entry: Readonly<{
          name: string
          isDirectory: () => boolean
          isFile: () => boolean
        }>,
      ): Promise<readonly string[]> => {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          return top && SKIPPED_DIRECTORIES.has(entry.name)
            ? []
            : await contentFiles(file, skip, false)
        }
        const ignored =
          !entry.isFile() ||
          skip.has(file) ||
          SKIPPED_SUFFIXES.some((suffix: string): boolean =>
            entry.name.endsWith(suffix),
          )
        return ignored ? [] : [file]
      },
    ),
  )
  return nested.flat()
}

/**
 * One hash over every content file's folder-relative path and bytes: the
 * shard as a hero would show it. The hero files and the stamp are left out,
 * so a capture never makes its own hero stale.
 */
async function heroContentHash(shard: string): Promise<string> {
  const root = path.resolve(shard)
  const skip = new Set([...(await heroFiles(root)), path.join(root, STAMP)])
  const found = await contentFiles(root, skip)
  const rows = await Promise.all(
    found.map(async (file: string): Promise<string> => {
      const relative = path.relative(root, file).split(path.sep).join('/')
      return `${relative}\0${sha256(await readFile(file))}\n`
    }),
  )
  return sha256(rows.toSorted().join(''))
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Each hero file's folder-relative path and hash, for the stamp. */
async function cardHashes(
  shard: string,
): Promise<Readonly<Record<string, string>>> {
  const files = [...(await heroFiles(shard))]
  const rows = await Promise.all(
    files.map(async (file: string): Promise<readonly [string, string]> => [
      path.relative(shard, file).split(path.sep).join('/'),
      sha256(await readFile(file)),
    ]),
  )
  return Object.fromEntries(rows)
}

/** Whether the stamped hero files are the ones on disk now. */
function sameCard(
  stamped: unknown,
  current: Readonly<Record<string, string>>,
): boolean {
  const names = Object.keys(current)
  return (
    names.length === Object.keys(stamped ?? {}).length &&
    names.every(
      (name: string): boolean => field(stamped, name) === current[name],
    )
  )
}

/** Whether the shard's captured hero is as new as its content. */
async function heroState(shard: string): Promise<HeroState> {
  const content = await heroContentHash(shard)
  const files = await heroFiles(shard)
  if (files.size === NONE) {
    return { state: 'generated', content }
  }
  const stamp = await readStamp(shard)
  const stamped = field(stamp, 'content')
  if (typeof stamped !== 'string') {
    return { state: 'unstamped', content }
  }
  const same = sameCard(field(stamp, 'card'), await cardHashes(shard))
  return {
    state: stamped === content && same ? 'fresh' : 'stale',
    content,
    stamped,
    captured: textOf(field(stamp, 'captured')),
  }
}

/** Record that the hero files now show this content (`wildshard hero`). */
async function writeHeroStamp(
  shard: string,
  options: Readonly<{ base: string; captured?: string; camera?: unknown }>,
): Promise<HeroStamp> {
  const previous = await readStamp(shard)
  const camera = options.camera ?? field(previous, 'camera')
  const stamp: HeroStamp = {
    content: await heroContentHash(shard),
    captured: options.captured ?? new Date().toISOString(),
    base: options.base,
    card: await cardHashes(shard),
    ...(camera === undefined ? {} : { camera }),
  }
  const partial = path.join(shard, `${STAMP}.${randomUUID()}.partial`)
  try {
    await writeFile(partial, `${JSON.stringify(stamp, undefined, INDENT)}\n`)
    await rename(partial, path.join(shard, STAMP))
  } finally {
    await rm(partial, { force: true })
  }
  return stamp
}

export {
  type HeroState,
  type HeroStamp,
  MANIFEST,
  STAMP,
  NONE,
  UNKNOWN_TIME,
  cardHashes,
  field,
  heroContentHash,
  heroFiles,
  heroSlotFiles,
  heroState,
  isMissing,
  readJson,
  writeHeroStamp,
}
