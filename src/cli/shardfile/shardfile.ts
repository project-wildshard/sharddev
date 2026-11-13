import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { installFormatHook } from '@wildshard/format/formatHook'

import { audioLines } from '../audio/audio.ts'
import { assertHeroCurrent } from '../hero/hero.ts'
import { validateShardfile } from '../upload/validate.ts'

// The shard file (C0, J137): `wildshard build` (SHARD-AUTHORING SA3, J170)
// turns the shard file folder it built into the one tarball `api-server`
// takes, so a shard file stands alone. It writes ustar through format's
// `writeTar` and runs format's validator on the tarball itself, the check the
// server runs at commit: what this writes, the server admits. `wildshard pack`
// is the deprecated alias of this step.
//
// The same folder writes the same bytes, so the same hash, and a re-upload
// sends nothing.

const BYTES_PER_MB = 1_000_000
const ONE_DECIMAL = 1
// The cap in api-server's D31, on a shardfile stored or decoded. J137 raises
// it only if a real shard needs it, so going over is news and not a refusal:
// the server's cap is the one that counts.
const SERVER_CAP_BYTES = 450_000_000

/** What `readdir` says about one entry. */
interface ProductEntry {
  readonly name: string
  readonly parentPath: string
  readonly isDirectory: () => boolean
  readonly isFile: () => boolean
  readonly isSymbolicLink: () => boolean
}

interface ShardfileOptions {
  /** The built shard file folder: `shard.json` at its root. */
  readonly dir: string
  /** Where the shard file goes; `<slug>.shardfile` beside the folder if unset. */
  readonly out?: string
  /** The shard source the hero check reads; `<root>/src/shards/<name>` for `<root>/out/<name>` if unset. */
  readonly source?: string
  /** Receives one line per step. */
  readonly report: (line: string) => void
}

interface Tarball {
  readonly tarball: Uint8Array<ArrayBuffer>
  readonly fileCount: number
}

interface ShardfileOutcome {
  readonly slug: string
  readonly file: string
  readonly hash: string
  readonly bytes: number
}

function sha256(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function mb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(ONE_DECIMAL)} MB`
}

// A cook pack repeats files that ship at their own paths: format rebuilds and
// checks it from them, so a shard file leaves it out (C0). 109 MB of Pine Hollow.
const PACKS = 'blobs/pack/'

function productPath(root: string, entry: ProductEntry): string {
  const file = path.join(entry.parentPath, entry.name)
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`not a regular file: ${file}`)
  }
  return path.relative(root, file).split(path.sep).join('/')
}

/** Every file in the product by `/`-separated path; a link is refused. */
async function readProduct(
  root: string,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const paths = entries
    .filter((entry: ProductEntry): boolean => !entry.isDirectory())
    .map((entry: ProductEntry): string => productPath(root, entry))
    .filter((file: string): boolean => !file.startsWith(PACKS))
  const pairs = await Promise.all(
    paths.map(async (file: string): Promise<readonly [string, Uint8Array]> => {
      const bytes = await readFile(path.join(root, file))
      return [
        file,
        new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length),
      ]
    }),
  )
  return new Map(pairs)
}

async function tarOf(dir: string): Promise<Tarball> {
  installFormatHook()
  const { writeTar } = await import('@wildshard/format/tar')
  const files = await readProduct(dir)
  return { tarball: writeTar(files), fileCount: files.size }
}

function reportOverCap(options: ShardfileOptions, bytes: number): void {
  if (bytes > SERVER_CAP_BYTES) {
    options.report(
      `warning: ${mb(bytes)} is over api-server's ${mb(SERVER_CAP_BYTES)} cap (its D34)`,
    )
  }
}

/** Never leaves half a tarball under the final name. */
async function writeAtomically(
  file: string,
  bytes: Readonly<Uint8Array>,
): Promise<void> {
  const partial = `${file}.${randomUUID()}.partial`
  try {
    await writeFile(partial, bytes)
    await rename(partial, file)
  } finally {
    await rm(partial, { force: true })
  }
}

/** Check the hero is as new as the content, tar the folder, check the tarball. */
async function checkedTarball(
  options: ShardfileOptions,
): Promise<Readonly<{ tarball: Uint8Array<ArrayBuffer>; slug: string }>> {
  await assertHeroCurrent(options.dir, options.report, options.source)
  const { tarball, fileCount } = await tarOf(options.dir)
  const { slug, name, audio } = await validateShardfile(tarball)
  options.report(`valid: ${slug} (${name}), ${String(fileCount)} files`)
  // AUDIO AU5: build prints the audio rules as AMBER and still writes the
  // shard file; only upload and api-server's admission refuse a red.
  for (const line of await audioLines(audio)) {
    options.report(line)
  }
  reportOverCap(options, tarball.length)
  return { tarball, slug }
}

/** The shard file's default name: `<slug>.shardfile` beside its folder (SA3). */
function shardfilePath(dir: string, slug: string): string {
  return path.join(path.dirname(path.resolve(dir)), `${slug}.shardfile`)
}

/** Check the folder, then write its shard file; a refusal writes none. */
async function writeShardfile(
  options: ShardfileOptions,
): Promise<ShardfileOutcome> {
  const { tarball, slug } = await checkedTarball(options)
  const bytes = tarball.length
  const file = options.out ?? shardfilePath(options.dir, slug)
  const hash = sha256(tarball)
  await writeAtomically(file, tarball)
  options.report(`shard file: ${file}, ${mb(bytes)} (${hash})`)
  return { slug, file, hash, bytes }
}

export {
  type ShardfileOptions,
  type ShardfileOutcome,
  shardfilePath,
  writeShardfile,
}
