import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatJsonSchemas, namedFormatJsonSchemas } from '@wildshard/engine/host/formatJsonSchema';

/** Build the migrated format documents into an ignored authoring-output folder, never into committed source.
 * @param {string} root
 */
export function writeFormatJsonSchemas(root) {
  const directory = resolve(root, '.wildshard/format');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'named.json'), JSON.stringify(namedFormatJsonSchemas()));
  for (const [name, schema] of Object.entries(formatJsonSchemas())) {
    writeFileSync(resolve(directory, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
  }
}

const invoked = process.argv.at(1);
if (invoked !== undefined && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  writeFormatJsonSchemas(resolve(import.meta.dirname, '..'));
}
