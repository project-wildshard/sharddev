import { readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  NONE,
  STAMP,
  UNKNOWN_TIME,
  cardHashes,
  heroState,
  readJson,
} from './stamp.ts'

import type { HeroState } from './stamp.ts'

// The cut's hero check (`wildshard pack`): see stamp.ts for what the stamp
// records. Jake, 2026-11-12 17:14 Cancún: "you have to update the hero
// images for the templates."

const CAPTURE = 'pnpm exec wildshard hero'
const MANIFEST = 'manifest.json'

/** The capture command a refusal names, run from the shard project root. */
function captureCommand(shard: string): string {
  return `${CAPTURE} src/shards/${path.basename(shard)} --base <served-build-url>`
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
      `the product ${product} does not carry the captured hero (${missing.join(', ')}); it was built before the capture: rebuild it (pnpm build:shards), then pack`,
    )
  }
}

/** Why a hero that is neither fresh nor generated stops the cut. */
function refusal(name: string, hero: HeroState): string {
  return hero.state === 'unstamped'
    ? `the hero of ${name} has no ${STAMP} stamp, so nothing says it shows this content`
    : `the hero of ${name} is older than its content, or its files are not the ones stamped (captured ${hero.captured ?? UNKNOWN_TIME})`
}

/**
 * The cut's check. A built product lives at `<root>/out/<name>` and its
 * source at `<root>/src/shards/<name>`. Throws for a stale or unstamped
 * hero; reports and passes a generated card or a product with no source.
 */
async function assertHeroCurrent(
  product: string,
  report: (line: string) => void,
): Promise<void> {
  const shard = sourceShard(product)
  if ((await readJson(path.join(shard, MANIFEST))) === undefined) {
    report(
      `hero: no source shard at src/shards/${path.basename(shard)}; not checked`,
    )
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
    throw new Error(
      `${refusal(path.basename(shard), hero)}; serve this candidate in an engine build, then capture it: ${captureCommand(shard)}`,
    )
  }
}

export { assertHeroCurrent }
