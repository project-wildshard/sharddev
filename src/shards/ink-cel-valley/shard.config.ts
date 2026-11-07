import { generate as generateInk } from './generators/generate';

/** One source program owns the declaration and its map (GR9). */
export const generate: typeof generateInk = generateInk;
// oxlint-disable-next-line import/no-default-export -- The documented author entry is the source program.
export default generate;

/** Explicit standalone author-source ceiling; this project has no frozen legacy denominator. */
export const buildOptions = { asLineCeiling: 256 };
