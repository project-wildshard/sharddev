import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

import { writeLook } from '@wildshard/upload/cli/hero/look.ts'
import { heroState } from '@wildshard/upload/cli/hero/stamp.ts'
import { writeShardfile } from '@wildshard/upload/cli/shardfile/shardfile.ts'

import { CORPUS, shardfileFiles } from './shardfile.ts'

// A shard project for the hero tests (src/cli/hero): `<root>/src/shards/<name>`
// with a card of three image files, and `<root>/out/<name>`, a real product.

const NAME = 'hero-test'
const CARD = {
  thumb: `/src/shards/${NAME}/card/thumb.jpg`,
  portrait: `/src/shards/${NAME}/card/portrait.jpg`,
  landscape: `/src/shards/${NAME}/card/landscape.jpg`,
}
const SVG = 'data:image/svg+xml,%3Csvg%2F%3E'
const BASE = 'http://127.0.0.1:4400'
// Image blobs the test product carries: a built product holds its card files
// as `blobs/image/<sha256>.<ext>`, so the shots are the card the corpus product
// (Brasscap Mesa's export, as the format pin ships it) names in `ui/level`'s
// manifest. Read, never hardcoded: a corpus re-export (format 0.74.0, J506)
// moves the hashes.
async function corpusShots(): Promise<
  Readonly<Record<'thumb' | 'portrait' | 'landscape', string>>
> {
  const level: unknown = JSON.parse(
    await readFile(path.join(CORPUS, 'sections', 'ui', 'level.json'), 'utf8'),
  )
  const manifest: unknown =
    typeof level === 'object' && level !== null
      ? Reflect.get(level, 'manifest')
      : undefined
  const card: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'card')
      : undefined
  const blob = (slot: string): string => {
    const url: unknown =
      typeof card === 'object' && card !== null
        ? Reflect.get(card, slot)
        : undefined
    const blobPath =
      typeof url === 'string'
        ? /\/(?<blob>blobs\/image\/[^/]+)$/u.exec(url)?.groups?.['blob']
        : undefined
    if (blobPath === undefined) {
      throw new Error(`corpus ui/level names no ${slot} card image`)
    }
    return blobPath
  }
  return {
    thumb: blob('thumb'),
    portrait: blob('portrait'),
    landscape: blob('landscape'),
  }
}
const SHOTS: Readonly<Record<'thumb' | 'portrait' | 'landscape', string>> =
  await corpusShots()

interface Project {
  readonly root: string
  readonly shard: string
  readonly product: string
}

/** `<root>/src/shards/<name>`: a manifest, one world file and three shots. */
async function writeShard(
  shard: string,
  product: string,
  card: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(path.join(shard, 'card'), { recursive: true })
  await writeFile(
    path.join(shard, 'manifest.json'),
    JSON.stringify({ slug: NAME, card }),
  )
  await writeFile(path.join(shard, 'world.json'), '{"hut":[0,0,0]}')
  await Promise.all(
    Object.entries(SHOTS).map(
      async ([slot, blob]: readonly [string, string]): Promise<void> => {
        await copyFile(
          path.join(product, blob),
          path.join(shard, 'card', `${slot}.jpg`),
        )
      },
    ),
  )
}

/** `<root>/out/<name>`: a real, valid built product. */
async function writeProduct(product: string): Promise<void> {
  const files = await shardfileFiles({ slug: NAME })
  await Promise.all(
    [...files].map(
      async ([name, bytes]: readonly [
        string,
        Readonly<Uint8Array> | string,
      ]): Promise<void> => {
        const file = path.join(product, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, bytes)
      },
    ),
  )
}

async function project(
  context: TestContext,
  card: Readonly<Record<string, string>> = CARD,
): Promise<Project> {
  const root = await mkdtemp(path.join(tmpdir(), 'sharddev-hero-'))
  context.after(async (): Promise<void> => {
    await rm(root, { recursive: true })
  })
  const shard = path.join(root, 'src', 'shards', NAME)
  const product = path.join(root, 'out', NAME)
  await writeProduct(product)
  await writeShard(shard, product, card)
  return { root, shard, product }
}

/**
 * The built world moved since the hero was stamped (NB10): the stamp's `look`
 * names another product, as a rebuild of changed content would.
 */
async function moveWorld(space: Project): Promise<void> {
  const hero = await heroState(space.shard)
  await writeLook(space.shard, {
    content: hero.stamped ?? '',
    look: 'another-world',
  })
}

async function stateOf(shard: string): Promise<string> {
  const hero = await heroState(shard)
  return hero.state
}

async function cut(
  space: Project,
  stampWrites = true,
): Promise<readonly string[]> {
  const lines: string[] = []
  await writeShardfile({
    dir: space.product,
    out: path.join(space.root, 'shard.tar'),
    stampWrites,
    report: (line: string): void => {
      lines.push(line)
    },
  })
  return lines
}

export {
  type Project,
  BASE,
  NAME,
  SHOTS,
  SVG,
  cut,
  project,
  moveWorld,
  stateOf,
}
