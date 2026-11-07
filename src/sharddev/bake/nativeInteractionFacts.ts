import { BARREL_BODY } from '@wildshard/engine/world/interact/barrel';

/** The defining native puzzle barrel's complete physical declaration, without
 * constructing a body, watch, query or live interaction owner. */
export function puzzleBarrelBody(): typeof BARREL_BODY { return BARREL_BODY; }
