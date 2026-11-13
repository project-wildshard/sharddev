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
  /** The second operand: `build <folder> [file]`'s shard file (SA3). */
  readonly target: string | undefined
  readonly help: boolean
  /** `account`: replace a key file that is there already. */
  readonly force: boolean
  readonly level: string | undefined
  /** `upload --no-place` (SA32): take no grid cell. */
  readonly noPlace: boolean
  readonly out: string | undefined
  readonly port: string | undefined
  readonly server: string | undefined
  readonly version: boolean
  /** `delete`: skip the typed slug, for scripts (meta SHARD-DELETE DEL10). */
  readonly yes: boolean
}

const FIRST = 0

const OPTIONS = {
  channel: { type: 'string' },
  commit: { type: 'string' },
  force: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
  level: { type: 'string' },
  'no-place': { type: 'boolean', default: false },
  out: { type: 'string' },
  port: { type: 'string' },
  server: { type: 'string' },
  yes: { type: 'boolean', default: false },
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
  const [command, operand, target] = positionals
  const { version } = values
  return {
    command,
    operand,
    target,
    channel: values.channel,
    commit: values.commit,
    shardVersion: typeof version === 'string' ? version : undefined,
    help: values.help,
    force: values.force,
    level: values.level,
    noPlace: values['no-place'],
    out: values.out,
    port: values.port,
    server: values.server,
    version: version === true,
    yes: values.yes,
  }
}

export { type CliArgs, parseCliArgs }
