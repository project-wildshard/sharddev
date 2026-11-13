#!/usr/bin/env node

import { serve } from '../server/serve.ts'
import { parseCliArgs } from './args.ts'
import { packProduct } from './pack/pack.ts'
import {
  DEFAULT_BROTLI_LEVEL,
  MAX_BROTLI_LEVEL,
  MIN_BROTLI_LEVEL,
} from './upload/compress.ts'
import { resolveProvenance } from './upload/provenance.ts'
import { uploadShardfile } from './upload/upload.ts'
import { readVersion } from './version.ts'

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

const USAGE = `Usage: sharddev <command> [options]

Commands:
  serve [--port <n>]   Start the sharddev server on localhost
  prepare <product> --base <exact-preview-url>
                       Record the exact candidate in phone WebKit, compute
                       required cook lists and validate the prepared output
  pack <product> [--out <file>]
                       Tar a built product folder into a shardfile and check
                       it as api-server will. Writes <slug>.tar by default.
                       Refuses a shard whose captured hero is older than its
                       content (src/shards/<name>/hero.json)
  hero <shard-dir> --base <served-build-url>
                       Capture the shard's hero (thumb, portrait, landscape)
                       in headless Chromium from a served build of this
                       candidate, and stamp hero.json with its content
  hero <shard-dir> --stamp-existing
                       No capture: stamp the hero images already in the
                       shard as current. WARNING: use it ONLY when those
                       images show the current content; a wrong stamp
                       hides a stale hero from the cut
  upload <shardfile> [--server <url>] [--level <n>]
         [--version <X.Y.Z>] [--commit <sha>]
                       Check a shardfile tarball, compress it (Brotli level
                       <n>, default ${String(DEFAULT_BROTLI_LEVEL)}), sign it and upload it to
                       api-server with its shard version (default: the
                       shard project's package.json version) and commit
                       (default: git HEAD of a clean tree). Prints the
                       API's version, formatVersion and migrations. Reads
                       WILDSHARD_API_URL when --server is absent,
                       WILDSHARD_CREATOR_PRIVATE_KEY, and
                       VERCEL_AUTOMATION_BYPASS_SECRET for a protected preview

Options:
  --version            Print the version (after upload: the shard version)
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

function reportLine(line: string): void {
  process.stdout.write(`${line}\n`)
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

/** Everything but the shard version and commit, or what is wrong. */
function uploadSettings(
  args: CliArgs,
): Omit<UploadOptions, keyof Provenance> | string {
  const level = parseLevel(args.level)
  const server = args.server ?? ENV['WILDSHARD_API_URL'] ?? ''
  const privateKey = ENV['WILDSHARD_CREATOR_PRIVATE_KEY'] ?? ''
  if (args.operand === undefined) {
    return 'upload needs a shardfile'
  }
  if (level === undefined) {
    return `invalid --level ${String(args.level)}`
  }
  if (server === '' || privateKey === '') {
    return 'upload needs --server (or WILDSHARD_API_URL) and WILDSHARD_CREATOR_PRIVATE_KEY'
  }
  return {
    file: args.operand,
    server,
    privateKey,
    level,
    report: reportLine,
    ...bypassOption(),
  }
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
    process.stderr.write(`sharddev: ${options}\n`)
    return EXIT_USAGE
  }
  try {
    await uploadShardfile(options)
    return EXIT_OK
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    process.stderr.write(`sharddev: upload failed: ${reason}\n`)
    return EXIT_FAILED
  }
}

async function runPack(args: CliArgs): Promise<number> {
  if (args.operand === undefined) {
    process.stderr.write('sharddev: pack needs a product folder\n')
    return EXIT_USAGE
  }
  try {
    await packProduct({
      dir: args.operand,
      report: reportLine,
      ...(args.out === undefined ? {} : { out: args.out }),
    })
    return EXIT_OK
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    process.stderr.write(`sharddev: pack failed: ${reason}\n`)
    return EXIT_FAILED
  }
}

async function printVersion(): Promise<number> {
  process.stdout.write(`${await readVersion()}\n`)
  return EXIT_OK
}

function printUsage(code: number): number {
  process.stdout.write(USAGE)
  return code
}

async function runCommand(args: CliArgs): Promise<number> {
  if (args.command === undefined) {
    return printUsage(EXIT_USAGE)
  }
  if (args.command === 'serve') {
    return await runServe(args.port)
  }
  if (args.command === 'pack') {
    return await runPack(args)
  }
  if (args.command === 'upload') {
    return await runUpload(args)
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
