import { generate as generatePastel } from './generators/generate';

/** The source program supplies actual bytes and rows, without intermediary source files. */
export const generate: typeof generatePastel = generatePastel;
// oxlint-disable-next-line import/no-default-export -- The author CLI executes this project entry.
export default generate;

/** Explicit standalone author-source ceiling; this project has no frozen legacy denominator. */
export const buildOptions = { asLineCeiling: 256 };
