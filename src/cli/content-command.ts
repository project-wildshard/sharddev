/* eslint-disable no-magic-numbers, typescript/explicit-function-return-type */
import { formatContent, readContent } from './content.ts'

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3
const [dir, ...options] = process.argv.slice(2)
const bar = options
  .find(option => option.startsWith('--bar='))
  ?.slice('--bar='.length)
const unknown = options.find(option => option !== '--bar=templates')

if (dir === undefined) {
  process.stderr.write('sharddev: content needs a built shard directory\n')
  process.exitCode = EXIT_USAGE
} else if (
  unknown !== undefined ||
  (bar !== undefined && bar !== 'templates')
) {
  process.stderr.write(
    `sharddev: content does not know ${unknown ?? `--bar=${bar}`}\n`,
  )
  process.exitCode = EXIT_USAGE
} else {
  try {
    const report = readContent(dir, bar)
    process.stdout.write(formatContent(report, bar))
    process.exitCode = report.short.length === 0 ? EXIT_OK : EXIT_FAILED
  } catch (error: unknown) {
    process.stderr.write(`sharddev: content failed: ${String(error)}\n`)
    process.exitCode = EXIT_FAILED
  }
}
