import { readFile } from 'node:fs/promises'

import { assertAudio } from '../audio/audio.ts'
import { commitUpload, findStored, putObject, requestTicket } from './api.ts'
import { storedForm } from './compress.ts'
import { signTarball } from './signature.ts'
import { validateShardfile } from './validate.ts'

import type { ApiOptions } from './api.ts'
import type { StoredForm } from './compress.ts'
import type { Provenance } from './provenance.ts'
import type { SignedShardfile } from './signature.ts'

// `sharddev upload` (J60, J96): check the shardfile here, compress it here,
// sign the tarball, then ticket, PUT, commit. api-server only checks and
// stores what arrives. The commit carries the shard version and commit
// (API-CLOUDFLARE AC16, V1), and is sent for held bytes too, so the API
// answers which version holds them: a retry, or a 409 for another version.

const MS_PER_SECOND = 1000
const BYTES_PER_MB = 1_000_000
const PERCENT = 100
const ONE_DECIMAL = 1
const WHOLE = 1

interface UploadOptions extends ApiOptions, Provenance {
  /** The shardfile tarball. */
  readonly file: string
  /** Base64 PKCS#8: WILDSHARD_CREATOR_PRIVATE_KEY. */
  readonly privateKey: string
  /** Brotli quality. */
  readonly level: number
  /** Receives one line per step. */
  readonly report: (line: string) => void
}

/** The upload that holds the bytes, as the API answered its commit. */
interface UploadOutcome {
  readonly hash: string
  readonly shard: string
  readonly revision: number
  /** The bytes were stored already, so nothing new was recorded. */
  readonly alreadyStored: boolean
  /** The shard version the API holds these bytes as. */
  readonly version: string
  /** The API's format version. */
  readonly formatVersion: string
  /** The migrations the API ran. */
  readonly migrations: readonly unknown[]
}

type Encoding = StoredForm['contentEncoding']

function mb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(ONE_DECIMAL)} MB`
}

function secondsSince(start: number): string {
  const elapsed = (performance.now() - start) / MS_PER_SECOND
  return `${elapsed.toFixed(ONE_DECIMAL)} s`
}

/**
 * Listed bytes still ask for a ticket: the listing says they are held, and
 * only the ticket says today's format takes them. A break refuses them here.
 * True when they are held, so nothing needs compressing or sending.
 */
async function held(
  options: UploadOptions,
  signed: SignedShardfile,
  tarballBytes: number,
): Promise<boolean> {
  const listed = await findStored(options, signed.hash)
  if (listed === undefined) {
    return false
  }
  const ticket = await requestTicket(
    options,
    { hash: signed.hash, storedBytes: tarballBytes },
    signed.signature,
  )
  return ticket.stored
}

async function compressed(
  options: UploadOptions,
  tarball: Readonly<Uint8Array>,
): Promise<StoredForm> {
  const start = performance.now()
  const form = await storedForm(tarball, options.level)
  const saved = PERCENT * (WHOLE - form.body.length / tarball.length)
  options.report(
    form.contentEncoding === undefined
      ? `sending the plain tarball: Brotli would save under 1%`
      : `brotli-${String(options.level)}: ${mb(tarball.length)} -> ${mb(form.body.length)}, ${saved.toFixed(ONE_DECIMAL)}% saved in ${secondsSince(start)}`,
  )
  return form
}

/** Compress, ticket, and PUT unless the server has the bytes already. */
async function deliver(
  options: UploadOptions,
  tarball: Readonly<Uint8Array>,
  signed: SignedShardfile,
): Promise<Encoding> {
  const { body, contentEncoding } = await compressed(options, tarball)
  const ticket = await requestTicket(
    options,
    {
      hash: signed.hash,
      storedBytes: body.length,
      ...(contentEncoding === undefined ? {} : { contentEncoding }),
    },
    signed.signature,
  )
  if (!ticket.stored) {
    const start = performance.now()
    await putObject(ticket, body)
    options.report(`uploaded ${mb(body.length)} in ${secondsSince(start)}`)
  }
  return contentEncoding
}

/** The commit, always: the API names the version that holds the bytes (V1). */
async function commit(
  options: UploadOptions,
  signed: SignedShardfile,
  contentEncoding: Encoding,
): Promise<UploadOutcome> {
  const answer = await commitUpload(options, signed, {
    contentEncoding,
    version: options.version,
    commit: options.commit,
  })
  const { hash, shard, revision, signedBy, created, staged, notified } = answer
  const { version, formatVersion, migrations } = answer
  options.report(
    `signed by ${signedBy}, created: ${String(created)}, staged: ${String(staged)}, notified: ${String(notified)}`,
  )
  options.report(
    `api: version ${version}, formatVersion ${formatVersion}, migrations ${JSON.stringify(migrations)}`,
  )
  return {
    hash,
    shard,
    revision,
    alreadyStored: !created,
    version,
    formatVersion,
    migrations,
  }
}

/** Format's check, then AU5's audio rules: a red refuses before any byte is sent. */
async function validated(
  options: Readonly<UploadOptions>,
  tarball: Readonly<Uint8Array>,
): Promise<void> {
  const { slug, name, audio } = await validateShardfile(tarball)
  options.report(`valid: ${slug} (${name}), ${mb(tarball.length)}`)
  await assertAudio(audio)
}

/** Check, compress, sign, upload and commit; the upload that holds the bytes. */
async function uploadShardfile(options: UploadOptions): Promise<UploadOutcome> {
  const bytes = await readFile(options.file)
  const tarball = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length)
  await validated(options, tarball)
  const signed = signTarball(options.privateKey, tarball)
  const encoding = (await held(options, signed, tarball.length))
    ? undefined
    : await deliver(options, tarball, signed)
  const outcome = await commit(options, signed, encoding)
  const verb = outcome.alreadyStored ? 'already stored' : 'committed'
  options.report(
    `${verb}: ${outcome.shard} ${outcome.version} revision ${String(outcome.revision)} (${outcome.hash})`,
  )
  return outcome
}

export { type UploadOptions, type UploadOutcome, uploadShardfile }
