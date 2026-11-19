/* eslint-disable id-length, typescript/explicit-function-return-type */
// Meta TEMPLATE-E2E TR-12b: `wildshard content` counts the places quests mark, not a legacy level manifest.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { markedPlaces } from './content-pois.ts'

const marker = (x: number, poi = 'world') => ({
  id: `m${x}`,
  label: 'Place',
  at: { poi, x, z: 2 },
})

describe('content POIs', () => {
  it('counts each marked world place once, from intros and steps', () => {
    const quests = [
      {
        steps: [{ markers: [marker(1), marker(2)] }, { markers: [marker(2)] }],
      },
      { intro: { markers: [marker(3)] }, steps: [{}] },
    ]
    assert.equal(markedPlaces(quests), 3)
  })

  it('skips markers that are not world places, and quests with none', () => {
    assert.equal(
      markedPlaces([
        { steps: [{ markers: [marker(1, 'npc')] }] },
        { steps: [] },
        {},
      ]),
      0,
    )
  })
})
