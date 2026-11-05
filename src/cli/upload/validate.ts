import { createHash } from 'node:crypto'

import { installFormatHook } from '@wildshard/format/formatHook'

import type { ProductFiles } from '@wildshard/format/productValidation'

// The same check api-server runs on commit, run first on the author's
// machine: a shardfile the server would refuse should not cost a Brotli
// pass and a 200 MB upload to find out.

/** What the upload reports about a valid shardfile. */
interface ValidShardfile {
  readonly slug: string
  readonly name: string
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
        throw new Error(`no ${path} in the shardfile`)
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
  const { prepareAssetDecoders } = await import('@wildshard/format/product')
  const { validateShardfileProduct } =
    await import('@wildshard/format/productValidation')
  const { readTar } = await import('@wildshard/format/tar')
  await prepareAssetDecoders()
  const product = productFiles(readTar(tarball))
  const { identity } = validateShardfileProduct(product, { hash: sha256 }).shard
  return { slug: identity.slug, name: identity.name }
}

export { type ValidShardfile, validateShardfile }
