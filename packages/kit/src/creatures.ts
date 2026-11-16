import {
  parseRows,
  type SpeciesRow,
  type StrikeRows,
} from '@wildshard/shard-format/rows'

import bear from '../content/creatures/bear.json' with { type: 'json' }
import boar from '../content/creatures/boar.json' with { type: 'json' }

type CommonCreatureKind = 'boar' | 'bear'
interface CreatureOptions {
  readonly id: string
  readonly look: string
  readonly strike?: string
}
interface CreatureContent {
  species: SpeciesRow
  strikes: StrikeRows[]
}
const plain = { boar, bear }

/** Copy shipped gameplay layers; the caller supplies its own species and look ids. */
function commonCreature(
  kind: CommonCreatureKind,
  options: Readonly<CreatureOptions>,
): CreatureContent {
  const content = plain[kind]
  const strikeId = options.strike ?? `${options.id}.charge`
  const rows = parseRows({
    strikes: content.strikes.map(strike => {
      const row = structuredClone(strike)
      row.id = strikeId
      return row
    }),
    weather: [],
    days: [],
    compendiums: [],
    loot: [],
    species: [
      {
        ...content.species,
        id: options.id,
        body: { ...content.species.body, look: options.look },
        abilities: content.species.abilities.map(ability => {
          const row = structuredClone(ability)
          row.use = strikeId
          return row
        }),
      },
    ],
    looks: [
      {
        id: options.look,
        species: options.id,
        recipe: 'platform.skin',
        material: null,
        parameters: {},
        animation: { recipe: 'platform.clips', parameters: {} },
      },
    ],
  })
  const [species] = rows.species
  if (species === undefined) throw new Error('Missing kit creature row')
  return { species, strikes: rows.strikes }
}

export { commonCreature }
export type { CommonCreatureKind, CreatureOptions, CreatureContent }
