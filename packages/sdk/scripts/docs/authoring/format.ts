import { Director } from '@wildshard/sdk/director';
import { DirectorStagesSchema, parseDirectorStages } from '@wildshard/format/directorStages';
import { formatJsonSchema, schemaAt, schemaDeclaration } from '@wildshard/sdk/formatJsonSchema';
import { ShardfileSchema } from '@wildshard/format/shardSchema';

/** A structural editor schema plus the defining admission verdict for Template 1's first stage. */
export function formatExample() {
  const row = new Director({ id: 'template.door-wave', inputs: {}, stages: [{ id: 'door' }] }).toJSON();
  const declaration = schemaDeclaration(ShardfileSchema);
  const spawn = schemaAt(declaration, '/properties/spawn/wrapped/properties');
  const ui = schemaAt(declaration, '/properties/ui');
  return { schema: formatJsonSchema(DirectorStagesSchema), declaration, spawn, ui, row: parseDirectorStages(row) };
}
