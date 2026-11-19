import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { abilities, type AbilityHelper } from './abilities.ts'
import { biped, quadruped } from './body.ts'
import {
  temperament,
  type PresetName,
  type TemperamentHelper,
} from './temperament.ts'

async function plain(folder: string, name: string): Promise<string> {
  const file =
    folder === 'temperaments'
      ? '../content/temperaments.json'
      : `../content/${folder}/${name}.json`
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const value: unknown = JSON.parse(source)
  if (folder === 'temperaments') {
    return JSON.stringify(Reflect.get(new Object(value), name))
  }
  return JSON.stringify(value)
}

test('every temperament and ability helper writes the exact plain JSON', async (): Promise<void> => {
  const profiles = Object.entries(temperament).map(
    async ([name, helper]: readonly [
      string,
      TemperamentHelper,
    ]): Promise<void> => {
      const expected = await plain('temperaments', name)
      assert.equal(JSON.stringify(helper()), expected)
    },
  )
  const strikes = Object.entries(abilities).map(
    async ([name, helper]: readonly [string, AbilityHelper]): Promise<void> => {
      const expected = await plain('abilities', name)
      assert.equal(JSON.stringify(helper()), expected)
    },
  )
  await Promise.all([...profiles, ...strikes])
})

test('body defaults accept an explicit look and preserve a chosen scale', (): void => {
  assert.deepEqual(quadruped({ look: 'fixture.look' }), {
    skeleton: 'quadruped',
    size: 'medium',
    scale: 1,
    look: 'fixture.look',
  })
  assert.deepEqual(biped({ look: 'fixture.look', size: 'large', scale: 1.2 }), {
    skeleton: 'biped',
    size: 'large',
    scale: 1.2,
    look: 'fixture.look',
  })
})

test('overrides never mutate catalogue data or the next authored row', (): void => {
  const pack = temperament.pack({ aggro: 18, assist: 14 })
  assert.equal(pack.senses.notice, 18)
  assert.equal(pack.temperament.assist, 14)
  pack.temperament.home.speed = 0
  assert.notEqual(temperament.pack().temperament.home.speed, 0)
  const bite = abilities.bite({ id: 'fixture.bite', damage: 12, hpBelow: 0.5 })
  assert.equal(bite.strike.id, bite.ability.use)
  assert.equal(bite.strike.damage, 12)
  assert.equal(bite.ability.hpBelow, 0.5)
  assert.notEqual(abilities.bite().strike.damage, 12)
})

test('the ranged templates: breath channels from the head, the rest fly', (): void => {
  const breath = abilities.breath()
  assert.equal(breath.ability.from, 'head')
  assert.equal(breath.strike.shape.kind, 'wedge')
  assert.equal(breath.ability.projectile, undefined)
  for (const name of ['shoot', 'spit', 'throw'] as const) {
    const ranged = abilities[name]()
    assert.equal(ranged.strike.id, ranged.ability.use)
    assert.ok((ranged.ability.projectile?.speed ?? 0) > 0, name)
    assert.ok((ranged.ability.projectile?.radius ?? 0) > 0, name)
  }
  assert.ok((abilities.throw().ability.projectile?.gravity ?? 0) > 0)
})

test('invalid authored numeric overrides refuse through the format contract', (): void => {
  assert.throws((): void => {
    temperament.pack({ aggro: -1 })
  })
  assert.throws((): void => {
    abilities.bite({ hpBelow: 2 })
  })
  assert.throws((): void => {
    quadruped({ look: 'fixture.look', scale: 0 })
  })
})

test('every profile keeps the full numbers of its canonical tuning document', async (): Promise<void> => {
  const sources: readonly (readonly [PresetName, string])[] = [
    ['passive', 'deer'],
    ['skittish', 'deer'],
    ['neutral', 'boar'],
    ['aggressive', 'bear'],
    ['pack', 'boar'],
    ['territorial', 'boar'],
    ['ambush', 'bear'],
    ['flee', 'deer'],
    ['pursue', 'pursue'],
  ]
  await Promise.all(
    sources.map(
      async ([name, source]: readonly [PresetName, string]): Promise<void> => {
        const expected = await plain('tuning', source)
        const actual = temperament[name]().temperament.tuning
        assert.equal(JSON.stringify(actual), expected)
      },
    ),
  )
})
