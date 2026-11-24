import assert from 'node:assert/strict'
import { test } from 'node:test'

import { armedSlugs } from './checked.ts'

import type { CatalogueShard } from './wire.ts'

// FORMAT-PRUNE FP27c (J426): upload judges the memory lines by the API
// catalogue's armed slugs, as the API's own admission does, not by the
// format's list (which leaves the format).

test('FP27c the catalogue arms the slugs whose armed word is set', async (): Promise<void> => {
  const rows: readonly CatalogueShard[] = [
    { slug: 'pine-hollow', armed: { since: '2026-11-18', epoch: 8 } },
    // oxlint-disable-next-line unicorn/no-null -- the catalogue's null for an unarmed shard
    { slug: 'nine-dragon-stack', armed: null },
    { slug: 'blender-template' },
  ]
  assert.deepEqual(
    [...((await armedSlugs(Promise.resolve(rows))) ?? [])],
    ['pine-hollow'],
  )
})

test('FP27c an unreadable catalogue leaves the format to decide', async (): Promise<void> => {
  const failed = Promise.reject(new Error('offline'))
  assert.equal(await armedSlugs(failed), undefined)
})
