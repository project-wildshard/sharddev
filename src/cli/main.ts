#!/usr/bin/env node

import {
  runAccount,
  runDelete,
  runWhoami,
} from '../../packages/upload/src/cli/account/command.ts'
import { parseCliArgs } from '../../packages/upload/src/cli/args.ts'
import {
  runPack,
  runShardfile,
} from '../../packages/upload/src/cli/shardfile/command.ts'
import { runUpload } from '../../packages/upload/src/cli/upload/command.ts'
import { serve } from '../server/serve.ts'
import { USAGE, verbHelp } from './help.ts'
import { readVersion, readVersionChain } from './version.ts'

import type { CliArgs } from '../../packages/upload/src/cli/args.ts'

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_CRASH = 2

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

function serverOf(args: CliArgs): string {
  return args.server ?? ENV['WILDSHARD_API_URL'] ?? ''
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
  upload: async (args: CliArgs): Promise<number> =>
    await runUpload(args, ENV, await readVersion()),
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
