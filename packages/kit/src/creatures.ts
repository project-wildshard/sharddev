import {
  parseRows,
  type SpeciesRow,
  type StrikeRows,
} from '@wildshard/shard-format/rows'

import bear from '../content/creatures/bear.json' with { type: 'json' }
import boar from '../content/creatures/boar.json' with { type: 'json' }
import deer from '../content/creatures/deer.json' with { type: 'json' }
import wolf from '../content/creatures/wolf.json' with { type: 'json' }
import { legacyHarvestItems } from './legacyHarvest.ts'

import type { ShardItems } from '@wildshard/shard-format/items'

type CommonCreatureKind = 'boar' | 'bear'
interface CreatureOptions {
  readonly id: string
  readonly look: string
  readonly strike?: string
}
interface CreatureContent {
  species: SpeciesRow
  strikes: StrikeRows[]
  items: NonNullable<ShardItems['catalogue']>
}
const plain = { boar, bear }

/** Copy shipped gameplay layers; the caller supplies its own species and look ids. */
function commonCreature(
  kind: CommonCreatureKind,
  options: Readonly<CreatureOptions>,
): CreatureContent {
  return copyCreature(plain[kind], options, 'charge')
}

function deerCreature(
  options: Readonly<Omit<CreatureOptions, 'strike'>>,
): CreatureContent {
  return copyCreature(deer, options, 'bite')
}

function wolfCreature(options: Readonly<CreatureOptions>): CreatureContent {
  return copyCreature(wolf, options, 'bite')
}

interface PlainCreature {
  readonly species: {
    readonly body: object
    readonly abilities?: readonly { readonly use: string }[]
  }
  readonly strikes: readonly { readonly id: string }[]
}

function copyCreature(
  content: PlainCreature,
  options: Readonly<CreatureOptions>,
  action: string,
): CreatureContent {
  const strikeId = options.strike ?? `${options.id}.${action}`
  const rows = parseRows({
    strikes: content.strikes.map(strike => ({
      ...structuredClone(strike),
      id: strikeId,
    })),
    weather: [],
    days: [],
    compendiums: [],
    loot: [],
    species: [
      {
        ...content.species,
        id: options.id,
        body: { ...content.species.body, look: options.look },
        ...(content.species.abilities === undefined
          ? {}
          : {
              abilities: content.species.abilities.map(ability => ({
                ...structuredClone(ability),
                use: strikeId,
              })),
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
  return {
    species,
    strikes: rows.strikes,
    items: legacyHarvestItems((species.harvest ?? []).map(row => row.item)),
  }
}

export { commonCreature, deerCreature, wolfCreature }
export type { CommonCreatureKind, CreatureOptions, CreatureContent }
