import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { installFormatHook } from '@wildshard/format/formatHook'

import { makeTar } from './tar.ts'

// Test shardfiles: Template 2 as the format pin ships it, re-stamped with a
// slug, name and seed, its source hash recomputed with format's own functions
// so the real validator admits it. `seed` varies the bytes (and so the hash)
// of a revision. `shardfileFiles` is a draft (sdk 0.2), as `wildshard build`
// writes it; `makeShardfile` is prepared (sdk 0.3), as upload sends it (J198).

const TEMPLATE_2 = fileURLToPath(
  new URL(
    '../../../node_modules/@wildshard/format/corpus/handwritten',
    import.meta.url,
  ),
)
const INDEX = 'shard.json'
const DEFAULT_SEED = 0

interface ShardfileOptions {
  readonly slug: string
  readonly name?: string
  readonly seed?: number
  /** `makeShardfile` only: the draft as built, which upload refuses. */
  readonly draft?: boolean
}

interface ProductEntry {
  readonly name: string
  readonly parentPath: string
  readonly isFile: () => boolean
}

type ProductFiles = Map<string, Uint8Array | string>

function sha256(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function templateFiles(): Promise<ProductFiles> {
  const entries = await readdir(TEMPLATE_2, {
    recursive: true,
    withFileTypes: true,
  })
  const pairs = await Promise.all(
    entries
      .filter((entry: ProductEntry): boolean => entry.isFile())
      .map(
        async (entry: ProductEntry): Promise<readonly [string, Uint8Array]> => {
          const file = path.join(entry.parentPath, entry.name)
          const relative = path.relative(TEMPLATE_2, file).split(path.sep)
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
  const files = await templateFiles()
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

// J198 for tests: a built folder as `wildshard prepare` leaves it (sdk 0.3,
// a version 3 cook), from a fixture recording instead of phone WebKit, the
// same recording src/ci/cook-preparation.test.ts uses. Upload refuses a
// draft (sdk 0.2), so every fixture an upload sends is prepared first.
const RECORDING = {
  renderer: '1'.repeat(64),
  reads: [],
  programs: {
    version: 2,
    build: 'wire-fixture-only',
    lines: ['void main() {}'],
    shaders: [[0]],
    programs: [[0, 0]],
  },
}

/** Prepare the built folder `dir` in place. */
async function prepareFolder(dir: string): Promise<void> {
  installFormatHook()
  const { finishPreparation } =
    await import('../../../scripts/prepare-product.mjs')
  const header = await readFile(path.join(dir, INDEX))
  await finishPreparation(
    dir,
    { ...RECORDING, headerHash: sha256(header) },
    header,
  )
}

/** Every file in the folder `dir`, by `/`-separated path. */
async function folderFiles(dir: string): Promise<Map<string, Uint8Array>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const names = entries
    .filter((entry: Readonly<Dirent>): boolean => entry.isFile())
    .map((entry: Readonly<Dirent>): string =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    )
  const pairs = await Promise.all(
    names.map(async (name: string): Promise<readonly [string, Uint8Array]> => [
      name,
      new Uint8Array(await readFile(path.join(dir, name))),
    ]),
  )
  return new Map(pairs)
}

/** `files` (a draft folder's) as they are once prepared. */
async function preparedFiles(
  files: ProductFiles,
): Promise<Map<string, Uint8Array>> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sharddev-prepared-'))
  try {
    await Promise.all(
      [...files].map(
        async ([name, bytes]: readonly [
          string,
          Readonly<Uint8Array> | string,
        ]): Promise<void> => {
          const file = path.join(dir, name)
          await mkdir(path.dirname(file), { recursive: true })
          await writeFile(file, bytes)
        },
      ),
    )
    await prepareFolder(dir)
    return await folderFiles(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function makeShardfile(options: ShardfileOptions): Promise<Uint8Array> {
  const files = await shardfileFiles(options)
  return makeTar(options.draft === true ? files : await preparedFiles(files))
}

export {
  type ShardfileOptions,
  folderFiles,
  makeShardfile,
  prepareFolder,
  preparedFiles,
  sha256,
  shardfileFiles,
}
