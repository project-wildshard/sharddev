import { access } from 'node:fs/promises'
import path from 'node:path'

import {
  MANIFEST,
  NONE,
  heroSlotFiles,
  isMissing,
  writeHeroStamp,
} from './stamp.ts'

import type { HeroStamp } from './stamp.ts'

// `wildshard hero <shard> --stamp-existing`: a shard repo gains the hero check
// (stamp.ts) when it bumps its sharddev pin, with curated heroes and no stamp.
// Recapturing from the spawn view would put a plain shot over good art, so
// this stamps the files already there, with no capture. Only right when those
// images show the current content.

const ADOPTED =
  'stamp-existing: the hero files already in the shard, adopted without a capture'

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

/**
 * Stamp the hero files on disk as showing the content now, keeping a
 * declared camera. Refuses a generated card or a card file that is missing.
 */
async function stampExistingHero(shard: string): Promise<HeroStamp> {
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
  return await writeHeroStamp(shard, { base: ADOPTED })
}

export { stampExistingHero }
