import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deerCreature, wolfCreature } from '@wildshard/kit/creatures'
import { parseRows } from '@wildshard/shard-format/rows'

import deer from '../content/creatures/deer.json' with { type: 'json' }
import wolf from '../content/creatures/wolf.json' with { type: 'json' }

test('the public Kit helpers retain the same admitted bytes as the plain files', () => {
  for (const [source, helper] of [
    [deer, deerCreature],
    [wolf, wolfCreature],
  ] as const) {
    const {
      id,
      body: { look },
    } = source.species
    const product = helper({ id, look })
    const plain = parseRows({
      weather: [],
      days: [],
      compendiums: [],
      loot: [],
      species: [source.species],
      strikes: source.strikes,
      looks: [
        {
          id: look,
          species: id,
          recipe: 'platform.skin',
          material: null,
          parameters: {},
          animation: { recipe: 'platform.clips', parameters: {} },
        },
      ],
    })
    assert.equal(
      JSON.stringify(product.species),
      JSON.stringify(plain.species[0]),
    )
    assert.equal(JSON.stringify(product.strikes), JSON.stringify(plain.strikes))
    assert.deepEqual(
      product.items.map(item => item.id),
      source.species.harvest.map(drop => drop.item),
    )
  }
})

test('deer keep Pine tuning and a wolf can retarget its look and bite independently', () => {
  const animal = deerCreature({ id: 'author.deer', look: 'author.deer.skin' })
  assert.equal(animal.species.temperament?.reaction, 'skittish')
  assert.equal(animal.species.temperament?.brain, 'hunt')
  assert.equal(
    Reflect.get(animal.species.temperament?.tuning ?? {}, 'runSpeed'),
    6,
  )
  assert.equal(
    Reflect.get(animal.species.temperament?.tuning ?? {}, 'sightRange'),
    30,
  )
  assert.deepEqual(animal.strikes, [])

  const pack = wolfCreature({
    id: 'author.wolf',
    look: 'author.wolf.skin',
    strike: 'author.wolf.fang',
  })
  assert.equal(pack.species.body?.look, 'author.wolf.skin')
  assert.equal(pack.species.body?.skeleton, 'quadruped')
  assert.equal(pack.species.temperament?.pack, true)
  assert.equal(pack.species.abilities?.[0]?.use, 'author.wolf.fang')
  assert.equal(pack.strikes[0]?.id, 'author.wolf.fang')
  assert.throws(() => wolfCreature({ id: 'invalid name', look: 'author.skin' }))
})
