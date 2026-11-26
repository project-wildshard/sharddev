import { ApiRefusalError, commitUpload } from './api.ts'

import type { ApiOptions, CommitBody } from './api.ts'
import type { UploadIdentity } from './signature.ts'
import type { CommitAnswer } from './wire.ts'

// QA-11-23-b row 45 (J505): a republish of unchanged bytes asks for a new
// version, and api-server's `known` answers 409 "these bytes are already
// <shard> <version>". The commit goes again as that version, which the API
// answers with the existing upload's id and status, so the run reaches the
// cook wait on the upload that holds the bytes, exactly as a fresh upload
// does. A 409 naming another channel, pruned bytes or a taken version still
// refuses: its message names more than the shard and the version.

const CONFLICT = 409
const HELD_AS = /: these bytes are already (?<shard>\S+) (?<version>\S+)$/u

interface HeldOptions extends ApiOptions {
  readonly report: (line: string) => void
}

/** The version a 409 says already holds these bytes, when it names one and no other channel. */
function heldAs(error: unknown, asked: string): string | undefined {
  if (!(error instanceof ApiRefusalError) || error.status !== CONFLICT) {
    return undefined
  }
  const version = HELD_AS.exec(error.message)?.groups?.['version']
  return version === asked ? undefined : version
}

/** The commit; bytes already held as another version commit again as that version. */
async function commitHeld(
  options: HeldOptions,
  signed: UploadIdentity,
  body: CommitBody,
): Promise<CommitAnswer> {
  try {
    return await commitUpload(options, signed, body)
  } catch (error) {
    const version = heldAs(error, body.shardVersion)
    if (version === undefined) {
      throw error
    }
    options.report(
      `these bytes are already ${version}, not ${body.shardVersion}: carrying on with the upload that holds them`,
    )
    return await commitUpload(options, signed, {
      ...body,
      shardVersion: version,
    })
  }
}

export { commitHeld }
