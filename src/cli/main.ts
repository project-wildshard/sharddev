#!/usr/bin/env node

import { serve } from '../server/serve.ts'
import {
  apiKeyOf,
  runAccount,
  runDelete,
  runWhoami,
  uploadKeyRefusal,
} from './account/command.ts'
import { parseCliArgs } from './args.ts'
import { USAGE, verbHelp } from './help.ts'
import { refuse, reportLine } from './report.ts'
import { runPack, runShardfile } from './shardfile/command.ts'
import {
  DEFAULT_BROTLI_LEVEL,
  MAX_BROTLI_LEVEL,
  MIN_BROTLI_LEVEL,
} from './upload/compress.ts'
import { resolveProvenance } from './upload/provenance.ts'
import { uploadShardfile } from './upload/upload.ts'
import { readVersion, readVersionChain } from './version.ts'

import type { CliArgs } from './args.ts'
import type { Provenance } from './upload/provenance.ts'
import type { UploadOptions } from './upload/upload.ts'

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_CRASH = 2
const EXIT_FAILED = 3

// Arguments start after [node, script] in process.argv.
const FIRST_CLI_ARG = 2

const DEFAULT_PORT = 4403
const MIN_PORT = 0
const MAX_PORT = 65_535

// The CLI is the one place that reads the environment; it hands it on.
// oxlint-disable-next-line node/no-process-env -- the CLI is the env boundary
const ENV: Readonly<Record<string, string | undefined>> = process.env

function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return DEFAULT_PORT
  }
  const port = Number(raw)
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT
    ? port
    : undefined
}

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

async function runServe(rawPort: string | undefined): Promise<number> {
  const port = parsePort(rawPort)
  if (port === undefined) {
    process.stderr.write(`sharddev: invalid --port ${String(rawPort)}\n`)
    return EXIT_USAGE
  }
  const server = await serve({ port, version: await readVersion() })
  process.stdout.write(`sharddev serving on ${server.url}\n`)
  return EXIT_OK
}

function bypassOption(): { readonly bypassSecret?: string } {
  const bypassSecret = ENV['VERCEL_AUTOMATION_BYPASS_SECRET'] ?? ''
  return bypassSecret === '' ? {} : { bypassSecret }
}

