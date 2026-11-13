import { readFile } from 'node:fs/promises'

import { DRAFT_SDK, draftMessage } from '../../sharddev/draft.ts'
import { assertAudio } from '../audio/audio.ts'
import {
  commitUpload,
  findCatalogued,
  findStored,
  putObject,
  requestTicket,
} from './api.ts'
import { storedForm } from './compress.ts'
import { signTarball } from './signature.ts'
import { validateShardfile } from './validate.ts'

import type { ApiOptions, Channel } from './api.ts'
import type { StoredForm } from './compress.ts'
import type { Provenance } from './provenance.ts'
import type { SignedShardfile } from './signature.ts'
import type { CommitAnswer } from './wire.ts'

// `sharddev upload` (J60, J96): check the shardfile here, compress it here,
// sign the tarball, then ticket, PUT, commit. api-server only checks and
// stores what arrives. The commit carries the shard version and commit
// (API-CLOUDFLARE AC16, V1), and is sent for held bytes too, so the API
// answers which version holds them: a retry, or a 409 for another version.
// SHARD-AUTHORING UP3 adds the channel the upload is for (J301) and the
// versions it was built with (J306), and refuses a hero unchanged since the
// slug's newest catalogued version before any byte moves, as UP4's API will.
// An unprepared draft (sdk 0.2) refuses here too, before any request: the
// API answers it 422 at commit (J259), after the whole file was sent.

const MS_PER_SECOND = 1000
const BYTES_PER_MB = 1_000_000
const PERCENT = 100
const ONE_DECIMAL = 1
const WHOLE = 1

interface UploadOptions extends ApiOptions, Provenance {
  /** The shardfile tarball. */
  readonly file: string
  /** The channel the upload is for, by its wire name (J301). */
  readonly channel: Channel
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
      ? `sending the shard file uncompressed: Brotli would save under 1%`
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

/** UP2's echo of the channel and the versions: the fields the API sent. */
function echoOf(answer: CommitAnswer): string {
  const { channel, sharddev, engine, shardFormat } = answer
  const fields = { channel, sharddev, engine, shardFormat }
  return Object.entries(fields)
    .map(
      ([name, value]: readonly [string, string | null | undefined]): string =>
        typeof value === 'string' ? `, ${name} ${value}` : '',
    )
    .join('')
}

/** The commit, always: the API names the version that holds the bytes (V1). */
async function commit(
  options: UploadOptions,
  signed: SignedShardfile,
  contentEncoding: Encoding,
): Promise<UploadOutcome> {
  const { channel, sharddev, engine, shardFormat } = options
  const answer = await commitUpload(options, signed, {
    contentEncoding,
    version: options.version,
    commit: options.commit,
    channel,
    sharddev,
    engine,
    shardFormat,
  })
  const { hash, shard, revision, signedBy, created, staged, notified } = answer
  const { version, formatVersion, migrations } = answer
  options.report(
    `signed by ${signedBy}, created: ${String(created)}, staged: ${String(staged)}, notified: ${String(notified)}`,
  )
  options.report(
    `sent: channel ${channel}, sharddev ${sharddev}, engine ${engine}, shardFormat ${shardFormat}`,
  )
  options.report(
    `api: version ${version}, formatVersion ${formatVersion}, migrations ${JSON.stringify(migrations)}${echoOf(answer)}`,
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

/** What the hero pre-check needs from the validated shardfile. */
interface Validated {
  readonly slug: string
  /** The hero digest, when the shard has a card. */
  readonly hero: string | undefined
}

/**
 * Format's check, then the draft check (J198) and AU5's audio rules: a draft
 * or a red refuses before any byte is sent.
 */
async function validated(
  options: Readonly<UploadOptions>,
  tarball: Readonly<Uint8Array>,
): Promise<Validated> {
  const { slug, name, audio, heroHash, sdk } = await validateShardfile(tarball)
  options.report(`valid: ${slug} (${name}), ${mb(tarball.length)}`)
  if (sdk === DRAFT_SDK) {
    throw new Error(draftMessage(slug))
  }
  await assertAudio(audio)
  return { slug, hero: heroHash }
}

/**
 * UP3's hero pre-check (J306): a hero digest equal to the slug's newest
 * catalogued one refuses here, before any byte moves. A first version, a
 * catalogue with no digest (before UP4) and a retry of the catalogued
 * version pass, as the API's own check does.
 */
async function checkHero(
  options: UploadOptions,
  shard: Validated,
): Promise<void> {
  if (shard.hero === undefined) {
    return
  }
  const newest = await findCatalogued(options, shard.slug)
  if (newest?.heroHash === shard.hero && newest.version !== options.version) {
    throw new Error(
      `the hero is unchanged since ${[shard.slug, newest.version].filter(Boolean).join(' ')}: run wildshard hero, then build and upload again`,
    )
  }
}

/** Check, compress, sign, upload and commit; the upload that holds the bytes. */
async function uploadShardfile(options: UploadOptions): Promise<UploadOutcome> {
  const bytes = await readFile(options.file)
  const tarball = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length)
  await checkHero(options, await validated(options, tarball))
  const signed = signTarball(options.privateKey, tarball)
  const encoding = (await held(options, signed, tarball.length))
    ? undefined
    : await deliver(options, tarball, signed)
  const outcome = await commit(options, signed, encoding)
  const verb = outcome.alreadyStored ? 'already stored' : 'committed'
  options.report(
    `${verb}: ${outcome.shard} ${outcome.version} catalogue number ${String(outcome.revision)} for ${options.channel} (${outcome.hash})`,
  )
  return outcome
}

export { type UploadOptions, type UploadOutcome, uploadShardfile }
