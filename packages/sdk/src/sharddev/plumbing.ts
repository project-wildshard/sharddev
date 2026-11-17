import * as v from 'valibot';
import { PlumbingSchema as schema, type PlumbingData as Data } from '@wildshard/format/plumbing';
/** Validate declared input contexts, tier knobs and Debug choices for an author project. */
export const PlumbingSchema: v.SchemaWithPipe<readonly [typeof schema]> = v.pipe(schema);
/** The compiled, callback-free scoped plumbing contract. */
export type PlumbingData = Data;
/** Compile author plumbing after checking owned identities and hook references. */
export function parsePlumbing(input: unknown): Data { return v.parse(PlumbingSchema, input); }
