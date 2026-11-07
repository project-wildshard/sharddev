import * as v from 'valibot';
import { ClientScriptsSchema as schema, parseClientScripts as parse, clientScriptViewCost as viewCost, type ShardClientScripts as Data } from '@wildshard/format/clientScripts';
/** Strict presentation-only module/target declarations, with bounded pose and particle recipes. */
export const ClientScriptsSchema: v.SchemaWithPipe<readonly [typeof schema]> = v.pipe(schema);
/** Data-only author contract for isolated client scripts. */
export type ShardClientScripts = Data;
/** Parse bounded visual commands and copied state-read selections. */
export function parseClientScripts(input: unknown): Data { return parse(input); }
/** Exact bounded particle-pool resident cost to include in the authored library budget. */
export function clientScriptViewCost(data: Data): ReturnType<typeof viewCost> { return viewCost(data); }
