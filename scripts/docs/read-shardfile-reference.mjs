// Runs only in the existing plain-Node schema loader, with no app/session/world allocation.
import { ShardfileSchema } from '@wildshard/format/shardSchema';
import { SCRIPT_ABI, SCRIPT_IMPORTS, SCRIPT_EXPORTS } from '@wildshard/format/scriptAbi';
import { schemaInventory, abiInventory } from './schema-reference.mjs';
import { sdkSchemaInventory, formatSchemaInventory } from './sdk-schemas.mjs';
import { resolve } from 'node:path';

const fields = [...schemaInventory(ShardfileSchema), ...await sdkSchemaInventory(resolve(import.meta.dirname, '../..')), ...await formatSchemaInventory(resolve(import.meta.dirname, '../..'))];
process.stdout.write(JSON.stringify({ fields, abi: abiInventory(SCRIPT_IMPORTS, SCRIPT_EXPORTS), contract: SCRIPT_ABI }));
