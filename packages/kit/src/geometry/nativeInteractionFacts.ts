import { BARREL_BODY } from './sharedSpecs.ts'

/** The defining native puzzle barrel's complete physical declaration, without
 * constructing a body, watch, query or live interaction owner. */
export function puzzleBarrelBody(): typeof BARREL_BODY {
  return BARREL_BODY
}
