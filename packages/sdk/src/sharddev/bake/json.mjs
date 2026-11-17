// Emit one retained authoring function's JSON or explicit byte product. I/O belongs to this Node driver.
// node --import ./src/sharddev/bake/source-loader.mjs src/sharddev/bake/json.mjs <entry> <exported-function> <output>
// oxlint-disable-next-line import/no-nodejs-modules -- Only the build driver writes the generated JSON output.
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Source and output paths must stay in the isolated tree.
import { dirname, isAbsolute, resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Import the explicitly named retained authoring recipe.
import { pathToFileURL } from 'node:url';
// oxlint-disable-next-line import/no-nodejs-modules -- This executable reads its explicit producer arguments.
import process from 'node:process';
import { assertJsonRows, jsonOutputGuard } from '@wildshard/engine/scripts/json-output-guard.mjs';

const args = process.argv.slice(2);
const entry = args.at(0), binding = args.at(1), output = args.at(2);
const binary = args.length === 4 && args.at(3) === '--bytes';
const multiple = args.length === 4 && args.at(3) === '--files';
if ((!binary && !multiple && args.length !== 3) || entry === undefined || binding === undefined || output === undefined) throw new Error('generate-json: entry, function and output required');
const root = process.cwd(), guard = jsonOutputGuard(root), sourceOwner = entry.split('/').at(2);
/** Restrict source and destination to explicit regular paths in the isolated generation tree. @param {string} path */
function confined(path) {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(part => part === '' || part === '.' || part === '..')) throw new Error('generate-json: path must stay inside the generation tree');
  const parts = path.split('/');
  for (let length = 1; length <= parts.length; length++) {
    const prefix = resolve(root, ...parts.slice(0, length));
    try {
      // Canonical existing prefixes need only exact path probes, not ancestor
      // metadata reads that look like recursive content scans to the recorder.
      if (realpathSync.native(prefix) !== prefix) throw new Error('generate-json: symlink refused');
    } catch (error) {
      // A dangling or looping link cannot canonicalize. Retain the original
      // lstat refusal before accepting any missing output path.
      try { if (lstatSync(prefix).isSymbolicLink()) throw new Error('generate-json: symlink refused', { cause: error }); }
      catch (statError) { if (!(statError instanceof Error && 'code' in statError && statError.code === 'ENOENT')) throw statError; }
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) throw new Error('generate-json: escaping path refused');
  return target;
}
const source = confined(entry), destination = confined(output);
/** @type {unknown} */
const author = await import(pathToFileURL(source).href);
if (author === null || typeof author !== 'object' || !(binding in author)) throw new Error('generate-json: named authoring function required');
const generate = Reflect.get(author, binding);
if (typeof generate !== 'function') throw new Error('generate-json: named authoring function required');
/** Byte recipes receive only a confined, read-only asset reader. @param {string} url */
function readAsset(url) {
  if (typeof url !== 'string' || !url.startsWith('/assets/')) throw new Error('generate-json: asset URL required');
  return new Uint8Array(readFileSync(confined(`public${url}`)));
}
/** An author-only file recipe reads only its own explicit authored files, never trusted runtime or another shard.
 * @param {string} path */
function readSource(path) {
  const owner = sourceOwner, parts = typeof path === 'string' ? path.split('/') : [];
  if (owner === undefined || parts.at(0) !== 'src' || parts.at(1) !== 'shards' || parts.at(2) !== owner || !['generators', 'data', 'assets', 'quests', 'behaviour', 'blender'].includes(parts.at(3) ?? '')) throw new Error('generate-json: own authored input required');
  return new Uint8Array(readFileSync(confined(path)));
}
/** @type {unknown} */
const value = binary ? await generate(readAsset) : multiple ? await generate(readSource) : await generate();
if (multiple) {
  const owner = entry.split('/').at(2), project = `src/shards/${owner}`;
  if (owner === undefined || !entry.startsWith(`${project}/generators/`) || output !== project || !(value instanceof Map) || value.size === 0 || value.size > 512) throw new Error('generate-json: bounded own-project file map required');
  /** @type {[string, Uint8Array][]} */
  const files = [];
  // Admit every path and byte value before writing any output.
  for (const item of value.entries()) {
    /** @type {unknown} */
    const name = item[0], bytes = item[1];
    if (typeof name !== 'string' || !(bytes instanceof Uint8Array) || bytes.length > 25_000_000) throw new Error('generate-json: relative byte outputs required');
    const path = confined(`${output}/${name}`); guard(path, bytes); files.push([path, bytes]);
  }
  for (const [path, bytes] of files) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
} else if (binary) {
  if (!(value instanceof Uint8Array)) throw new Error('generate-json: byte recipe must return Uint8Array');
  guard(destination, value);
  mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, value);
} else {
if (value === undefined || typeof value === 'function' || typeof value === 'symbol') throw new Error('generate-json: authoring function returned no JSON data');
assertJsonRows(value, output);
const bytes = JSON.stringify(value); guard(destination, bytes);
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${bytes}\n`);
}
