import { refusalCode, refusalHint, refusalNote } from '../sharddev/refusals.ts'

import type { RefusalStep } from '../sharddev/refusals.ts'

/** One line of a command's report on stdout. */
function reportLine(line: string): void {
  process.stdout.write(`${line}\n`)
}

/** A refusal on stderr, then its rule, fix and GUIDE.md link (SA21). `refusal` is the words, or the error: its message,
 * and its shard-format code names the rule when it has one (SA41). */
function refuse(step: RefusalStep, prefix: string, refusal: unknown): void {
  const reason = refusal instanceof Error ? refusal.message : String(refusal)
  const hint = refusalHint(
    refusalNote(step, reason, { code: refusalCode(refusal) }),
  )
  process.stderr.write(`sharddev: ${prefix}${reason}\n  ${hint}\n`)
}

export { refuse, reportLine }
