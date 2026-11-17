import { createHash } from 'node:crypto'

import { installFormatHook } from '@wildshard/format/formatHook'

import { heroHashOf } from './hero.ts'

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
  /** `0.2`: a draft as `wildshard build` writes it; `0.3`: prepared (J198). */
  readonly sdk: '0.2' | '0.3'
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

/** The shard's identity; throws with format's reason when it is invalid. */
async function validateShardfile(
  tarball: Readonly<Uint8Array>,
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
  const product = productFiles(readTar(tarball))
  const valid = validateShardfileProduct(product, { hash: sha256 })
  const { identity, presentation } = valid.shard
  return {
    sdk: valid.index.sdk,
    slug: identity.slug,
    name: identity.name,
    audio: productAudioReport(valid, new Date()),
    card: presentation?.card,
    heroHash: heroHashOf(valid.shard),
  }
}

export { type ValidShardfile, validateShardfile }
