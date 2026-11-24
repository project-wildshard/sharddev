import path from 'node:path'

import { draftMessage } from '../../sharddev/draft.ts'
import { findShardSource } from '../../sharddev/shardSource.ts'
import { assertAudio } from '../audio/audio.ts'
import { STAMP, field, readJson } from '../hero/stamp.ts'
import { readCatalogue } from './api.ts'
import { assertHero, validateShardfile } from './validate.ts'

import type { ApiOptions } from './api.ts'
import type { CatalogueShard } from './wire.ts'

// What `sharddev upload` checks before any byte is sent: format's check,
// the draft check (J198), AU5's audio rules, the hero gate (HERO-GATE HG2)
// and UP3's hero pre-check (J306). A hero the shard's stamp marks curated
// (`"curated": true` in its hero.json: hand-picked art, never recaptured)
// may stay unchanged; the commit then says `heroCurated`, which the API's
// own check honours (meta NET-LAG NL12, the coordinator's call, 2026-11-19).

const BYTES_PER_MB = 1_000_000
const ONE_DECIMAL = 1

interface CheckOptions extends ApiOptions {
  /** The shard version this upload sends. */
  readonly version: string
  /** The shard project upload runs in, whose hero stamp may mark the hero curated. */
  readonly heroSource?: string
  readonly report: (line: string) => void
}

/** What the commit needs from the checked shardfile. */
interface Checked {
  readonly slug: string
  /** The hero digest, when the shard has a card. */
  readonly hero: string | undefined
  /** The stamp marks the hero curated: it may stay unchanged. */
  readonly curated: boolean
}

function mb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(ONE_DECIMAL)} MB`
}

/** Whether the stamp of the shard source (`src/`, else `src/shards/<slug>/`) says `"curated": true`. */
async function curatedHero(project: string, slug: string): Promise<boolean> {
  const stamps = await Promise.all(
    [findShardSource(project), path.join(project, 'src', 'shards', slug)].map(
      async (source: string): Promise<unknown> =>
        await readJson(path.join(source, STAMP)).catch(
          (): undefined => undefined,
        ),
    ),
  )
  const stamp = stamps.find((found: unknown): boolean => found !== undefined)
  return field(stamp, 'curated') === true
}

/** Format's check, the draft check, the audio rules and the hero gate: each refuses before a byte is sent. */
async function validated(
  options: CheckOptions,
  tarball: Readonly<Uint8Array>,
  armed: () => Promise<ReadonlySet<string> | undefined>,
): Promise<Checked> {
  const { slug, name, audio, heroHash, draft, hero } = await validateShardfile(
    tarball,
    armed,
  )
  options.report(`valid: ${slug} (${name}), ${mb(tarball.length)}`)
  if (draft) {
    throw new Error(draftMessage(slug))
  }
  await assertAudio(audio)
  assertHero(hero)
  const curated =
    options.heroSource !== undefined &&
    (await curatedHero(options.heroSource, slug))
  return { slug, hero: heroHash, curated }
}

/**
 * UP3's hero pre-check (J306): a hero digest equal to the slug's newest
 * catalogued one refuses here, before any byte moves. A first version, a
 * catalogue with no digest (before UP4), a retry of the catalogued
 * version and a curated hero pass, as the API's own check does.
 */
async function checkHero(
  options: CheckOptions,
  shard: Checked,
  catalogue: () => Promise<readonly CatalogueShard[]>,
): Promise<void> {
  if (shard.hero === undefined || shard.curated) {
    return
  }
  const rows = await catalogue()
  const newest = rows.find(
    (row: Readonly<CatalogueShard>): boolean => row.slug === shard.slug,
  )
  if (newest?.heroHash === shard.hero && newest.version !== options.version) {
    throw new Error(
      `the hero is unchanged since ${[shard.slug, newest.version].filter(Boolean).join(' ')}: run wildshard hero, then build and upload again`,
    )
  }
}

/**
 * FORMAT-PRUNE FP27c (J426): the slugs the API catalogue arms, which the
 * format judges the memory lines by; undefined (the format's own list) when
 * the catalogue can't be read, which the hero check then reports.
 */
async function armedSlugs(
  catalogue: Promise<readonly CatalogueShard[]>,
): Promise<ReadonlySet<string> | undefined> {
  try {
    const rows = await catalogue
    const armed = rows.filter(
      (row: Readonly<CatalogueShard>): boolean =>
        row.armed !== undefined && row.armed !== null,
    )
    return new Set(
      armed.map((row: Readonly<CatalogueShard>): string => row.slug),
    )
  } catch {
    return undefined
  }
}

/** Every check before a byte is sent; what the commit needs. */
async function checkShardfile(
  options: CheckOptions,
  tarball: Readonly<Uint8Array>,
): Promise<Checked> {
  const asked: { rows?: Promise<readonly CatalogueShard[]> } = {}
  const read = async (): Promise<readonly CatalogueShard[]> =>
    await (asked.rows ??= readCatalogue(options))
  const shard = await validated(
    options,
    tarball,
    async (): Promise<ReadonlySet<string> | undefined> =>
      await armedSlugs(read()),
  )
  await checkHero(options, shard, read)
  return shard
}

export { type Checked, armedSlugs, checkShardfile }
