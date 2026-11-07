import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { nameBlobBytes } from '@wildshard/sharddev/blobBytes';
import { validateNamedJson } from '@wildshard/sharddev/schemaValidation';
import { byteWriter } from '@wildshard/engine/scripts/bake-output.mjs';

const requireSchema = createRequire(new URL('../src/sharddev/package.json', import.meta.url));
/** @param {Uint8Array} schemaBytes @param {Uint8Array} bytes */
function validateJson(schemaBytes, bytes) {
  const Ajv = /** @type {Parameters<typeof validateNamedJson>[2]} */ (requireSchema('ajv'));
  return validateNamedJson(schemaBytes, bytes, Ajv);
}

/** Build-only bridge from a producer's exact bytes to author-project blob inputs.
 * Equal payloads have one canonical logical name; URL aliases never add a second index reference.
 * A bounded assets/ subdirectory isolates producer ownership when payloads also exist in another job.
 * @param {URL} project @param {string} label @param {string} [directory]
 * @returns {ReturnType<import('./named-blob-output.d.mts').namedBlobOutput>} */
export function namedBlobOutput(project, label, directory = 'assets') {
  if (!/^assets(?:\/[A-Za-z0-9_-]+)*$/u.test(directory) || directory.length > 120) throw new Error('Invalid blob source directory');
  const writer = byteWriter(process.argv.includes('--check'), label);
  /** @type {Map<string,NonNullable<import('../src/sharddev/projectOutput').ProjectOutput['blobs']>[number]>} */
  const rows = new Map();
  /** @type {Map<string,string>} */
  const aliases = new Map();
  return {
    add(name, kind, bytes, url, script, jsonSchema) {
      const options = { ...(script === undefined ? {} : { script }), ...(jsonSchema === undefined ? {} : { jsonSchema }) };
      const blob = nameBlobBytes(name, kind, bytes, options, validateJson), old = rows.get(blob.file.hash);
      if (old !== undefined && old.kind !== kind) throw new Error('Blob source changes kind');
      if (old !== undefined && JSON.stringify(old.options?.script) !== JSON.stringify(blob.script)) throw new Error('Blob source changes script contract');
      if (old !== undefined && JSON.stringify(old.options?.jsonSchema) !== JSON.stringify(blob.file.jsonSchema)) throw new Error('Blob source changes JSON schema');
      const row = old ?? { name, kind, source: `${directory}/${blob.file.hash}`, ...(Object.keys(options).length === 0 ? {} : { options }) };
      if (old === undefined && [...rows.values()].some(value => value.name === name)) throw new Error('Duplicate logical blob source name');
      if (url !== undefined && aliases.has(url) && aliases.get(url) !== row.name) throw new Error('Blob URL changes content');
      rows.set(blob.file.hash, row);
      if (url !== undefined) aliases.set(url, row.name);
      writer.put(fileURLToPath(new URL(row.source, project)), blob.bytes);
      return row.name;
    },
    finish(metadata) {
      const blobs = [...rows.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      const byUrl = Object.fromEntries([...aliases].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
      writer.put(fileURLToPath(metadata), `${JSON.stringify({ blobs, byUrl }, null, 2)}\n`);
      writer.finish();
    },
  };
}
