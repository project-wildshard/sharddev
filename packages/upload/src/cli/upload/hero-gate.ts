import { cardDigest } from './hero.ts'
import { imageSize } from './image-size.ts'

import type { Carded, HeroCard } from './hero.ts'
import type { Size } from './image-size.ts'

// The hero gate (meta HERO-GATE HG2). Jake, 2026-11-17 ~14:32 Cancún: "in
// zone select there are zones without hero images that's bad, that should
// be failing at either the sharddev cli or the api-server level or both."
//
// The same rules api-server's commit runs (its `shardfile/hero-gate.ts`),
// run on the author's machine first, over the tarball's members. A hero is
// the zone-select card's three images at the sizes `wildshard hero`
// captures (GUIDE "The hero"). The card is the discovery mount's
// (`mounts/shardfiles/<folder>/discovery.json` `data.card`, what the cook
// serves a placed zone's card), else the manifest's, else the
// presentation's: api-server's order. A
// card that is missing, the generated `data:` placeholder, not carried,
// not an image or the wrong size refuses with its rule and the fix.

type Slot = keyof HeroCard

type HeroRule = 'hero-missing' | 'hero-generated' | 'hero-image' | 'hero-size'

type HeroVerdict =
  | Readonly<{ ok: true; digest: string }>
  | Readonly<{ ok: false; rule: HeroRule; reason: string }>

/** What the gate needs of the validated shard besides its files. */
type HeroShard = Carded & Readonly<{ identity: Readonly<{ slug: string }> }>

type Members = ReadonlyMap<string, Readonly<Uint8Array>>

const SLOTS: readonly Slot[] = ['thumb', 'portrait', 'landscape']
const SIZES: Readonly<Record<Slot, Size>> = {
  thumb: { width: 640, height: 360 },
  portrait: { width: 804, height: 1626 },
  landscape: { width: 1600, height: 900 },
}
const SHOWN = 120
const ONLY = 1
const START = 0
const BLOB_HASH = /^[a-f0-9]{64}$/u
const BLOB_URL =
  /^\/shardfiles\/[^/]+\/blobs\/image\/(?<hash>[a-f0-9]{64})\.[a-z0-9]+$/u
const IMAGE_PATH =
  /^(?:blobs|mounts\/shardfiles\/[^/]+\/blobs)\/image\/(?<hash>[a-f0-9]{64})\.(?:jpe?g|png|webp)$/u
const DISCOVERY_PATH = /^mounts\/shardfiles\/[^/]+\/discovery\.json$/u
const CAPTURE =
  'capture it from a served build with `wildshard hero <shard> --base <url>`, then build, pack and upload again'

function isCard(value: unknown): value is HeroCard {
  return (
    typeof value === 'object' &&
    value !== null &&
    SLOTS.every(
      (slot: Slot): boolean => typeof Reflect.get(value, slot) === 'string',
    )
  )
}

/** The value at `key` of an object, else undefined. */
function at(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined
}

/** A discovery document's `data.card`, if it has a whole one. */
function cardOf(bytes: Readonly<Uint8Array>): HeroCard | undefined {
  try {
    const document: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const card = at(at(document, 'data'), 'card')
    return isCard(card) ? card : undefined
  } catch {
    return undefined
  }
}

/** The discovery mount's card: the shard's own folder's, else the only mount's. */
function discoveryCard(slug: string, files: Members): HeroCard | undefined {
  const mounts = [...files.keys()].filter((path: string): boolean =>
    DISCOVERY_PATH.test(path),
  )
  const own = `mounts/shardfiles/${slug}/discovery.json`
  const [only] = mounts.length === ONLY ? mounts : []
  const bytes = files.get(mounts.includes(own) ? own : (only ?? ''))
  return bytes === undefined ? undefined : cardOf(bytes)
}

/** The shard's card: the discovery mount's, else the manifest's, else the presentation's (api-server's order). */
function heroCard(
  shard: Readonly<HeroShard>,
  files: Members,
): HeroCard | undefined {
  return (
    discoveryCard(shard.identity.slug, files) ??
    shard.manifest?.card ??
    shard.presentation?.card
  )
}

/** Each image member's bytes by blob hash. */
function imagesOf(files: Members): ReadonlyMap<string, Readonly<Uint8Array>> {
  const images = new Map<string, Readonly<Uint8Array>>()
  for (const [path, bytes] of files) {
    const hash = IMAGE_PATH.exec(path)?.groups?.['hash']
    if (hash !== undefined) {
      images.set(hash, bytes)
    }
  }
  return images
}

function refused(rule: HeroRule, reason: string): HeroVerdict {
  return { ok: false, rule, reason: `[${rule}] ${reason}; ${CAPTURE}` }
}

function sizeText({ width, height }: Size): string {
  return `${String(width)}x${String(height)}`
}

/** An image's refusal, if it is not an image or not its slot's size. */
function sizeRefusal(
  named: string,
  slot: Slot,
  bytes: Readonly<Uint8Array>,
): HeroVerdict | undefined {
  const size = imageSize(bytes)
  if (size === undefined) {
    return refused('hero-image', `${named} is not a PNG, JPEG or WebP image`)
  }
  const want = SIZES[slot]
  return size.width === want.width && size.height === want.height
    ? undefined
    : refused(
        'hero-size',
        `${named} is ${sizeText(size)}, not ${sizeText(want)}`,
      )
}

/** One card image's refusal, if it breaks a rule. */
function slotRefusal(
  {
    named,
    slot,
    image,
  }: Readonly<{ named: string; slot: Slot; image: string }>,
  images: ReadonlyMap<string, Readonly<Uint8Array>>,
): HeroVerdict | undefined {
  if (image.startsWith('data:')) {
    return refused(
      'hero-generated',
      `${named} is the generated placeholder card, not a captured hero`,
    )
  }
  const hash = BLOB_HASH.test(image)
    ? image
    : BLOB_URL.exec(image)?.groups?.['hash']
  const bytes = hash === undefined ? undefined : images.get(hash)
  if (bytes === undefined) {
    return refused(
      'hero-image',
      `${named} (${image.slice(START, SHOWN)}) is not an image this shard file carries`,
    )
  }
  return sizeRefusal(named, slot, bytes)
}

/** Whether the shard's hero is present, captured, carried, an image and the right size; its digest when it is. */
function heroVerdict(shard: Readonly<HeroShard>, files: Members): HeroVerdict {
  const card = heroCard(shard, files)
  const { slug } = shard.identity
  if (card === undefined) {
    return refused(
      'hero-missing',
      `${slug} has no hero (no card in its discovery, manifest or presentation)`,
    )
  }
  const images = imagesOf(files)
  const refusals = SLOTS.map((slot: Slot): HeroVerdict | undefined =>
    slotRefusal(
      { named: `${slug}'s hero ${slot}`, slot, image: card[slot] },
      images,
    ),
  )
  return (
    refusals.find(
      (row: HeroVerdict | undefined): boolean => row !== undefined,
    ) ?? { ok: true, digest: cardDigest(card) }
  )
}

/** Upload's refusal (HG2, Jake 2026-11-17): no zone reaches zone select without a hero. */
function assertHero(hero: HeroVerdict): void {
  if (!hero.ok) {
    throw new Error(hero.reason)
  }
}

export {
  type HeroRule,
  type HeroShard,
  type HeroVerdict,
  assertHero,
  heroCard,
  heroVerdict,
}
