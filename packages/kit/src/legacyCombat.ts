import {
  StrikeDebrisSchema,
  type StrikeDebrisPolicy,
} from '@wildshard/shard-format/strikeDebris'
import { parse } from 'valibot'

import content from '../content/sword-debris.json' with { type: 'json' }

/** Compile the former sword effects into ordinary target-row declarations, with no runtime kind lookup. */
export function legacySwordDebris(
  species: readonly Readonly<{ id: string; kind: string }>[],
): StrikeDebrisPolicy {
  const overrides = species.flatMap(row => {
    const effect = Object.entries(content.kinds).find(
      ([kind]) => kind === row.kind,
    )?.[1]
    return effect === undefined
      ? []
      : [{ target: row.id, effect: { ...effect } }]
  })
  return parse(StrikeDebrisSchema, {
    default: { ...content.default },
    overrides,
  })
}
