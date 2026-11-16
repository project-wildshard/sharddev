import { CreatureAbilitySchema } from '@wildshard/shard-format/creatureLayers'
import { RowsSchema } from '@wildshard/shard-format/rows'
import { parse, strictObject } from 'valibot'

import bite from '../content/abilities/bite.json' with { type: 'json' }
import charge from '../content/abilities/charge.json' with { type: 'json' }
import claw from '../content/abilities/claw.json' with { type: 'json' }
import slam from '../content/abilities/slam.json' with { type: 'json' }
import swing from '../content/abilities/swing.json' with { type: 'json' }

import type { CreatureAbility } from '@wildshard/shard-format/creatureLayers'
import type { StrikeRows } from '@wildshard/shard-format/rows'
import type { GenericSchema } from 'valibot'

interface AbilityTemplate {
  ability: CreatureAbility
  strike: StrikeRows
}
interface AbilityOptions {
  readonly id?: string
  readonly damage?: number
  readonly range?: number
  readonly cooldown?: number
  readonly weight?: number
  readonly hpBelow?: number
}
type AbilityName = 'bite' | 'claw' | 'swing' | 'charge' | 'slam'
type AbilityHelper = (options?: Readonly<AbilityOptions>) => AbilityTemplate
const plain = { bite, claw, swing, charge, slam }
const ROW_ENTRIES = 2
const ARRAY_SCHEMA = 0
const StrikeSchema =
  RowsSchema.pipe[ROW_ENTRIES].entries.strikes.pipe[ARRAY_SCHEMA].item
const TemplateSchema: GenericSchema<AbilityTemplate> = strictObject({
  ability: CreatureAbilitySchema,
  strike: StrikeSchema,
})

function strikeOverrides(
  options: Readonly<AbilityOptions>,
): Partial<StrikeRows> {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.damage === undefined ? {} : { damage: options.damage }),
    ...(options.range === undefined ? {} : { range: options.range }),
    ...(options.cooldown === undefined ? {} : { cooldown: options.cooldown }),
    ...(options.weight === undefined ? {} : { weight: options.weight }),
  }
}
function abilityOverrides(
  options: Readonly<AbilityOptions>,
): Partial<CreatureAbility> {
  return {
    ...(options.id === undefined ? {} : { use: options.id }),
    ...(options.range === undefined ? {} : { range: options.range }),
    ...(options.cooldown === undefined ? {} : { cooldown: options.cooldown }),
    ...(options.weight === undefined ? {} : { weight: options.weight }),
    ...(options.hpBelow === undefined ? {} : { hpBelow: options.hpBelow }),
  }
}
/** Helpers return the strike row and its priority-list reference together. */
function ability(
  name: AbilityName,
  options: Readonly<AbilityOptions> = {},
): AbilityTemplate {
  const row = parse(TemplateSchema, plain[name])
  return parse(TemplateSchema, {
    ability: { ...row.ability, ...abilityOverrides(options) },
    strike: { ...row.strike, ...strikeOverrides(options) },
  })
}
const abilities: Readonly<Record<AbilityName, AbilityHelper>> = {
  bite: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('bite', options),
  claw: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('claw', options),
  swing: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('swing', options),
  charge: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('charge', options),
  slam: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('slam', options),
}

export { abilities }
export type { AbilityOptions, AbilityTemplate, AbilityHelper, AbilityName }
