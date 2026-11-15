import type { ProductFile, ShardProductInput } from '@wildshard/engine/game/shardfile/shardProduct';
import { nodeNamedJsonCheck } from '@wildshard/engine/game/shardfile/outputChecksNode';
import { registeredJsonSchema } from '../../src/sharddev/formatJsonSchema';

/** The public native validator retains every named-JSON check in fixture products. */
export const fixtureJsonCheck: NonNullable<ShardProductInput['jsonCheck']> = nodeNamedJsonCheck;

/** Attach registered metadata without replacing explicit schemas or verified readers. */
export function fixtureProductFile(name: string, file: ProductFile): ProductFile {
  if (file.jsonSchema !== undefined) return file;
  const jsonSchema = registeredJsonSchema(name);
  return jsonSchema === undefined ? file : { ...file, jsonSchema };
}
