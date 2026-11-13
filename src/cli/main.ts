#!/usr/bin/env node

import { serve } from '../server/serve.ts'
import { parseCliArgs } from './args.ts'
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
import type { Channel } from './upload/api.ts'
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

const USAGE = `Usage: sharddev <command> [options]

Commands:
  check <project> [output] [--json]
                       Lint, build, validate, prove (with the project's
                       proof.json) and read the report card, then give one
                       verdict. --json prints only the verdict document:
                       { version, verdict, project, output, ms, steps:
                       [{ name, status, ms, note? }], refusals: [{ step,
                       rule, message, fix, guide, file? }] }. Every
                       refusal names its rule, a fix and its GUIDE.md
                       section. Exits 1 on fail
  serve [--port <n>]   Start the sharddev server on localhost
  prepare <product> --base <exact-preview-url>
                       Record the exact candidate in phone WebKit, compute
                       required cook lists and validate the prepared output
  build <project> [folder] [--shardfile-only | --folder-only]
                       Build the shard file folder (default
                       <project>/public/shardfiles/<slug>), then write the
                       shard file <slug>.shardfile beside it and check it as
                       api-server will: refuses a shard whose captured hero
                       is older than its content (src/shards/<name>/hero.json)
                       and prints the audio rules. --shardfile-only skips the
                       client; --folder-only (old name --product-only)
                       also skips the shard file
  build <folder> [file]
                       Write the shard file of a built shard file folder
                       (default <slug>.shardfile beside it), with the same
                       checks
  pack <folder> [--out <file>]
                       Deprecated: wildshard build <folder> [file]
  hero <shard-dir> --base <served-build-url>
                       Capture the shard's hero (thumb, portrait, landscape)
                       in headless Chromium from a served build of this
                       candidate, and stamp hero.json with its content
  hero <shard-dir> --stamp-existing
                       No capture: stamp the hero images already in the
                       shard as current. WARNING: use it ONLY when those
                       images show the current content; a wrong stamp
                       hides a stale hero from the cut
  upload <shard file> --channel staging|prod [--server <url>]
         [--level <n>] [--version <X.Y.Z>] [--commit <sha>]
                       Check a shard file, compress it (Brotli level
                       <n>, default ${String(DEFAULT_BROTLI_LEVEL)}), sign it and upload it to
                       api-server for the channel it names (required; prod
                       is production) with its shard version (default: the
                       shard project's package.json version), commit
                       (default: git HEAD of a clean tree) and the
                       sharddev, engine and shard-format versions it was
                       built with. Refuses a hero unchanged since the
                       slug's newest version (run hero first). Prints the
                       API's version, formatVersion and migrations. Reads
                       WILDSHARD_API_URL when --server is absent,
                       WILDSHARD_CREATOR_PRIVATE_KEY, and
                       VERCEL_AUTOMATION_BYPASS_SECRET for a protected preview

Options:
  --version            Print the sdk, engine, shard-format and three
                       versions (after upload: the shard version)
  --help               Print this help

Also installed as \`wildshard\`.
`

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
      `shard version ${provenance.version}, commit ${provenance.commit}`,
    )
    return provenance
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** `--channel`'s wire name (J301): `prod` is the channel `production`. */
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

/** The level, server and key, or what is wrong. */
function connectionOf(args: CliArgs): Connection | string {
  const level = parseLevel(args.level)
  const server = args.server ?? ENV['WILDSHARD_API_URL'] ?? ''
  const privateKey = ENV['WILDSHARD_CREATOR_PRIVATE_KEY'] ?? ''
  if (level === undefined) {
    return `invalid --level ${String(args.level)}`
  }
  if (server === '' || privateKey === '') {
    return 'upload needs --server (or WILDSHARD_API_URL) and WILDSHARD_CREATOR_PRIVATE_KEY'
  }
  return { server, privateKey, level, report: reportLine, ...bypassOption() }
}

/** Everything but the provenance, or what is wrong. */
function uploadSettings(
  args: CliArgs,
): Omit<UploadOptions, keyof Provenance> | string {
  const channel = channelOf(args.channel)
  if (args.operand === undefined) {
    return 'upload needs a shardfile'
  }
  if (channel === undefined) {
    return channelRefusal(args.channel)
  }
  const connection = connectionOf(args)
  return typeof connection === 'string'
    ? connection
    : { file: args.operand, channel, ...connection }
}

/** The upload's settings from flags and environment, or what is wrong. */
async function uploadOptions(args: CliArgs): Promise<UploadOptions | string> {
  const settings = uploadSettings(args)
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

/** The commands this program runs; the author commands run in src/sharddev/cli.ts. */
const COMMANDS: Readonly<Record<string, (args: CliArgs) => Promise<number>>> = {
  serve: async (args: CliArgs): Promise<number> => await runServe(args.port),
  // SA3: a built shard file folder; bin/wildshard.mjs sends a project to the author CLI.
  build: async (args: CliArgs): Promise<number> =>
    await runShardfile('build', args.operand, args.target ?? args.out),
  pack: async (args: CliArgs): Promise<number> =>
    await runPack(args.operand, args.out ?? args.target),
  upload: runUpload,
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
    return printUsage(EXIT_OK)
  }
  return await runCommand(args)
}

try {
  process.exitCode = await main(process.argv.slice(FIRST_CLI_ARG))
} catch (error: unknown) {
  process.stderr.write(`sharddev: ${String(error)}\n`)
  process.exitCode = EXIT_CRASH
}
