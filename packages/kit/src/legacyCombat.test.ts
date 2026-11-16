import assert from 'node:assert/strict'
import { test } from 'node:test'

import { legacySwordDebris } from './legacyCombat.ts'

test('former sword source values compile to isolated row-id effects, never label ids', () => {
  const rows = [
    { id: 'own.shell', kind: 'crab' },
    { id: 'own.shell2', kind: 'crab' },
    { id: 'own.timber', kind: 'sailor' },
    { id: 'own.sand', kind: 'boar' },
  ]
  const expected = {
    default: { surface: 'sand', count: 10, atFeet: true, sparks: false },
    overrides: [
      {
        target: 'own.shell',
        effect: { surface: 'shell', count: 9, atFeet: false, sparks: true },
      },
      {
        target: 'own.shell2',
        effect: { surface: 'shell', count: 9, atFeet: false, sparks: true },
      },
      {
        target: 'own.timber',
        effect: { surface: 'wood', count: 8, atFeet: false, sparks: true },
      },
    ],
  }
  const first = legacySwordDebris(rows)
  assert.deepEqual(first, expected)
  first.default.count = 1
  if (first.overrides?.[0] !== undefined) first.overrides[0].effect.count = 1
  assert.deepEqual(legacySwordDebris(rows), expected)
  assert.deepEqual(
    legacySwordDebris([{ id: 'own.odd', kind: '__proto__' }]).overrides,
    [],
  )
  assert.throws(() => legacySwordDebris([{ id: 'invalid id', kind: 'crab' }]))
  assert.throws(() =>
    legacySwordDebris([
      { id: 'same', kind: 'crab' },
      { id: 'same', kind: 'sailor' },
    ]),
  )
})
