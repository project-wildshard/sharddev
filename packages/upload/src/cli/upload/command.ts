import { apiKeyOf, uploadKeyRefusal } from '../account/command.ts'
import { keyTransport } from '../account/key.ts'
import { refuse, reportLine } from '../report.ts'
import {
  DEFAULT_BROTLI_LEVEL,
  MAX_BROTLI_LEVEL,
  MIN_BROTLI_LEVEL,
} from './compress.ts'
import { resolveProvenance } from './provenance.ts'
import { printUploadStatus } from './status.ts'
import { uploadShardfile } from './upload.ts'

import type { CliArgs } from '../args.ts'
import type { Provenance } from './provenance.ts'
import type { StatusOptions } from './status.ts'
import type { UploadOptions } from './upload.ts'

type Env = Readonly<Record<string, string | undefined>>
const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3
const DEFAULT_STATUS_SERVER = 'https://api.wildshard.io'

function parseLevel(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return DEFAULT_BROTLI_LEVEL
  }
  const level = Number(raw)
  return Number.isInteger(level) &&
    level >= MIN_BROTLI_LEVEL &&
    level <= MAX_BROTLI_LEVEL
    ? level
    : undefined
}

function bypassOption(env: Env): { readonly bypassSecret?: string } {
  const bypassSecret = env['VERCEL_AUTOMATION_BYPASS_SECRET'] ?? ''
  return bypassSecret === '' ? {} : { bypassSecret }
}

/** The running `wildshard`, read by its caller: its version (SDK-SPLIT SP2a) and its folder, where the engine and
 * shard-format resolve when the shard has none installed (SP2b). */
interface Uploader {
  readonly version: string
  readonly installDir?: string | undefined
}

