import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cellsOf, channelOf } from './grid.ts'

// Meta NEW-SHARD-E2E F29: `wildshard grid` reads the catalogue's grid rows.

describe('wildshard grid', (): void => {
  it("names the API's channel, staging when absent", (): void => {
    assert.equal(channelOf(), 'staging')
    assert.equal(channelOf('prod'), 'production')
    assert.equal(channelOf('preview'), 'preview')
    assert.equal(channelOf('production'), undefined)
    assert.equal(channelOf('toString'), undefined)
  })

  it('reads the grid cells, dropping rows of another shape', (): void => {
    const document = {
      grid: {
        cells: [
          { slug: 'fairground', cell: [-2, -2] },
          { slug: 'no-cell' },
          { slug: 'half', cell: [1] },
          'not a row',
          { slug: 'isle', cell: [0, 1] },
        ],
      },
    }
    assert.deepEqual(cellsOf(document), [
      { slug: 'fairground', cell: [-2, -2] },
      { slug: 'isle', cell: [0, 1] },
    ])
    assert.throws((): unknown => cellsOf({ shards: [] }), TypeError)
  })
})
