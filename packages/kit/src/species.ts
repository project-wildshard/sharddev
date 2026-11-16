import { SpeciesSchema } from '@wildshard/shard-format/speciesPrograms'
import { parse } from 'valibot'

import bear from '../content/species/bear.json' with { type: 'json' }
import boar from '../content/species/boar.json' with { type: 'json' }

import type { SpeciesData } from '@wildshard/shard-format/speciesPrograms'

type CommonSpeciesKind = 'boar' | 'bear'
const common = { boar, bear }

/** The original complete gameplay rows; rebuilding copies fresh values into the shard. */
function commonSpeciesRows(
  kind: CommonSpeciesKind,
  speciesId: string,
): SpeciesData {
  return parse(SpeciesSchema, { ...common[kind], id: speciesId })
}

export { commonSpeciesRows }
export type { CommonSpeciesKind }