/** The shard version and commit to send, or what is wrong (AC16). */
async function provenanceOf(args: CliArgs): Promise<Provenance | string> {
  try {
    const provenance = await resolveProvenance({
      cwd: process.cwd(),
      version: args.shardVersion,
      commit: args.commit,
    })
    reportLine(
      `shard source version ${provenance.version}, commit ${provenance.commit}`,
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

type Connection = Omit<UploadOptions, keyof Provenance | 'file' | 'channel'>

/** `--server`, else WILDSHARD_API_URL, else empty. */
function serverOf(args: CliArgs): string {
  return args.server ?? ENV['WILDSHARD_API_URL'] ?? ''
}

/** What stops upload before any request: the server, or either key. */
function credentialsRefusal(
  server: string,
  privateKey: string,
  apiKey: string | undefined,
): string | undefined {
  if (server === '' || privateKey === '') {
    return 'upload needs --server (or WILDSHARD_API_URL) and WILDSHARD_CREATOR_PRIVATE_KEY'
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
): Connection | string {
  const level = parseLevel(args.level)
  const server = serverOf(args)
  const privateKey = ENV['WILDSHARD_CREATOR_PRIVATE_KEY'] ?? ''
  if (level === undefined) {
    return `invalid --level ${String(args.level)}`
  }
  const refusal = credentialsRefusal(server, privateKey, apiKey)
  if (refusal !== undefined || apiKey === undefined) {
    return refusal ?? ''
  }
  return {
    server,
    apiKey,
    privateKey,
    level,
    report: reportLine,
    ...bypassOption(),
  }
}

/** Everything but the provenance, or what is wrong. */
function uploadSettings(
  args: CliArgs,
  apiKey: string | undefined,
): Omit<UploadOptions, keyof Provenance> | string {
  const channel = channelOf(args.channel)
  if (args.operand === undefined) {
    return 'upload needs a shard file'
  }
  if (channel === undefined) {
    return channelRefusal(args.channel)
  }
  const connection = connectionOf(args, apiKey)
  return typeof connection === 'string'
    ? connection
    : { file: args.operand, channel, ...connection }
}

/** The upload's settings from flags and environment, or what is wrong. */
async function uploadOptions(args: CliArgs): Promise<UploadOptions | string> {
  const apiKey = await apiKeyOf(ENV['WILDSHARD_API_KEY'])
  if (apiKey instanceof Error) {
    return apiKey.message
  }
  const settings = uploadSettings(args, apiKey)
  if (typeof settings === 'string') {
    return settings
  }
  const provenance = await provenanceOf(args)
  return typeof provenance === 'string'
    ? provenance
    : { ...settings, ...provenance }
}

async function runUpload(args: CliArgs): Promise<number> {
  const options = await uploadOptions(args)
  if (typeof options === 'string') {
    refuse('upload', '', options)
    return EXIT_USAGE
  }
  try {
    await uploadShardfile(options)
    return EXIT_OK
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    refuse('upload', 'upload failed: ', reason)
    return EXIT_FAILED
  }
}

async function printVersion(): Promise<number> {
  const chain = await readVersionChain()
  process.stdout.write(`${chain.join('\n')}\n`)
  return EXIT_OK
}

function printUsage(code: number): number {
  process.stdout.write(USAGE)
  return code
}

/** `--help`: the command's own help, or all of it. */
function printHelp(command: string | undefined): number {
  process.stdout.write(
    (command === undefined ? undefined : verbHelp(command)) ?? USAGE,
  )
  return EXIT_OK
}

/** The commands this program runs; the author commands run in src/sharddev/cli.ts. */
const COMMANDS: Readonly<Record<string, (args: CliArgs) => Promise<number>>> = {
  serve: async (args: CliArgs): Promise<number> => await runServe(args.port),
  // SA3: a built shard file folder; bin/wildshard.mjs sends a project to the author CLI.
  build: async (args: CliArgs): Promise<number> =>
    await runShardfile('build', args.operand, args.target ?? args.out),
  pack: async (args: CliArgs): Promise<number> =>
    await runPack(args.operand, args.out ?? args.target),
  upload: runUpload,
  // Meta SHARD-DELETE DEL6: the account key upload sends.
  account: async (args: CliArgs): Promise<number> =>
    await runAccount(args, serverOf(args)),
  whoami: async (args: CliArgs): Promise<number> =>
    await runWhoami(ENV['WILDSHARD_API_KEY'], serverOf(args)),
  // Meta SHARD-DELETE DEL10: the owner deletes with the same key.
  delete: async (args: CliArgs): Promise<number> =>
    await runDelete({
      args,
      server: serverOf(args),
      fromEnv: ENV['WILDSHARD_API_KEY'],
    }),
}

async function runCommand(args: CliArgs): Promise<number> {
  if (args.command === undefined) {
    return printUsage(EXIT_USAGE)
  }
  const run = Object.hasOwn(COMMANDS, args.command)
    ? COMMANDS[args.command]
    : undefined
  if (run !== undefined) {
    return await run(args)
  }
  process.stderr.write(`sharddev: unknown command ${args.command}\n\n${USAGE}`)
  return EXIT_USAGE
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseCliArgs(argv)
  if (args.version) {
    return await printVersion()
  }
  if (args.help) {
    return printHelp(args.command)
  }
  return await runCommand(args)
}

try {
  process.exitCode = await main(process.argv.slice(FIRST_CLI_ARG))
} catch (error: unknown) {
  process.stderr.write(`sharddev: ${String(error)}\n`)
  process.exitCode = EXIT_CRASH
}
