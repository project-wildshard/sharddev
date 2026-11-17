// Emit a declared navigation asset through an explicit shard-owned bake function. I/O stays in the SDK driver.
// oxlint-disable-next-line import/no-nodejs-modules -- The isolated SDK build driver owns navigation file I/O.
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Confine source and output paths to the author tree.
import { dirname, isAbsolute, resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Load the explicit shard authoring function.
import { pathToFileURL } from 'node:url';
// oxlint-disable-next-line import/no-nodejs-modules -- Read explicit producer arguments.
import process from 'node:process';
import { parseNavigation, readNavigation } from '@wildshard/format/navigation';
import { hashImmutableBytes } from '../immutable';

const entry = process.argv.at(2), input = process.argv.at(3), output = process.argv.at(4), assets = process.argv.at(5);
if (process.argv.length !== 6 || entry === undefined || input === undefined || output === undefined || assets === undefined) throw new Error('Navigation driver requires entry, source bytes, metadata and asset folder');
const root = process.cwd(), owner = /^src\/shards\/([^/]+)\/generators\//u.exec(entry)?.[1];
if (owner === undefined) throw new Error('Navigation entry requires a shard-owned generator');
/** Confine every driver path to regular source/output paths in the isolated authoring tree. @param {string} path */
function confined(path) {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(part => part === '' || part === '.' || part === '..')) throw new Error('Navigation driver path escapes the author tree');
  const parts = path.split('/');
  for (let length = 1; length <= parts.length; length++) {
    try { if (lstatSync(resolve(root, ...parts.slice(0, length))).isSymbolicLink()) throw new Error('Navigation driver symlink refused'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const result = resolve(root, path); if (!result.startsWith(root + sep)) throw new Error('Navigation driver path escapes'); return result;
}
const author = await import(pathToFileURL(confined(entry)).href);
if (typeof author.navigationProduct !== 'function') throw new Error('Navigation author function missing');
const original = new Uint8Array(readFileSync(confined(input)));
const result = author.navigationProduct(original), navigation = parseNavigation(result.shardfile.navigation);
readNavigation(navigation, original);
if (hashImmutableBytes(original) !== navigation.file || !(result.assets instanceof Map) || result.assets.size !== 1) throw new Error('Navigation author must preserve original immutable bytes');
const bytes = result.assets.get(navigation.file);
if (!(bytes instanceof Uint8Array) || hashImmutableBytes(bytes) !== navigation.file) throw new Error('Navigation author changed bytes');
const metadata = confined(output), folder = confined(assets);
mkdirSync(dirname(metadata), { recursive: true }); mkdirSync(folder, { recursive: true });
writeFileSync(metadata, `${JSON.stringify({ navigation, url: `/assets/baked/${owner}/navmesh.bin`, files: result.shardfile.files, critical: result.shardfile.critical })}\n`);
writeFileSync(resolve(folder, navigation.file), bytes);
