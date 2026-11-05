// Proof that the private git dependency @wildshard/format (shardfile at
// v0.1.0) installs and type-checks here (meta repo B7, J42/J53). The import
// is type-only: tsc reads the raw .ts under node_modules, and Node erases
// it, because Node will not strip types inside node_modules at run time.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LiftRider } from '@wildshard/format/liftRider'

describe('@wildshard/format, the shardfile git dependency', (): void => {
  it('types a lift rider by its edge', (): void => {
    const riders: readonly LiftRider[] = ['north', 'east', 'south', 'west']
    // @ts-expect-error: not an edge, so the type is real and not `any`.
    const wrong: LiftRider = 'up'

    assert.equal(riders.length, 4)
    assert.equal(wrong, 'up')
  })
})
