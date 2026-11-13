import { readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  MANIFEST,
  NONE,
  STAMP,
  UNKNOWN_TIME,
  cardHashes,
  heroState,
  readJson,
} from './stamp.ts'

import type { HeroState } from './stamp.ts'

// The cut's hero check (`wildshard build`, as it writes the shard file, SA3): see stamp.ts for what the stamp
// records. Jake, 2026-11-12 17:14 Cancún: "you have to update the hero
// images for the templates."

const CAPTURE = 'pnpm exec wildshard hero'

/** The capture command a refusal names, run from the shard project root. */
function captureCommand(shard: string): string {
  return `${CAPTURE} src/shards/${path.basename(shard)} --base <served-build-url>`
}

/** The no-capture stamp, for hero files that already show this content. */
function stampExistingCommand(shard: string): string {
  return `${CAPTURE} src/shards/${path.basename(shard)} --stamp-existing`
}

/** The source shard folder of a product built at `<root>/out/<name>`. */
function sourceShard(product: string): string {
  const resolved = path.resolve(product)
  const root = path.dirname(path.dirname(resolved))
  return path.join(root, 'src', 'shards', path.basename(resolved))
}

/** Every file name in the product, without its extension: blobs are named by hash. */
async function productHashes(product: string): Promise<ReadonlySet<string>> {
  const entries = await readdir(product, { recursive: true })
  return new Set(entries.map((entry: string): string => path.parse(entry).name))
}

/** Refuse a product built before the stamped hero was captured. */
async function assertProductCarries(
  product: string,
  shard: string,
): Promise<void> {
  const card = await cardHashes(shard)
  const held = await productHashes(product)
  const missing = Object.keys(card).filter(
    (name: string): boolean => !held.has(card[name] ?? ''),
  )
  if (missing.length > NONE) {
    throw new Error(
      `the shard file folder ${product} does not carry the captured hero (${missing.join(', ')}); it was built before the capture: rebuild it (pnpm build:shards), then build its shard file`,
    )
  }
}

/** Why a hero that is neither fresh nor generated stops the cut, and the fix. */
function refusal(shard: string, hero: HeroState): string {
  const name = path.basename(shard)
  const capture = `serve this candidate in an engine build, then capture it: ${captureCommand(shard)}`
  const adopt = `; or, only if the images already there show this content, stamp them with no capture: ${stampExistingCommand(shard)}`
  if (hero.state === 'unstamped') {
    return `the hero of ${name} has no ${STAMP} stamp, so nothing says it shows this content; ${capture}${adopt}`
  }
  const captured = hero.captured ?? UNKNOWN_TIME
  return hero.stamped === hero.content
    ? `the hero files of ${name} are not the ones stamped (captured ${captured}), though the content is unchanged; ${capture}${adopt}`
    : `the hero of ${name} is older than its content (captured ${captured}); ${capture}`
}

/**
 * The cut's check. A built product lives at `<root>/out/<name>` and its
 * source at `<root>/src/shards/<name>`. Throws for a stale or unstamped
 * hero; reports and passes a generated card or a product with no source.
 */
async function assertHeroCurrent(
  product: string,
  report: (line: string) => void,
  source?: string,
): Promise<void> {
  // SA3: `build` names the project it built; a bare folder is read by layout.
  const shard = source ?? sourceShard(product)
  if ((await readJson(path.join(shard, MANIFEST))) === undefined) {
    report(`hero: no source shard with a ${MANIFEST} at ${shard}; not checked`)
    return
  }
  const hero = await heroState(shard)
  if (hero.state === 'fresh') {
    await assertProductCarries(product, shard)
    report(`hero: current (captured ${hero.captured ?? UNKNOWN_TIME})`)
  } else if (hero.state === 'generated') {
    report(
      `hero: generated card, no captured hero; capture one: ${captureCommand(shard)}`,
    )
  } else {
    throw new Error(refusal(shard, hero))
  }
}

export { assertHeroCurrent }
