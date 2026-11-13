import assert from 'node:assert/strict'
import { copyFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import {
  BASE,
  SVG,
  cut,
  project,
  stateOf,
} from '../../test/helpers/hero-project.ts'
import { writeHeroStamp } from './stamp.ts'

// Jake, 2026-11-12 17:14 Cancún: "you have to update the hero images for the
// templates." A cut (`wildshard pack`) of a shard whose captured hero is
// older than its content is refused, and the refusal names the capture.

const RECAPTURED =
  'blobs/image/d5ae692911bbc2b60b5fdde239b70aad4ce9be0d7665c4a91b438de6077e21e3.jpg'

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
  await assert.rejects(cut(space), /no hero\.json stamp.*--stamp-existing/u)
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
