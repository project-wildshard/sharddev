import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

import { heroState } from '../../cli/hero/stamp.ts'
import { packProduct } from '../../cli/pack/pack.ts'
import { shardfileFiles } from './shardfile.ts'

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
// as `blobs/image/<sha256>.<ext>`, so the shots below are these bytes.
const SHOTS = {
  thumb:
    'blobs/image/248fe9601e921305ffb35421414bc5f03e9f1b3dba15bf9b5c3387d8f255da17.png',
  portrait:
    'blobs/image/4b47420aff1ded28c9c6cf1eb92d6e2d7b01d057f2654654405445ff8d562e55.webp',
  landscape:
    'blobs/image/5dbc818ed0be692e6ba3df87898fd623280a2686eed5a538333e1325764b238d.png',
}
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

async function stateOf(shard: string): Promise<string> {
  const hero = await heroState(shard)
  return hero.state
}

async function cut(space: Project): Promise<readonly string[]> {
  const lines: string[] = []
  await packProduct({
    dir: space.product,
    out: path.join(space.root, 'shard.tar'),
    report: (line: string): void => {
      lines.push(line)
    },
  })
  return lines
}

export { type Project, BASE, NAME, SHOTS, SVG, cut, project, stateOf }
