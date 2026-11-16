import assert from 'node:assert/strict'
import { test } from 'node:test'

import bear from '../content/species/bear.json' with { type: 'json' }
import boar from '../content/species/boar.json' with { type: 'json' }
import { commonCreature } from './creatures.ts'

test('layered kit creatures retain source gameplay values and ordered variants', () => {
  for (const kind of ['boar', 'bear'] as const) {
    const original = kind === 'boar' ? boar : bear
    const { species, strikes } = commonCreature(kind, {
      id: 'author.beast',
      look: 'author.skin',
      strike: 'author.charge',
    })
    assert.equal(species.id, 'author.beast')
    assert.equal(species.body?.look, 'author.skin')
    assert.equal(species.body?.skeleton, 'quadruped')
    assert.deepEqual(
      species.variants.map(row => row.id),
      original.variants.map(row => row.id),
    )
    for (const row of species.variants) {
      const source = original.variants.find(variant => variant.id === row.id)
      assert.ok(source)
      assert.equal(row.label, source.label)
      assert.equal(row.weight, source.weight)
      assert.deepEqual(row.scale, source.scale)
      assert.equal(row.hp, source.hp ?? original.tuning.hp)
      for (const [key, value] of Object.entries(source.mods ?? {}))
        assert.equal(Reflect.get(row.mods, key), value)
    }
    const tuning = species.temperament?.tuning
    assert.ok(tuning)
    for (const [key, value] of Object.entries(original.tuning))
      assert.deepEqual(Reflect.get(tuning, key), value)
    assert.deepEqual(Reflect.get(tuning, 'motion'), {
      walkSpeed: original.walkSpeed,
      chargeSpeed: original.chargeSpeed,
      chargeWindup: original.chargeWindup,
      ringRadius: original.ringRadius,
      trampleRadius: original.trampleRadius,
    })
    assert.deepEqual(species.presentation?.sounds, original.sounds)
    assert.equal(strikes[0]?.speed, original.chargeSpeed)
    assert.equal(strikes[0]?.damage, original.chargeDamage)
    assert.equal(strikes[0]?.windup, original.chargeWindup)
    assert.equal(species.abilities?.[0]?.use, 'author.charge')
  }
})

test('copied creature calls isolate nested gameplay content and reject invalid ids', () => {
  const first = commonCreature('boar', {
    id: 'author.boar',
    look: 'author.skin',
  })
  const untouched = commonCreature('boar', {
    id: 'author.boar',
    look: 'author.skin',
  })
  first.species.variants.reverse()
  Reflect.set(first.species.temperament?.tuning ?? {}, 'hp', 1)
  first.strikes.splice(0)
  assert.deepEqual(
    commonCreature('boar', { id: 'author.boar', look: 'author.skin' }),
    untouched,
  )
  assert.throws(() =>
    commonCreature('boar', { id: 'invalid id', look: 'author.skin' }),
  )
})
