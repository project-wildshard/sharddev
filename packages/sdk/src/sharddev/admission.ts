import { SHARDFILE_ADMISSION_LIMITS as gameLimits } from '@wildshard/format/admissionLimits';
import { preflightShardfile as preflight } from '@wildshard/format/preflight';

/** Shared source, collection, identifier, text and distinct wire ceilings for author output and client intake. */
export const SHARDFILE_ADMISSION_LIMITS: Readonly<{ sourceBytes: 2000000; files: 4096; commons: 1024; stateFields: 128; waterBodies: 64; idCharacters: 128; textCharacters: 4096; wireBytes: 256000000; }> = Object.freeze({ ...gameLimits });
/** Check bounded plain JSON and declared wire totals before opening any immutable asset. Full validation follows separately. */
export function preflightShardfile(input: unknown): void { preflight(input); }
