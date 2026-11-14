import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
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
import { stampExistingHero } from './adopt.ts'
import { field, heroState, readJson, writeHeroStamp } from './stamp.ts'

import type { Project } from '../../test/helpers/hero-project.ts'

// A shard repo that bumps its sharddev pin gets this check with curated heroes
// and no stamp, and recapturing from the spawn view would replace good art
// with a plain shot. `--stamp-existing` adopts the files on disk, no capture.
const BIN = path.resolve(import.meta.dirname, '../../../bin/wildshard.mjs')

async function stampedField(shard: string, key: string): Promise<unknown> {
  return field(await readJson(path.join(shard, 'hero.json')), key)
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

test('stamp-existing leaves a current stamp alone and adopts hand-swapped files over the same content', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  const { content } = await heroState(space.shard)
  assert.deepEqual(await stampExistingHero(space.shard), {
    written: false,
    content,
  })
  assert.equal(await stampedField(space.shard, 'base'), BASE)
  await writeFile(path.join(space.shard, 'card', 'thumb.jpg'), 'hand art')
  await assert.rejects(cut(space), /not the ones stamped.*--stamp-existing/u)
  const adopted = await stampExistingHero(space.shard)
  assert.equal(adopted.written, true)
  assert.equal(await stateOf(space.shard), 'fresh')
})

test('stamp-existing refuses a stamp for other content, and a hero.json that does not parse', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  await writeFile(path.join(space.shard, 'world.json'), '{"hut":[9,0,9]}')
  await assert.rejects(
    stampExistingHero(space.shard),
    /only a capture fixes it/u,
  )
  assert.equal(await stateOf(space.shard), 'stale')
  await writeFile(path.join(space.shard, 'hero.json'), '{"camera":')
  await assert.rejects(stampExistingHero(space.shard), /does not parse/u)
})

/** The flag survives a stamp-existing run and a plain re-stamp. */
async function assertCuratedKept(shard: string): Promise<void> {
  assert.equal(await stampedField(shard, 'curated'), true)
  await writeHeroStamp(shard, { base: BASE })
  assert.equal(await stampedField(shard, 'curated'), true)
}

async function assertNeverRecaptured(space: Project): Promise<void> {
  assert.equal(await stateOf(space.shard), 'stale')
  await assert.rejects(cut(space), /curated.*--stamp-existing/u)
  const capture = spawnSync(
    process.execPath,
    [BIN, 'hero', space.shard, '--base', 'http://127.0.0.1:9'],
    { encoding: 'utf8' },
  )
  assert.notEqual(capture.status, 0)
  assert.match(capture.stderr, /curated.*never recaptured/u)
}

test('a curated hero is re-stamped over new content, keeps its art, camera and flag, and is never recaptured', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  const camera = { pos: [1, 2, 3], look: [0, 0, 0], fov: 50 }
  await writeFile(
    path.join(space.shard, 'hero.json'),
    JSON.stringify({ camera, curated: true }),
  )
  const thumb = await readFile(path.join(space.shard, 'card', 'thumb.jpg'))
  stampExisting(space.shard)
  await writeFile(path.join(space.shard, 'world.json'), '{"hut":[9,0,9]}')
  await assertNeverRecaptured(space)
  assert.match(stampExisting(space.shard), /stamped .*hero\.json/u)
  await assertAdopted(space.shard, camera, thumb)
  await assertCuratedKept(space.shard)
})

test('a curated hero with no stamp yet is pointed at stamp-existing, not a capture', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeFile(path.join(space.shard, 'hero.json'), '{"curated":true}')
  assert.equal(await stateOf(space.shard), 'unstamped')
  await assert.rejects(cut(space), /curated.*--stamp-existing/u)
})
