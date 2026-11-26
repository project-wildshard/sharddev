import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { writeHeroStamp } from '@wildshard/upload/cli/hero/stamp.ts'
import { refusalNote } from '@wildshard/upload/sharddev/refusals.ts'

import {
  BASE,
  SHOTS,
  SVG,
  cut,
  project,
  moveWorld,
  stateOf,
} from '../../test/helpers/hero-project.ts'

import type { Project } from '../../test/helpers/hero-project.ts'

// Jake, 2026-11-12 17:14 Cancún: "you have to update the hero images for the
// templates." A cut (`wildshard build`) of a shard whose captured hero is
// older than its content is refused, and the refusal names the capture.

// A new capture of the portrait: other bytes the product carries (the corpus
// product's thumb; J434 retired Template 2, whose fourth image this was).
const RECAPTURED = SHOTS.thumb

function namesTheCapture(error: unknown): boolean {
  assert.ok(error instanceof Error)
  assert.match(error.message, /hero of hero-test is older than its content/u)
  assert.equal(refusalNote('pack', error.message).rule, 'hero-stale')
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
  await moveWorld(space)
  assert.equal(await stateOf(space.shard), 'stale')
  await assert.rejects(cut(space), namesTheCapture)
})

// NB10 (meta SHARD-COMPAT): a source move that builds the same world (an SDK codemod, a pin move, a refactor) keeps the
// hero current; the cut re-stamps it and says to commit it.
test('NB10: a source edit that builds the same world keeps the hero, re-stamped', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  const first = await cut(space)
  assert.ok(
    first.some((line: string): boolean =>
      line.includes('recorded the built world'),
    ),
  )
  await writeFile(
    path.join(space.shard, 'world.json'),
    '{"hut":[0,0,0],"note":"refactor"}',
  )
  assert.equal(await stateOf(space.shard), 'stale')
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean =>
      line.includes('the built world it shows did not'),
    ),
  )
  assert.match(
    await readFile(path.join(space.shard, 'hero.json'), 'utf8'),
    /"look": "[0-9a-f]{64}"/u,
  )
})

// QA 11-23-b row 14 (meta): a worktree's untracked static/ assets reach its build but not CI's, so the look it would
// record is not the one CI builds from the commit (Dunes and Sky stopped on src/hero.json); the cut records nothing.
/** The project committed to a new git repo, then one untracked asset under its source's static/ (A7). */
async function committedWithLooseAsset(space: Project): Promise<void> {
  for (const args of [
    ['init', '-q'],
    ['add', '-A'],
    ['commit', '-qm', 'fixture'],
  ]) {
    execFileSync(
      'git',
      ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args],
      {
        cwd: space.root,
        stdio: 'ignore',
      },
    )
  }
  await mkdir(path.join(space.shard, 'static', 'assets'), { recursive: true })
  await writeFile(
    path.join(space.shard, 'static', 'assets', 'loose.png'),
    'not in git',
  )
}

test('a look is not recorded beside untracked src/ inputs', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  await committedWithLooseAsset(space)
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean =>
      line.includes(
        'untracked inputs (src/shards/hero-test/static/assets/loose.png)',
      ),
    ),
  )
  assert.doesNotMatch(
    await readFile(path.join(space.shard, 'hero.json'), 'utf8'),
    /"look"/u,
  )
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
  await assert.rejects(cut(space), (error: unknown): boolean => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /no hero\.json stamp.*--stamp-existing/u)
    assert.equal(refusalNote('pack', error.message).rule, 'hero-stale')
    return true
  })
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

test("a lean repo's tooling at the source's top (scripts/, test/) is not content; a nested scripts/ is", async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  // Script-paths: a shard source's own scripts/.kit (src/scripts/.kit from its repo root)
  await mkdir(path.join(space.shard, 'scripts', '.kit'), { recursive: true })
  await writeFile(
    // Script-paths: a shard source's own scripts/.kit (src/scripts/.kit from its repo root)
    path.join(space.shard, 'scripts', '.kit', 'bin-pins.mjs'),
    'export {}\n',
  )
  await mkdir(path.join(space.shard, 'test', '.kit'), { recursive: true })
  await writeFile(
    path.join(space.shard, 'test', '.kit', 'owned-scratch.mjs'),
    'export {}\n',
  )
  assert.equal(await stateOf(space.shard), 'fresh')
  await mkdir(path.join(space.shard, 'generators', 'scripts'), {
    recursive: true,
  })
  await writeFile(
    path.join(space.shard, 'generators', 'scripts', 'ramp.ts'),
    'export {}\n',
  )
  assert.equal(await stateOf(space.shard), 'stale')
})

test('a product built before the capture does not carry the new hero and is refused', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeFile(path.join(space.shard, 'card', 'portrait.jpg'), 'new shot')
  await writeHeroStamp(space.shard, { base: BASE })
  assert.equal(await stateOf(space.shard), 'fresh')
  await assert.rejects(cut(space), (error: unknown): boolean => {
    assert.ok(error instanceof Error)
    assert.match(
      error.message,
      /does not carry the captured hero \(card\/portrait\.jpg\)/u,
    )
    assert.equal(refusalNote('pack', error.message).rule, 'hero-not-in-product')
    return true
  })
})

test('SA51: one output of a source that emits several wears its own card; the source hero is not looked for in it', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  const manifest = path.join(space.shard, 'manifest.json')
  const card: unknown = JSON.parse(await readFile(manifest, 'utf8'))
  assert.ok(typeof card === 'object' && card !== null)
  await writeFile(manifest, JSON.stringify({ ...card, slug: 'hero-source' }))
  await writeFile(path.join(space.shard, 'card', 'portrait.jpg'), 'new shot')
  await writeHeroStamp(space.shard, { base: BASE })
  assert.equal(await stateOf(space.shard), 'fresh')
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean =>
      /hero: current .*one output of this source and wears its own card/u.test(
        line,
      ),
    ),
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

// Meta NEW-SHARD-E2E F28: a scene shard keeps no manifest.json (its discovery
// is generated); its captured hero is card/<slot>.jpg, stamped and checked by
// the cut like any other.
async function sceneShard(context: TestContext): Promise<Project> {
  const space = await project(context)
  await rm(path.join(space.shard, 'manifest.json'))
  await writeFile(path.join(space.shard, 'shard.config.ts'), 'export {}')
  return space
}

test('F28: a scene shard wears its card/*.jpg as its hero, and the cut checks it', async (context: TestContext): Promise<void> => {
  const space = await sceneShard(context)
  // Captured card files and no stamp: unstamped, refused like any shard's
  assert.equal(await stateOf(space.shard), 'unstamped')
  await writeHeroStamp(space.shard, { base: BASE })
  assert.equal(await stateOf(space.shard), 'fresh')
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean => line.startsWith('hero: current')),
  )
  await writeFile(
    path.join(space.shard, 'shard.config.ts'),
    'export const changed = 1',
  )
  await moveWorld(space)
  await assert.rejects(cut(space), /hero of .* is older than its content/u)
})

test('F28: a scene shard with no capture yet wears a generated card', async (context: TestContext): Promise<void> => {
  const space = await sceneShard(context)
  await rm(path.join(space.shard, 'card'), { recursive: true })
  assert.equal(await stateOf(space.shard), 'generated')
  const lines = await cut(space)
  assert.ok(
    lines.some((line: string): boolean =>
      line.startsWith('hero: generated card'),
    ),
  )
})
