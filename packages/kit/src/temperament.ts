import {
  CreatureTemperamentSchema,
  CreatureSensesSchema,
} from '@wildshard/shard-format/creatureLayers'
import { parse, strictObject } from 'valibot'

import plain from '../content/temperaments.json' with { type: 'json' }

import type {
  CreatureSenses,
  CreatureTemperament,
} from '@wildshard/shard-format/creatureLayers'
import type { GenericSchema } from 'valibot'

interface TemperamentProfile {
  temperament: CreatureTemperament
  senses: CreatureSenses
}
interface TemperamentOptions {
  readonly aggro?: number
  readonly leash?: number
  readonly assist?: number
  readonly homeSpeed?: number
  readonly homeStop?: number
}
type PresetName =
  | 'passive'
  | 'skittish'
  | 'neutral'
  | 'aggressive'
  | 'pack'
  | 'territorial'
  | 'ambush'
  | 'flee'
  | 'pursue'
type TemperamentHelper = (
  options?: Readonly<TemperamentOptions>,
) => TemperamentProfile
const ProfileSchema: GenericSchema<TemperamentProfile> = strictObject({
  temperament: CreatureTemperamentSchema,
  senses: CreatureSensesSchema,
})

function override(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  return value
}

/** JSON is the catalogue; helpers apply explicit numeric overrides to fresh rows. */
function profile(
  name: PresetName,
  options: Readonly<TemperamentOptions> = {},
): TemperamentProfile {
  const row = parse(ProfileSchema, plain[name])
  return parse(ProfileSchema, {
    temperament: {
      ...row.temperament,
      leash: override(options.leash, row.temperament.leash),
      assist: override(options.assist, row.temperament.assist),
      home: {
        speed: override(options.homeSpeed, row.temperament.home.speed),
        stop: override(options.homeStop, row.temperament.home.stop),
      },
    },
    senses: {
      ...row.senses,
      notice: override(options.aggro, row.senses.notice),
    },
  })
}

const temperament: Readonly<Record<PresetName, TemperamentHelper>> = {
  passive: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('passive', options),
  skittish: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('skittish', options),
  neutral: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('neutral', options),
  aggressive: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('aggressive', options),
  pack: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('pack', options),
  territorial: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('territorial', options),
  ambush: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('ambush', options),
  flee: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('flee', options),
  pursue: (options?: Readonly<TemperamentOptions>): TemperamentProfile =>
    profile('pursue', options),
}

export { temperament }
export type {
  TemperamentOptions,
  TemperamentProfile,
  TemperamentHelper,
  PresetName,
}
