import {
  CreatureTypeSchema,
  CreatureTemperamentSchema,
  CreatureSensesSchema,
  CreaturePresentationSchema,
  type CreatureTemperament,
  type CreatureSenses,
  type CreaturePresentation,
  type CreatureType,
} from '@wildshard/shard-format/creatureLayers'
import { HuntTuningSchema } from '@wildshard/shard-format/speciesPrograms'
import { parse, strictObject, type GenericSchema } from 'valibot'

import bear from '../content/species/bear.json' with { type: 'json' }
import boar from '../content/species/boar.json' with { type: 'json' }
import deerTuning from '../content/tuning/deer.json' with { type: 'json' }
import pursue from '../content/tuning/pursue.json' with { type: 'json' }

/** Build-only compatibility content; running creatures never choose a kit preset by kind. */
export interface LegacyCreatureProfile {
  type: CreatureType
  temperament: CreatureTemperament
  senses: CreatureSenses
  presentation: CreaturePresentation
}
const ProfileSchema: GenericSchema<LegacyCreatureProfile> = strictObject({
  type: CreatureTypeSchema,
  temperament: CreatureTemperamentSchema,
  senses: CreatureSensesSchema,
  presentation: CreaturePresentationSchema,
})
function hunt(
  tuning: unknown,
  reaction: CreatureTemperament['reaction'],
  sounds: CreaturePresentation['sounds'],
): LegacyCreatureProfile {
  const numbers = parse(HuntTuningSchema, tuning)
  return {
    type: 'beast',
    temperament: {
      brain: 'hunt',
      reaction,
      leash: numbers.fleeUntilMax,
      assist: numbers.herdAlertRadius,
      home: { speed: numbers.trotSpeed, stop: 1.5 },
      tuning: numbers,
    },
    senses: {
      notice: numbers.sightRange,
      sight: {
        range: numbers.sightRange,
        cone: numbers.sightCone,
        graze: numbers.sightRangeGraze,
      },
      hearing: {
        still: numbers.hearStill,
        crouch: numbers.hearCrouch,
        walk: numbers.hearWalk,
        sprint: numbers.hearSprint,
      },
    },
    presentation: { blood: true, sounds },
  }
}
const profiles: ReadonlyMap<string, LegacyCreatureProfile> = new Map([
  ['boar', hunt(boar.tuning, 'aggressive', boar.sounds)],
  ['bear', hunt(bear.tuning, 'aggressive', bear.sounds)],
  [
    'deer',
    hunt(deerTuning, 'skittish', { call: 'deer_call', hurt: 'deer_call' }),
  ],
  [
    'greyBlob',
    {
      type: 'aberration',
      temperament: {
        brain: 'pursue',
        reaction: 'aggressive',
        leash: pursue.leashRadius,
        assist: 0,
        home: { speed: pursue.returnSpeed, stop: pursue.stopDistance },
        tuning: pursue,
      },
      senses: { notice: pursue.awareRadius },
      presentation: { blood: true, sounds: {} },
    },
  ],
])

/** A fresh validated compatibility profile for an old source label, or no implicit expansion. */
export function legacyCreatureProfile(
  kind: string,
): LegacyCreatureProfile | undefined {
  const profile = profiles.get(kind)
  return profile === undefined ? undefined : parse(ProfileSchema, profile)
}
