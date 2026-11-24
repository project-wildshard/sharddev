import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { stampWrites } from '@wildshard/upload/cli/hero/hero.ts'
import { writeHeroStamp } from '@wildshard/upload/cli/hero/stamp.ts'

import { BASE, cut, project, stateOf } from '../../test/helpers/hero-project.ts'

// J505 (QA-FEEDBACK-2026-11-23-b): Driftwood's staging publish stopped twice on "the build changed tracked files:
// M src/hero.json", the cut having recorded the built world's look in the stamp on the runner. A publish runner's cut
// judges the hero the same way but writes no tracked file.
test("J505: a publish runner's cut passes a fresh hero and leaves hero.json as it was", async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  const stamp = path.join(space.shard, 'hero.json')
  const before = await readFile(stamp, 'utf8')
  const lines = await cut(space, false)
  assert.equal(await readFile(stamp, 'utf8'), before)
  assert.ok(
    lines.some((line: string): boolean =>
      line.includes('a local build records it'),
    ),
  )
  assert.ok(
    lines.some((line: string): boolean => line.startsWith('hero: current')),
  )
  // A local cut records it, as before
  await cut(space)
  assert.notEqual(await readFile(stamp, 'utf8'), before)
})

test('J505: a source move that builds the same world passes on a publish runner with no stamp written', async (context: TestContext): Promise<void> => {
  const space = await project(context)
  await writeHeroStamp(space.shard, { base: BASE })
  await cut(space)
  await writeFile(
    path.join(space.shard, 'world.json'),
    '{"hut":[0,0,0],"note":"refactor"}',
  )
  const stamp = path.join(space.shard, 'hero.json')
  const before = await readFile(stamp, 'utf8')
  const lines = await cut(space, false)
  assert.equal(await readFile(stamp, 'utf8'), before)
  assert.ok(
    lines.some((line: string): boolean =>
      line.includes('a local build re-stamps'),
    ),
  )
  assert.equal(await stateOf(space.shard), 'stale')
})

test('J505: the cut writes stamps everywhere but a GitHub Actions runner', (): void => {
  assert.equal(stampWrites({ GITHUB_ACTIONS: 'true' }), false)
  assert.equal(stampWrites({}), true)
  assert.equal(stampWrites({ CI: 'true' }), true)
})
