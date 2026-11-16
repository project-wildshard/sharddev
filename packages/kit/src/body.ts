import {
  CreatureBodySchema,
  type CreatureBody,
  type CreatureSize,
} from '@wildshard/shard-format/creatureLayers'
import { parse } from 'valibot'

import bipedBody from '../content/bodies/biped.json' with { type: 'json' }
import quadrupedBody from '../content/bodies/quadruped.json' with { type: 'json' }

interface BodyOptions {
  readonly look: string
  readonly size?: CreatureSize
  readonly scale?: number
}

function quadruped(options: Readonly<BodyOptions>): CreatureBody {
  return parse(CreatureBodySchema, { ...quadrupedBody, ...options })
}
function biped(options: Readonly<BodyOptions>): CreatureBody {
  return parse(CreatureBodySchema, { ...bipedBody, ...options })
}

export { quadruped, biped }
export type { BodyOptions }
