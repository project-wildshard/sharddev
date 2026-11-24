import { createHash } from 'node:crypto'

import { installFormatHook } from '@wildshard/format/formatHook'

import { isDraftIndex } from '../../sharddev/draft.ts'
import { heroVerdict } from './hero-gate.ts'
import { heroHashOf } from './hero.ts'

import type { HeroShard, HeroVerdict } from './hero-gate.ts'
import type { HeroCard } from './hero.ts'
import type { AudioReport } from '@wildshard/format/audioRules'
import type { ShardfileFiles as ProductFiles } from '@wildshard/format/shardfileValidation'

// The same check api-server runs on commit, run first on the author's
// machine: a shardfile the server would refuse should not cost a Brotli
// pass and a 200 MB upload to find out.

/** What the upload reports about a valid shardfile. */
interface ValidShardfile {
  readonly slug: string
  readonly name: string
  /** AUDIO AU5: the shard's own audio against format's rules, as of today. */
  readonly audio: AudioReport
  /** `presentation.card`'s three image blob hashes, when it has one (J306). */
  readonly card: HeroCard | undefined
  /** The hero digest api-server's UP4 takes (`hero.ts`); undefined with no card. */
  readonly heroHash: string | undefined
  /** Meta HERO-GATE HG2: whether the hero is present, captured, carried and the right size. */
  readonly hero: HeroVerdict
  /** `0.2`: a draft as `wildshard build` writes it; `0.3`: prepared (J198). */
  /** PR4: no preparation recorded (`sdk: "0.2"`, or no `preparation` at format 0.1.0.3). */
  readonly draft: boolean
}

function sha256(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The tarball's files as format's read-only view of a product folder. */
function productFiles(files: ReadonlyMap<string, Uint8Array>): ProductFiles {
  return {
    read: (path: string, maxBytes: number): Uint8Array => {
      const bytes = files.get(path)
      if (bytes === undefined) {
        throw new Error(`no ${path} in the shard file`)
      }
      if (bytes.length > maxBytes) {
        throw new Error(`${path} is larger than ${String(maxBytes)} bytes`)
      }
      return bytes
    },
    paths: (): Iterable<string> => files.keys(),
  }
}

/** HG2's verdict and the digest UP4 compares: a scene shard's card is its discovery mount's. */
function heroOf(
  shard: Readonly<HeroShard>,
  members: ReadonlyMap<string, Readonly<Uint8Array>>,
): Pick<ValidShardfile, 'hero' | 'heroHash'> {
  const hero = heroVerdict(shard, members)
  return { hero, heroHash: hero.ok ? hero.digest : heroHashOf(shard) }
}

/** A draft refuses whatever the catalogue says, so its check asks nothing (FP27c). */
function draftTar(members: ReadonlyMap<string, Readonly<Uint8Array>>): boolean {
  const index = members.get('shard.json')
  try {
    return (
      index !== undefined &&
      isDraftIndex(JSON.parse(new TextDecoder().decode(index)))
    )
  } catch {
    return false
  }
}

/** The validation's ports: the hash, and the catalogue's armed slugs unless this is a draft (FP27c). */
async function validationPorts(
  members: ReadonlyMap<string, Readonly<Uint8Array>>,
  armedSlugs: (() => Promise<ReadonlySet<string> | undefined>) | undefined,
): Promise<{ hash: typeof sha256; armed?: ReadonlySet<string> }> {
  const armed = draftTar(members) ? undefined : await armedSlugs?.()
  return { hash: sha256, ...(armed === undefined ? {} : { armed }) }
}

/** The shard's identity; throws with format's reason when it is invalid. */
async function validateShardfile(
  tarball: Readonly<Uint8Array>,
  armedSlugs?: () => Promise<ReadonlySet<string> | undefined>,
): Promise<ValidShardfile> {
  installFormatHook()
  const { prepareAssetDecoders } =
    await import('@wildshard/format/shardfileAssets')
  const { validateShardfileFolder: validateShardfileProduct } =
    await import('@wildshard/format/shardfileValidation')
  const { shardfileAudioReport: productAudioReport } =
    await import('@wildshard/format/shardfileAudio')
  const { readTar } = await import('@wildshard/format/tar')
  await prepareAssetDecoders()
  const members = readTar(tarball)
  // FORMAT-PRUNE FP27c: the catalogue's armed slugs judge the memory lines, as the API's own admission does; asked
  // only once the tar reads, so a broken file still refuses before any request.
  const valid = validateShardfileProduct(
    productFiles(members),
    await validationPorts(members, armedSlugs),
  )
  const { identity, presentation } = valid.shard
  return {
    draft: isDraftIndex(valid.index),
    slug: identity.slug,
    name: identity.name,
    audio: productAudioReport(valid, new Date()),
    card: presentation?.card,
    ...heroOf(valid.shard, members),
  }
}

export { assertHero } from './hero-gate.ts'
export { type ValidShardfile, validateShardfile }
