import type { FolderFile, ShardFolderInput } from '@wildshard/engine/game/shardfile/shardFolder';
import { nodeNamedJsonCheck } from '@wildshard/engine/game/shardfile/outputChecksNode';
import { registeredJsonSchema } from '../../src/sharddev/formatJsonSchema';

/** The public native validator retains every named-JSON check in fixture products. */
export const fixtureJsonCheck: NonNullable<ShardFolderInput['jsonCheck']> = nodeNamedJsonCheck;

/** Attach registered metadata without replacing explicit schemas or verified readers. */
export function fixtureProductFile(name: string, file: FolderFile): FolderFile {
  if (file.jsonSchema !== undefined) return file;
  const jsonSchema = registeredJsonSchema(name);
  return jsonSchema === undefined ? file : { ...file, jsonSchema };
}

/** Exercise the public native checker, including its real paced cache and cancellation. */
export function fixtureNativeJson(schema: Readonly<Record<string, unknown>>, bytes: Uint8Array, pause: () => Promise<void> = () => Promise.resolve()): Promise<unknown> {
  return nodeNamedJsonCheck(schema, bytes, pause);
}
