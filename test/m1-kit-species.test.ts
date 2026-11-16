import { expect, test } from 'vitest'

import boar from '../packages/kit/content/species/boar.json' with { type: 'json' }
import bear from '../packages/kit/content/species/bear.json' with { type: 'json' }
import { commonSpeciesRows as kitSpeciesRows } from '@wildshard/kit/bake/species'

test('kit plain definitions preserve existing extraction bytes and own their returned values', (): void => {
  for (const kind of ['boar', 'bear'] as const) {
    const original = { ...(kind === 'boar' ? boar : bear), id: `author.${kind}` }
    const moved = kitSpeciesRows(kind, `author.${kind}`)
    expect(moved).toEqual(original)
    moved.variants.reverse()
    if (moved.tuning !== undefined) {
      moved.tuning.hp = 1
    }
    expect(kitSpeciesRows(kind, `author.${kind}`)).toEqual(original)
  }
})
