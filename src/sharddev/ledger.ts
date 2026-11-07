import * as v from 'valibot';
import { LedgerFactSchema as factSchema, LedgerRulesSchema as rulesSchema, parseLedgerRules as parseRules, type LedgerFact as Fact, type LedgerRule as Rule } from '@wildshard/format/ledger';

/** Compile a host-witnessed fact with placement identity and provenance. */
export const LedgerFactSchema: v.SchemaWithPipe<readonly [typeof factSchema]> = v.pipe(factSchema);
/** Compile profile reward mappings; coins and unreviewed local items stay outside the travelling profile. */
export const LedgerRulesSchema: v.SchemaWithPipe<readonly [typeof rulesSchema]> = v.pipe(rulesSchema);
/** The compiled fact contract consumed by the platform ledger. */
export type LedgerFact = Fact;
/** One declared fact-to-platform reward mapping. */
export type LedgerRule = Rule;
/** Validate ledger declarations in an author project before writing its shardfile. */
export function parseLedgerRules(input: unknown): Rule[] { return parseRules(input); }
