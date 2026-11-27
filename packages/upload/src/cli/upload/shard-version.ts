import { installFormatHook } from '@wildshard/format/formatHook'

import { projectVersion } from './provenance.ts'

const HEADER = 'shard.json'

/** Read the field the author wrote, without using a format version as a fallback. */
function authoredShardVersion(
  bytes: Readonly<Uint8Array> | undefined,
): string | undefined {
  if (bytes === undefined) {
    return undefined
  }
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (data === null || typeof data !== 'object' || !('shardVersion' in data)) {
    return undefined
  }
  if (typeof data.shardVersion !== 'string') {
    throw new TypeError('shard.json shardVersion must be a string')
  }
  return data.shardVersion
}

async function assertShardVersion(
  project: string,
  authored: string | undefined,
  asked?: string,
): Promise<void> {
  const packageVersion = await projectVersion(project).catch(
    (): undefined => undefined,
  )
  if (
    authored !== undefined &&
    packageVersion === authored &&
    (asked === undefined || asked === authored)
  ) {
    return
  }
  const upload = asked === undefined ? '' : `, upload shardVersion=${asked}`
  throw new Error(
    `shard version mismatch: package.json version=${packageVersion ?? '(missing)'}, shard.json shardVersion=${authored ?? '(missing)'}${upload}`,
  )
}

async function checkUploadShardVersion(
  project: string,
  tarball: Readonly<Uint8Array>,
  asked: string,
): Promise<void> {
  installFormatHook()
  const { readTar } = await import('@wildshard/format/tar')
  const authored = authoredShardVersion(readTar(tarball).get(HEADER))
  await assertShardVersion(project, authored, asked)
}

export { assertShardVersion, authoredShardVersion, checkUploadShardVersion }
