import { access } from 'node:fs/promises'
import path from 'node:path'

import {
  MANIFEST,
  NONE,
  STAMP,
  heroSlotFiles,
  heroState,
  isMissing,
  readJson,
  writeHeroStamp,
} from './stamp.ts'

// `wildshard hero <shard> --stamp-existing`: a shard repo gains the hero check
// (stamp.ts) when it bumps its sharddev pin, with curated heroes and no stamp.
// Recapturing from the spawn view would put a plain shot over good art, so
// this stamps the files already there, with no capture. Only right when those
// images show the current content. A stamp whose content no longer matches is
// refused: there the world has moved past the picture, and only a capture fixes
// it.

const ADOPTED =
  'stamp-existing: the hero files already in the shard, adopted without a capture'

interface Adopted {
  /** False when the stamp was already current and nothing was written. */
  readonly written: boolean
  readonly content: string
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (error: unknown) {
    if (isMissing(error)) {
      return false
    }
    throw error
  }
}

/** Refuse a generated card or a card file that is not on disk. */
async function assertCardFiles(shard: string): Promise<void> {
  const files = Object.entries(await heroSlotFiles(shard))
  if (files.length === NONE) {
    throw new Error(
      `${path.join(shard, MANIFEST)}: the card is generated (data: urls), so there are no hero files to stamp`,
    )
  }
  const present = await Promise.all(
    files.map(
      async ([, file]: readonly [string, string]): Promise<boolean> =>
        await exists(file),
    ),
  )
  const gone = files.filter(
    (_entry: unknown, at: number): boolean => present[at] !== true,
  )
  if (gone.length > NONE) {
    const named = gone.map(
      ([slot, file]: readonly [string, string]): string =>
        `card.${slot} (${path.relative(shard, file).split(path.sep).join('/')})`,
    )
    throw new Error(`${named.join(', ')} not there; nothing stamped`)
  }
}

/** Refuse a hero.json that does not parse: it may declare a camera. */
async function assertStampReadable(shard: string): Promise<void> {
  try {
    await readJson(path.join(shard, STAMP))
  } catch (error: unknown) {
    throw new Error(
      `${path.join(shard, STAMP)} does not parse; fix it by hand, nothing stamped`,
      { cause: error },
    )
  }
}

/**
 * Stamp the hero files on disk as showing the content now, keeping a
 * declared camera. Only an unstamped hero, or hand-swapped hero files over
 * unchanged content, is stamped; a current stamp is left alone.
 */
async function stampExistingHero(shard: string): Promise<Adopted> {
  await assertCardFiles(shard)
  await assertStampReadable(shard)
  const hero = await heroState(shard)
  if (hero.state === 'fresh') {
    return { written: false, content: hero.content }
  }
  if (hero.stamped !== undefined && hero.stamped !== hero.content) {
    throw new Error(
      `the hero of ${path.basename(shard)} was stamped for other content (captured ${hero.captured ?? 'at an unknown time'}); the world has changed since, so only a capture fixes it, nothing stamped`,
    )
  }
  const stamp = await writeHeroStamp(shard, { base: ADOPTED })
  return { written: true, content: stamp.content }
}

export { stampExistingHero }
