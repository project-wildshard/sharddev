import { Rng } from '@wildshard/sdk/random'
import {
  HullSpeciesSchema,
  type HullSpeciesRows,
} from '@wildshard/shard-format/speciesLooks'
import * as v from 'valibot'

import {
  BEAR_LOOK,
  BOAR_LOOK,
  bakeCommonBody,
  commonBodyVariants,
  commonSpeciesRows,
  withBodyGeometry,
  type CommonBodyKind,
} from './species.ts'

/** Complete native look metadata, independent of the runtime registry. */
export function commonHullSpecies(
  kind: CommonBodyKind,
  speciesId: string,
): HullSpeciesRows {
  const look = kind === 'boar' ? BOAR_LOOK : BEAR_LOOK
  const metadata = commonSpeciesRows(kind, speciesId)
  const variant = commonBodyVariants(kind)[0]
  if (variant === undefined) throw new Error('Missing native kit variant')
  const { body } = withBodyGeometry(false, {}, () =>
    bakeCommonBody(kind, variant, new Rng(42).snapshot()),
  )
  try {
    return v.parse(HullSpeciesSchema, {
      ...metadata,
      rigContract: structuredClone(look.rigContract),
      fur: structuredClone(look.fur),
      pose: structuredClone(look.pose),
      variants: metadata.variants.map(row =>
        Object.assign(
          structuredClone(row),
          structuredClone(look.variants?.[row.id] ?? {}),
        ),
      ),
      body: {
        bones: structuredClone(body.bones),
        dims: structuredClone(body.dims),
        furParts: [],
        hardParts: [],
        eyeParts: [],
      },
    })
  } finally {
    for (const part of [...body.furParts, ...body.hardParts, ...body.eyeParts])
      part.dispose()
  }
}
