import { refusalHint, refusalNote } from '../sharddev/refusals.ts'

import type { RefusalStep } from '../sharddev/refusals.ts'

/** One line of a command's report on stdout. */
function reportLine(line: string): void {
  process.stdout.write(`${line}\n`)
}

/** A refusal on stderr, then its rule, fix and GUIDE.md link (SA21). */
function refuse(step: RefusalStep, prefix: string, reason: string): void {
  const hint = refusalHint(refusalNote(step, reason))
  process.stderr.write(`sharddev: ${prefix}${reason}\n  ${hint}\n`)
}

export { refuse, reportLine }