/** The shard version and commit to send, or what is wrong (AC16). */
async function provenanceOf(
  args: CliArgs,
  uploader: Uploader,
): Promise<Provenance | string> {
  try {
    const provenance = await resolveProvenance({
      cwd: process.cwd(),
      sharddev: uploader.version,
      installDir: uploader.installDir,
      shardVersion: args.shardVersion,
      commit: args.commit,
    })
    reportLine(
      `shard source version ${provenance.shardVersion}, commit ${provenance.commit}`,
    )
    return provenance
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** `--channel`'s wire name (J301): `prod` is the channel `production`. */
type Channel = UploadOptions['channel']

const CHANNELS: Readonly<Record<string, Channel>> = {
  staging: 'staging',
  prod: 'production',
}

/** The upload's channel by its wire name, if `--channel` names one. */
function channelOf(raw: string | undefined): Channel | undefined {
  return raw !== undefined && Object.hasOwn(CHANNELS, raw)
    ? CHANNELS[raw]
    : undefined
}

function channelRefusal(raw: string | undefined): string {
  const given = raw === undefined ? '' : `, not --channel ${raw}`
  return `upload needs --channel staging or --channel prod${given}`
}

type Connection = Omit<
  UploadOptions,
  keyof Provenance | 'file' | 'channel' | 'place'
>

/** `--server`, else WILDSHARD_API_URL, else empty. */
function serverOf(args: CliArgs, env: Env): string {
  return args.server ?? env['WILDSHARD_API_URL'] ?? ''
}

/** What stops upload before any request: the server or account credential. */
function credentialsRefusal(
  server: string,
  apiKey: string | undefined,
): string | undefined {
  if (server === '') {
    return 'upload needs --server (or WILDSHARD_API_URL)'
  }
  return uploadKeyRefusal(server, apiKey)
}

/**
 * The level, server and keys, or what is wrong. No account key refuses
 * here, before any request (meta SHARD-DELETE DEL6): api-server answers a
 * keyless ticket 401 since DEL5.
 */
function connectionOf(
  args: CliArgs,
  apiKey: string | undefined,
  env: Env,
): Connection | string {
  const level = parseLevel(args.level)
  const server = serverOf(args, env)
  const privateKey = env['WILDSHARD_CREATOR_PRIVATE_KEY']?.trim()
  if (level === undefined) {
    return `invalid --level ${String(args.level)}`
  }
  const refusal = credentialsRefusal(server, apiKey)
  if (refusal !== undefined || apiKey === undefined) {
    return refusal ?? ''
  }
  return {
    server,
    apiKey,
    ...(privateKey === undefined || privateKey === '' ? {} : { privateKey }),
    level,
    report: reportLine,
    ...bypassOption(env),
  }
}

/** Everything but the provenance, or what is wrong. */
function uploadSettings(
  args: CliArgs,
  apiKey: string | undefined,
  env: Env,
): Omit<UploadOptions, keyof Provenance> | string {
  const channel = channelOf(args.channel)
  if (args.operand === undefined) {
    return 'upload needs a shard file'
  }
  if (channel === undefined) {
    return channelRefusal(args.channel)
  }
  const connection = connectionOf(args, apiKey, env)
  return typeof connection === 'string'
    ? connection
    : {
        file: args.operand,
        channel,
        place: !args.noPlace,
        listNew: args.listNew,
        wait: !args.noWait,
        heroSource: process.cwd(),
        ...connection,
      }
}

/** The upload's settings from flags and environment, or what is wrong. */
async function uploadOptions(
  args: CliArgs,
  env: Env,
  uploader: Uploader,
): Promise<UploadOptions | string> {
  const apiKey = await apiKeyOf(env['WILDSHARD_API_KEY'])
  if (apiKey instanceof Error) {
    return apiKey.message
  }
  const settings = uploadSettings(args, apiKey, env)
  if (typeof settings === 'string') {
    return settings
  }
  const provenance = await provenanceOf(args, uploader)
  return typeof provenance === 'string'
    ? provenance
    : { ...settings, ...provenance }
}

async function runConnectedStatus(
  connection: StatusOptions,
  id: string,
): Promise<number> {
  try {
    await printUploadStatus(connection, id, reportLine)
    return EXIT_OK
  } catch (error: unknown) {
    refuse('upload', 'status failed: ', error)
    return EXIT_FAILED
  }
}

async function statusConnection(
  args: CliArgs,
  env: Env,
): Promise<StatusOptions | string> {
  const apiKey = await apiKeyOf(env['WILDSHARD_API_KEY'])
  if (apiKey instanceof Error) {
    return apiKey.message
  }
  const server = serverOf(args, env) || DEFAULT_STATUS_SERVER
  const bypass = bypassOption(env)
  const unsafe =
    apiKey === undefined && bypass.bypassSecret === undefined
      ? undefined
      : keyTransport(server)
  return (
    unsafe ?? { server, ...(apiKey === undefined ? {} : { apiKey }), ...bypass }
  )
}

async function runStatus(args: CliArgs, env: Env): Promise<number> {
  const connection = await statusConnection(args, env)
  if (args.target === undefined || typeof connection === 'string') {
    refuse(
      'upload',
      '',
      typeof connection === 'string'
        ? connection
        : 'upload status needs an upload id',
    )
    return EXIT_USAGE
  }
  return await runConnectedStatus(connection, args.target)
}

async function sendUpload(options: UploadOptions): Promise<number> {
  try {
    await uploadShardfile(options)
    return EXIT_OK
  } catch (error: unknown) {
    refuse('upload', 'upload failed: ', error)
    return EXIT_FAILED
  }
}

async function runUpload(
  args: CliArgs,
  env: Env,
  uploader: Uploader,
): Promise<number> {
  if (args.operand === 'status') {
    return await runStatus(args, env)
  }
  const options = await uploadOptions(args, env, uploader)
  if (typeof options === 'string') {
    refuse('upload', '', options)
    return EXIT_USAGE
  }
  return await sendUpload(options)
}

export { runUpload }
