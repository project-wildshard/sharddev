import { refuse, reportLine } from '../report.ts'
import { writeShardfile } from './shardfile.ts'

// `wildshard build <folder> [file]` and `wildshard pack`, its deprecated
// alias (SHARD-AUTHORING SA3, J170): an author build writes its shard file
// itself; these write the shard file of a folder already built.

const EXIT_OK = 0
const EXIT_USAGE = 1
const EXIT_FAILED = 3
// Refusals name the shard file step's rules, whichever verb ran it.
const STEP = 'shardfile'

const PACK_DEPRECATED =
  'sharddev: pack is deprecated: `wildshard build` writes the shard file (`wildshard build <folder> [file]` for a built folder)\n'

/** Write a built folder's shard file, to `out` or beside the folder. */
async function runShardfile(
  step: 'build' | 'pack',
  dir: string | undefined,
  out: string | undefined,
): Promise<number> {
  if (dir === undefined) {
    refuse(STEP, '', `${step} needs a shard file folder`)
    return EXIT_USAGE
  }
  try {
    await writeShardfile({
      dir,
      report: reportLine,
      ...(out === undefined ? {} : { out }),
    })
    return EXIT_OK
  } catch (error: unknown) {
    refuse(STEP, `${step} failed: `, error)
    return EXIT_FAILED
  }
}

/** `pack <folder> [--out <file>]`: one line naming `build`, then the same step. */
async function runPack(
  dir: string | undefined,
  out: string | undefined,
): Promise<number> {
  process.stderr.write(PACK_DEPRECATED)
  return await runShardfile('pack', dir, out)
}

export { runPack, runShardfile }
