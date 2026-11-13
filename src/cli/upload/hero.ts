import { createHash } from 'node:crypto'

// The hero digest (meta SHARD-AUTHORING UP4, J306, choice 4), computed as
// api-server computes it (`src/server/shardfile/hero.ts`, `79f5ca1`), so
// the upload pre-check refuses exactly what the commit would. A shard's
// hero is its SHARD SELECT card, three images; the digest is the SHA-256
// of `thumb:<hash>\nportrait:<hash>\nlandscape:<hash>`, each the image's
// blob hash.
//
// The card is the manifest's (`manifest.card`, the packed URLs every live
// shard and the template carry), else the presentation's (bare blob
// hashes). A packed URL names its blob,
// `/shardfiles/<folder>/blobs/image/<hash>.<ext>`; a generated `data:`
// card has no blob, so its hash is the SHA-256 of the URL. A shard with no
// card has no digest.

interface HeroCard {
  readonly thumb: string
  readonly portrait: string
  readonly landscape: string
}

/** The two places a validated shard file carries its card. */
interface Carded {
  readonly manifest?: Readonly<{ card: HeroCard }> | undefined
  readonly presentation?: Readonly<{ card: HeroCard }> | undefined
}

const BLOB_HASH = /^[a-f0-9]{64}$/u
const BLOB_URL =
  /^\/shardfiles\/[^/]+\/blobs\/image\/(?<hash>[a-f0-9]{64})\.[a-z0-9]+$/u

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** One card image's blob hash: a bare hash, the hash a packed URL names, else the URL's own SHA-256. */
function imageHash(image: string): string {
  if (BLOB_HASH.test(image)) {
    return image
  }
  return BLOB_URL.exec(image)?.groups?.['hash'] ?? sha256(image)
}

/** The digest of a card's three images, in choice 4's order. */
function cardDigest(card: HeroCard): string {
  return sha256(
    [
      `thumb:${imageHash(card.thumb)}`,
      `portrait:${imageHash(card.portrait)}`,
      `landscape:${imageHash(card.landscape)}`,
    ].join('\n'),
  )
}

/** The shard's hero digest, or undefined when it has no card. */
function heroHashOf(shard: Readonly<Carded>): string | undefined {
  const card = shard.manifest?.card ?? shard.presentation?.card
  return card === undefined ? undefined : cardDigest(card)
}

export { type Carded, type HeroCard, cardDigest, heroHashOf }
