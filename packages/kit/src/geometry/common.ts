import { Rng, type RngState } from '@wildshard/sdk/random'

import { commonSpeciesRows } from '../species.ts'
import { BEAR_LOOK } from './bear.ts'
import { BOAR_LOOK } from './boar.ts'

import type { AnimalSpecies, VariantDef } from './types.ts'

export type CommonBodyKind = 'boar' | 'bear'
const looks = { boar: BOAR_LOOK, bear: BEAR_LOOK }
/** Authored shape and palette controls in the original gameplay order. */
export function commonBodyVariants(kind: CommonBodyKind): VariantDef[] {
  return commonSpeciesRows(kind, `kit.creature.${kind}`).variants.map(
    ({ id }) => {
      const variant: VariantDef = {
        id,
        label: id,
        weight: 1,
        rarity: 'common',
        scale: [1, 1],
      }
      return Object.assign(
        variant,
        structuredClone(looks[kind].variants?.[id] ?? {}),
      )
    },
  )
}
/** The author owns the body and the exact next random continuation. */
export function bakeCommonBody(
  kind: CommonBodyKind,
  variant: VariantDef,
  state: RngState,
): { body: AnimalSpecies; random: RngState } {
  const rng = new Rng(0)
  rng.restore(state)
  return { body: looks[kind].build(variant, rng), random: rng.snapshot() }
}
export { BOAR_LOOK } from './boar.ts'
export { BEAR_LOOK } from './bear.ts'
export { withBodyGeometry } from './loft.ts'
export type {
  AnimalSpecies,
  AnimalDims,
  BoneDef,
  VariantDef,
  CommonLook,
  FurStyle,
} from './types.ts'
