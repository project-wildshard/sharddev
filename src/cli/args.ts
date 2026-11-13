import { parseArgs } from 'node:util'

// The sharddev CLI's arguments. `--version` prints sharddev's version,
// except after the `upload` command, where it is the shard version
// (API-CLOUDFLARE AC16). `--channel` is the upload's channel (J301).

interface CliArgs {
  readonly command: string | undefined
  readonly channel: string | undefined
  readonly commit: string | undefined
  readonly shardVersion: string | undefined
  readonly operand: string | undefined
  readonly help: boolean
  readonly level: string | undefined
  readonly out: string | undefined
  readonly port: string | undefined
  readonly server: string | undefined
  readonly version: boolean
}

const FIRST = 0

const OPTIONS = {
  channel: { type: 'string' },
  commit: { type: 'string' },
  help: { type: 'boolean', default: false },
  level: { type: 'string' },
  out: { type: 'string' },
  port: { type: 'string' },
  server: { type: 'string' },
} as const

/**
 * Whether `--version` is the shard version (API-CLOUDFLARE AC16): only
 * after an `upload` command. Before any command it prints sharddev's.
 */
function shardVersionFlag(argv: readonly string[]): boolean {
  const { tokens } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: false,
    tokens: true,
    options: { ...OPTIONS, version: { type: 'boolean' } },
  })
  const command = tokens.find(
    (token: Readonly<{ kind: string }>): boolean => token.kind === 'positional',
  )
  return (
    command?.kind === 'positional' &&
    command.value === 'upload' &&
    !argv.slice(FIRST, command.index).includes('--version')
  )
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  const upload = shardVersionFlag(argv)
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      ...OPTIONS,
      version: upload ? { type: 'string' } : { type: 'boolean' },
    },
  })
  const [command, operand] = positionals
  const { version } = values
  return {
    command,
    operand,
    channel: values.channel,
    commit: values.commit,
    shardVersion: typeof version === 'string' ? version : undefined,
    help: values.help,
    level: values.level,
    out: values.out,
    port: values.port,
    server: values.server,
    version: version === true,
  }
}

export { type CliArgs, parseCliArgs }
