import assert from 'node:assert/strict'
import { test } from 'node:test'

import boar from '../content/species/boar.json' with { type: 'json' }
import { legacyCreatureProfile } from './legacySpecies.ts'

test('old source profiles copy exact kit tuning and never retain caller mutations', () => {
  const first = legacyCreatureProfile('boar')
  assert.ok(first)
  const { motion, ...tuning } = { ...first.temperament.tuning } as Record<
    string,
    unknown
  >
  assert.deepEqual(tuning, boar.tuning)
  assert.deepEqual(motion, {
    walkSpeed: boar.walkSpeed,
    chargeSpeed: boar.chargeSpeed,
    chargeWindup: boar.chargeWindup,
    ringRadius: boar.ringRadius,
    trampleRadius: boar.trampleRadius,
  })
  const speed = first.temperament.home.speed
  first.temperament.home.speed = 0
  first.senses.notice = 0
  assert.equal(legacyCreatureProfile('boar')?.temperament.home.speed, speed)
  assert.notEqual(legacyCreatureProfile('boar')?.senses.notice, 0)
  assert.equal(legacyCreatureProfile('my.creature'), undefined)
})
