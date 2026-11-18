import {
  CreatureAbilitySchema,
  type CreatureAbility,
} from '@wildshard/shard-format/creatureLayers'
import { RowsSchema, type StrikeRows } from '@wildshard/shard-format/rows'
import { parse, strictObject } from 'valibot'

import bite from '../content/abilities/bite.json' with { type: 'json' }
import breath from '../content/abilities/breath.json' with { type: 'json' }
import charge from '../content/abilities/charge.json' with { type: 'json' }
import claw from '../content/abilities/claw.json' with { type: 'json' }
import shoot from '../content/abilities/shoot.json' with { type: 'json' }
import slam from '../content/abilities/slam.json' with { type: 'json' }
import spit from '../content/abilities/spit.json' with { type: 'json' }
import swing from '../content/abilities/swing.json' with { type: 'json' }
import thrown from '../content/abilities/throw.json' with { type: 'json' }

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
type AbilityName = keyof typeof plain
type AbilityHelper = (options?: Readonly<AbilityOptions>) => AbilityTemplate
const plain = {
  bite,
  claw,
  swing,
  charge,
  slam,
  breath,
  shoot,
  spit,
  throw: thrown,
}
const ROW_ENTRIES = 2
const ARRAY_SCHEMA = 0
const StrikeSchema =
  RowsSchema.pipe[ROW_ENTRIES].entries.strikes.pipe[ARRAY_SCHEMA].item
const TemplateSchema = strictObject({
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
  breath: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('breath', options),
  shoot: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('shoot', options),
  spit: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('spit', options),
  throw: (options?: Readonly<AbilityOptions>): AbilityTemplate =>
    ability('throw', options),
}

export { abilities }
export type { AbilityOptions, AbilityTemplate, AbilityHelper, AbilityName }
