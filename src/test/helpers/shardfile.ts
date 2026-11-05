import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { installFormatHook } from '@wildshard/format/formatHook'

import { makeTar } from './tar.ts'

// Test shardfiles: the real built product in `src/test/fixtures/product`
// (copied from shardfile v0.1.0's cli-fixture), re-stamped with a slug,
// name and seed, its source hash recomputed with format's own functions
// so the real validator admits it. `seed` varies the bytes (and so the
// hash) of a revision.

const FIXTURE = fileURLToPath(new URL('../fixtures/product', import.meta.url))
const INDEX = 'shard.json'
const DEFAULT_SEED = 0

interface ShardfileOptions {
  readonly slug: string
  readonly name?: string
  readonly seed?: number
}

interface FixtureEntry {
  readonly name: string
  readonly parentPath: string
  readonly isFile: () => boolean
}

type ProductFiles = Map<string, Uint8Array | string>

function sha256(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function fixtureFiles(): Promise<ProductFiles> {
  const entries = await readdir(FIXTURE, {
    recursive: true,
    withFileTypes: true,
  })
  const pairs = await Promise.all(
    entries
      .filter((entry: FixtureEntry): boolean => entry.isFile())
      .map(
        async (entry: FixtureEntry): Promise<readonly [string, Uint8Array]> => {
          const file = path.join(entry.parentPath, entry.name)
          const relative = path.relative(FIXTURE, file).split(path.sep)
          return [relative.join('/'), new Uint8Array(await readFile(file))]
        },
      ),
  )
  return new Map(pairs)
}

function jsonOf(files: ProductFiles, file: string): unknown {
  const bytes = Buffer.from(files.get(file) ?? '')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  return value
}

function sectionsOf(
  files: ProductFiles,
  sections: readonly Readonly<{ name: string; path: string }>[],
): ReadonlyMap<string, unknown> {
  return new Map(
    sections.map(
      (
        section: Readonly<{ name: string; path: string }>,
      ): readonly [string, unknown] => [
        section.name,
        jsonOf(files, section.path),
      ],
    ),
  )
}

/** The files of a valid shardfile, before it is tarred. */
async function shardfileFiles(
  options: ShardfileOptions,
): Promise<ProductFiles> {
  installFormatHook()
  const { assembleOutputShardfile, parseOutputIndex } =
    await import('@wildshard/format/outputIndex')
  const { validationSourceBytes } =
    await import('@wildshard/format/validationReceipt')
  const files = await fixtureFiles()
  const parsed = parseOutputIndex(jsonOf(files, INDEX))
  const identity = {
    ...parsed.identity,
    slug: options.slug,
    name: options.name ?? `Shard ${options.slug}`,
    seed: options.seed ?? DEFAULT_SEED,
  }
  const shard = assembleOutputShardfile(
    { ...parsed, identity },
    sectionsOf(files, parsed.sections),
  )
  const build = {
    ...parsed.build,
    sourceHash: sha256(validationSourceBytes(shard)),
  }
  files.set(INDEX, validationSourceBytes({ ...parsed, identity, build }))
  return files
}

async function makeShardfile(options: ShardfileOptions): Promise<Uint8Array> {
  return makeTar(await shardfileFiles(options))
}

export { type ShardfileOptions, sha256, shardfileFiles, makeShardfile }
