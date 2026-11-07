import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { jsonOutputGuard } from '@wildshard/engine/scripts/json-output-guard.mjs';

/** Keep PNG bytes outside JSON during the native painter's process handoff.
 * @param {string} manifest
 * @param {ReadonlyArray<{readonly url:string;readonly png:Uint8Array}>} coats */
export function writeCoatFiles(manifest, coats) {
  const directory = `${basename(manifest)}.pngs`;
  mkdirSync(resolve(dirname(manifest), directory), { recursive: true });
  const rows = coats.map((coat, index) => {
    const png = `${directory}/${index}.png`;
    writeFileSync(resolve(dirname(manifest), png), coat.png);
    return { url: coat.url, png };
  });
  const wire = JSON.stringify(rows);
  jsonOutputGuard(dirname(manifest))(manifest, wire);
  writeFileSync(manifest, wire);
}

/** Read only the exact ordered files owned by this handoff, never an encoded
 * fallback or a path outside its scratch directory.
 * @param {string} manifest */
export function readCoatFiles(manifest) {
  /** @type {unknown} */
  const input = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(input)) throw new Error('Invalid coat file manifest');
  const root = realpathSync(dirname(manifest));
  return input.map((/** @type {unknown} */ row, index) => {
    if (typeof row !== 'object' || row === null || Object.keys(row).length !== 2
      || !('url' in row) || typeof row.url !== 'string' || !('png' in row)
      || row.png !== `${basename(manifest)}.pngs/${index}.png`) throw new Error('Invalid coat file manifest');
    const file = resolve(root, row.png);
    if (realpathSync(file) !== file) throw new Error('Coat file escapes its handoff');
    return { url: row.url, png: readFileSync(file) };
  });
}
