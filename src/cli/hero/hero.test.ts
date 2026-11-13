import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { shardfileFiles } from '../../test/helpers/shardfile.ts'
import { packProduct } from '../pack/pack.ts'
import { stampExistingHero } from './adopt.ts'
import { heroState, writeHeroStamp } from './stamp.ts'

// Jake, 2026-11-12 17:14 Cancún: "you have to update the hero images for the
// templates." A cut (`wildshard pack`) of a shard whose captured hero is
// older than its content is refused, and the refusal names the capture.

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
const RECAPTURED =
  'blobs/image/d5ae692911bbc2b60b5fdde239b70aad4ce9be0d7665c4a91b438de6077e21e3.jpg'

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

function namesTheCapture(error: unknown): boolean {
  assert.ok(error instanceof Error)
  assert.match(error.message, /hero of hero-test is older than its content/u)
  assert.match(
    error.message,
    /pnpm exec wildshard hero src\/shards\/hero-test --base <served-build-url>/u,
  )
  return true
}

test('a cut whose content changed after its hero was captured is refused, naming the capture', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  assert.equal(await stateOf(space.shard), 'fresh')
  await cut(space)
  await writeFile(path.join(space.shard, 'world.json'), '{"hut":[9,0,9]}')
  assert.equal(await stateOf(space.shard), 'stale')
  await assert.rejects(cut(space), namesTheCapture)
})

test('a fresh capture after a content change lets the cut through', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  await writeFile(path.join(space.shard, 'world.json'), '{"hut":[9,0,9]}')
  await assert.rejects(cut(space), namesTheCapture)
  await copyFile(
    path.join(space.product, RECAPTURED),
    path.join(space.shard, 'card', 'portrait.jpg'),
  )
  await writeHeroStamp(space.shard, { base: BASE })
  assert.equal(await stateOf(space.shard), 'fresh')
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean => line.startsWith('hero: current')),
  )
})

test('a captured hero with no stamp is refused: nothing says how old it is', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  assert.equal(await stateOf(space.shard), 'unstamped')
  await assert.rejects(cut(space), /no hero\.json stamp/u)
})

test('tests and prose are not content; a hand-swapped hero file is not the one stamped', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  await writeFile(path.join(space.shard, 'world.test.ts'), 'test("x")')
  await writeFile(path.join(space.shard, 'README.md'), '# notes')
  assert.equal(await stateOf(space.shard), 'fresh')
  await writeFile(path.join(space.shard, 'card', 'thumb.jpg'), 'another shot')
  assert.equal(await stateOf(space.shard), 'stale')
})

test('a product built before the capture does not carry the new hero and is refused', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeFile(path.join(space.shard, 'card', 'portrait.jpg'), 'new shot')
  await writeHeroStamp(space.shard, { base: BASE })
  assert.equal(await stateOf(space.shard), 'fresh')
  await assert.rejects(
    cut(space),
    /does not carry the captured hero \(card\/portrait\.jpg\)/u,
  )
})

test('a generated card has no captured hero to go stale; a product with no source is not checked', async (context: TestContext): Promise<void> => {
  const generated = await project(context, {
    thumb: SVG,
    portrait: SVG,
    landscape: SVG,
  })
  assert.equal(await stateOf(generated.shard), 'generated')
  const lines = await cut(generated)
  assert.ok(
    lines.some((line: string): boolean =>
      line.startsWith('hero: generated card'),
    ),
  )
  const orphan = await project(context)
  await rm(orphan.shard, { recursive: true })
  const orphanLines = await cut(orphan)
  assert.ok(
    orphanLines.some((line: string): boolean =>
      line.startsWith('hero: no source shard'),
    ),
  )
})

// A shard repo that bumps its sharddev pin gets this check with curated heroes
// and no stamp, and recapturing from the spawn view would replace good art
// with a plain shot. `--stamp-existing` adopts the files on disk, no capture.
const BIN = path.resolve(import.meta.dirname, '../../../bin/wildshard.mjs')

async function stampedField(shard: string, key: string): Promise<unknown> {
  const stamp: unknown = JSON.parse(
    await readFile(path.join(shard, 'hero.json'), 'utf8'),
  )
  return typeof stamp === 'object' && stamp !== null
    ? Object.entries(stamp).find(
        ([name]: readonly [string, unknown]): boolean => name === key,
      )?.[1]
    : undefined
}

function stampExisting(shard: string): string {
  const run = spawnSync(
    process.execPath,
    [BIN, 'hero', shard, '--stamp-existing'],
    { encoding: 'utf8' },
  )
  assert.equal(run.status, 0, run.stderr)
  return run.stdout
}

/** The stamp-existing run left the files alone, stamped them and kept the camera. */
async function assertAdopted(
  shard: string,
  camera: unknown,
  thumb: Readonly<Uint8Array>,
): Promise<void> {
  assert.deepEqual(await readFile(path.join(shard, 'card', 'thumb.jpg')), thumb)
  assert.equal(await stateOf(shard), 'fresh')
  assert.match(String(await stampedField(shard, 'base')), /stamp-existing/u)
  assert.deepEqual(await stampedField(shard, 'camera'), camera)
}

test('stamp-existing adopts the hero on disk with no capture, keeps a declared camera, and lets the cut through', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  const camera = { pos: [1, 2, 3], look: [0, 0, 0], fov: 50 }
  await writeFile(
    path.join(space.shard, 'hero.json'),
    JSON.stringify({ camera }),
  )
  const thumb = await readFile(path.join(space.shard, 'card', 'thumb.jpg'))
  assert.equal(await stateOf(space.shard), 'unstamped')
  assert.match(stampExisting(space.shard), /stamped .*hero\.json/u)
  await assertAdopted(space.shard, camera, thumb)
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean => line.startsWith('hero: current')),
  )
})

test('stamp-existing refuses a generated card or a card file that is not there', async (context: TestContext): Promise<void> => {
  const generated = await project(context, {
    thumb: SVG,
    portrait: SVG,
    landscape: SVG,
  })
  await assert.rejects(
    stampExistingHero(generated.shard),
    /no hero files to stamp/u,
  )
  const missing = await project(context)
  await rm(path.join(missing.shard, 'card', 'portrait.jpg'))
  await assert.rejects(
    stampExistingHero(missing.shard),
    /card\.portrait \(card\/portrait\.jpg\) not there/u,
  )
  assert.equal(await stateOf(missing.shard), 'unstamped')
})
