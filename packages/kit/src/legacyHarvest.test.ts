import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { legacyHarvest } from './legacyHarvest.ts'

// Independent prior-law results: engine ec71dd0365, src/shared/game/harvest.ts.
// Conditional extra drops are listed literally rather than recomputing kit selectors.
const cases = [
  {
    kind: 'deer',
    base: ['venison', 'deer-hide'],
    variants: ['doe', 'stag', 'ghost', 'ghost-stag', 'custom'],
    extra: [[], ['antlers'], ['antlers'], ['antlers'], []],
  },
  {
    kind: 'boar',
    base: ['boar-meat', 'boar-hide'],
    variants: ['sow', 'russet', 'ironhide', 'custom'],
    extra: [[], ['boar-tusk'], ['boar-tusk'], ['boar-tusk']],
  },
  {
    kind: 'elk',
    base: ['elk-meat', 'elk-hide'],
    variants: ['cow', 'bull', 'imperial', 'custom'],
    extra: [[], ['antlers'], ['antlers'], []],
  },
  {
    kind: 'bear',
    base: ['bear-pelt', 'bear-claw'],
    variants: ['brown', 'black', 'blackpaw', 'custom'],
    extra: [[], [], [], []],
  },
  {
    kind: 'crab',
    base: ['crab-meat', 'crab-claw'],
    variants: ['red', 'big', 'big-red', 'custom'],
    extra: [[], ['crab-shell'], [], []],
  },
  {
    kind: 'monkey',
    base: ['coconut'],
    variants: ['brown', 'elder', 'elder-brown', 'custom'],
    extra: [['monkey-fur'], ['silver-fur'], ['monkey-fur'], ['monkey-fur']],
  },
]
test('kit copies each former ordered drop without RNG or caller-owned values', () => {
  const random = mock.method(Math, 'random', () => {
    throw new Error('Harvest drew RNG')
  })
  try {
    for (const row of cases) {
      const roster = [...row.variants]
      const drops = legacyHarvest(row.kind, roster)
      assert.ok(drops)
      for (const [index, variant] of roster.entries()) {
        const actual: string[] = drops
          .filter(
            drop =>
              drop.variants === undefined || drop.variants.includes(variant),
          )
          .flatMap(drop => Array.from({ length: drop.count }, () => drop.item))
        assert.deepEqual(
          actual,
          [...row.base, ...(row.extra[index] ?? [])],
          `${row.kind}/${variant}`,
        )
      }
      const before = structuredClone(drops)
      roster.reverse()
      drops.reverse()
      const first = drops[0]
      assert.ok(first)
      first.item = 'mutated'
      for (const drop of drops) drop.variants?.reverse()
      assert.deepEqual(legacyHarvest(row.kind, row.variants), before)
    }
  } finally {
    random.mock.restore()
  }
})
test('the build helper preserves unknown labels and refuses malformed rosters', () => {
  assert.equal(legacyHarvest('own.creature', ['plain']), undefined)
  assert.equal(legacyHarvest('__proto__', ['plain']), undefined)
  assert.throws(
    () => legacyHarvest('boar', ['sow', 'sow']),
    /Duplicate harvest variant/u,
  )
  assert.throws(() =>
    legacyHarvest(
      'boar',
      Array.from({ length: 65 }, (_, index) => `variant-${index}`),
    ),
  )
  assert.throws(() => legacyHarvest('boar', ['not a variant']))
  assert.deepEqual(legacyHarvest('deer', []), [
    { item: 'venison', count: 1 },
    { item: 'deer-hide', count: 1 },
  ])
})
