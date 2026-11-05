import { readFile } from 'node:fs/promises'

import { commitUpload, findStored, putObject, requestTicket } from './api.ts'
import { storedForm } from './compress.ts'
import { signTarball } from './signature.ts'
import { validateShardfile } from './validate.ts'

import type { ApiOptions } from './api.ts'
import type { StoredForm } from './compress.ts'
import type { SignedShardfile } from './signature.ts'
import type { UploadResult } from './wire.ts'

// `sharddev upload` (J60, J96): check the shardfile here, compress it here,
// sign the tarball, then ticket, PUT, commit. api-server only checks and
// stores what arrives.

const MS_PER_SECOND = 1000
const BYTES_PER_MB = 1_000_000
const PERCENT = 100
const ONE_DECIMAL = 1
const WHOLE = 1
const NEWEST = -1

interface UploadOptions extends ApiOptions {
  /** The shardfile tarball. */
  readonly file: string
  /** Base64 PKCS#8: WILDSHARD_CREATOR_PRIVATE_KEY. */
  readonly privateKey: string
  /** Brotli quality. */
  readonly level: number
  /** Receives one line per step. */
  readonly report: (line: string) => void
}

/** The revision that holds the bytes. */
interface UploadOutcome {
  readonly hash: string
  readonly shard: string
  readonly revision: number
  /** The bytes were stored already, so nothing was sent. */
  readonly alreadyStored: boolean
}

function mb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(ONE_DECIMAL)} MB`
}

function secondsSince(start: number): string {
  const elapsed = (performance.now() - start) / MS_PER_SECOND
  return `${elapsed.toFixed(ONE_DECIMAL)} s`
}

async function alreadyStored(
  options: UploadOptions,
  hash: string,
): Promise<UploadOutcome | undefined> {
  const stored = await findStored(options, hash)
  const newest = stored?.revisions.at(NEWEST)
  return newest === undefined
    ? undefined
    : { hash, ...newest, alreadyStored: true }
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

/** Ticket, PUT, commit; undefined when the server had the bytes already. */
async function send(
  options: UploadOptions,
  signed: SignedShardfile,
  form: StoredForm,
): Promise<UploadResult | undefined> {
  const { body, contentEncoding } = form
  const ticket = await requestTicket(
    options,
    {
      hash: signed.hash,
      storedBytes: body.length,
      ...(contentEncoding === undefined ? {} : { contentEncoding }),
    },
    signed.signature,
  )
  if (ticket.stored) {
    return undefined
  }
  const start = performance.now()
  await putObject(ticket, body)
  options.report(`uploaded ${mb(body.length)} in ${secondsSince(start)}`)
  return await commitUpload(options, signed, contentEncoding)
}

async function deliver(
  options: UploadOptions,
  tarball: Readonly<Uint8Array>,
  signed: SignedShardfile,
): Promise<UploadOutcome> {
  const form = await compressed(options, tarball)
  const result = await send(options, signed, form)
  if (result !== undefined) {
    const { hash, shard, revision, signedBy, created, staged } = result
    options.report(
      `signed by ${signedBy}, created: ${String(created)}, staged: ${String(staged)}, notified: ${String(result.notified)}`,
    )
    return { hash, shard, revision, alreadyStored: false }
  }
  const stored = await alreadyStored(options, signed.hash)
  if (stored === undefined) {
    throw new Error('the server has these bytes but does not list them')
  }
  return stored
}

/** Check, compress, sign and upload; the revision that holds the bytes. */
async function uploadShardfile(options: UploadOptions): Promise<UploadOutcome> {
  const bytes = await readFile(options.file)
  const tarball = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length)
  const { slug, name } = await validateShardfile(tarball)
  options.report(`valid: ${slug} (${name}), ${mb(tarball.length)}`)
  const signed = signTarball(options.privateKey, tarball)
  const stored = await alreadyStored(options, signed.hash)
  const outcome = stored ?? (await deliver(options, tarball, signed))
  const verb = outcome.alreadyStored ? 'already stored' : 'committed'
  options.report(
    `${verb}: ${outcome.shard} revision ${String(outcome.revision)} (${outcome.hash})`,
  )
  return outcome
}

export { type UploadOptions, type UploadOutcome, uploadShardfile }
