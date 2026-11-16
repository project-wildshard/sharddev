import assert from 'node:assert/strict'
import { test } from 'node:test'

import boar from '../content/species/boar.json' with { type: 'json' }
import { legacyCreatureProfile } from './legacySpecies.ts'

test('old source profiles copy exact kit tuning and never retain caller mutations', () => {
  const first = legacyCreatureProfile('boar')
  assert.ok(first)
  assert.deepEqual(first.temperament.tuning, boar.tuning)
  const speed = first.temperament.home.speed
  first.temperament.home.speed = 0
  first.senses.notice = 0
  assert.equal(legacyCreatureProfile('boar')?.temperament.home.speed, speed)
  assert.notEqual(legacyCreatureProfile('boar')?.senses.notice, 0)
  assert.equal(legacyCreatureProfile('my.creature'), undefined)
})
