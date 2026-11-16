import { expect, test } from 'vitest'

import { commonSpeciesRows as kitSpeciesRows } from '../packages/kit/src/species.ts'
import { commonSpeciesRows } from '../src/sharddev/bake/species.ts'

test('kit plain definitions preserve existing extraction bytes and own their returned values', (): void => {
  for (const kind of ['boar', 'bear'] as const) {
    const original = commonSpeciesRows(kind, `author.${kind}`)
    const moved = kitSpeciesRows(kind, `author.${kind}`)
    expect(JSON.stringify(moved)).toBe(JSON.stringify(original))
    moved.variants.reverse()
    if (moved.tuning !== undefined) {
      moved.tuning.hp = 1
    }
    expect(kitSpeciesRows(kind, `author.${kind}`)).toEqual(original)
  }
})
