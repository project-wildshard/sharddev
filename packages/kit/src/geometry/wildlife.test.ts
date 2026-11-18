import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { bakeWildlife } from '@wildshard/kit/geometry/wildlife'

for (const kind of ['deer', 'wolf'] as const) {
  test(`published ${kind} GLB and skin regenerate exactly`, async () => {
    const asset = await bakeWildlife(kind)
    for (const [ext, bytes] of [
      ['glb', asset.glb],
      ['skin.json', asset.skin],
    ] as const) {
      const committed = await readFile(
        new URL(
          import.meta.resolve(`@wildshard/kit/content/wildlife/${kind}.${ext}`),
        ),
      )
      assert.deepEqual(bytes, new Uint8Array(committed))
    }
  })
}
