/* eslint-disable no-magic-numbers */
import { formatContent, readContent } from './content.ts'

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_ERROR = 2
const EXIT_FAILED = 3
const [dir, ...options] = process.argv.slice(2)
const flags: { bar?: string; unknown?: string } = {}
for (let index = 0; index < options.length; index += 1) {
  const option = options[index]
  if (option === '--bar') {
    index += 1
    flags.bar = options[index] ?? ''
  } else if (option?.startsWith('--bar=') === true) {
    flags.bar = option.slice('--bar='.length)
  } else {
    flags.unknown = option ?? ''
  }
}

const { bar, unknown } = flags

if (dir === undefined) {
  process.stderr.write('wildshard: content needs a built shard directory\n')
  process.exitCode = EXIT_USAGE
} else if (
  unknown !== undefined ||
  (bar !== undefined && bar !== 'templates')
) {
  process.stderr.write(
    `wildshard: content does not know ${unknown ?? `--bar=${bar}`}\n`,
  )
  process.exitCode = EXIT_USAGE
} else {
  try {
    const report = readContent(dir, bar)
    process.stdout.write(formatContent(report, bar))
    process.exitCode = report.short.length === 0 ? EXIT_OK : EXIT_FAILED
  } catch (error: unknown) {
    process.stderr.write(`wildshard: content failed: ${String(error)}\n`)
    process.exitCode = EXIT_ERROR
  }
}
