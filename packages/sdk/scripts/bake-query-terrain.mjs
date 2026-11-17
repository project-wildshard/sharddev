#!/usr/bin/env node
// G384: emit a shard's query-only terrain (`form: 'query'`) through its explicit shard-owned author function, which wraps
// the SDK's `bakeQueryTerrain` over its retained bare WSTR lattice. File I/O stays here, never in shard authoring code.
//   node scripts/bake-query-terrain.mjs <entry> <function> <lattice> <metadata> <assets> [--check]
// <metadata> receives `{ terrain, files, critical }`; <assets>/<hash> receives each charged file, named by its content hash.
import '@wildshard/engine/scripts/format-hook.mjs';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const check = process.argv.includes('--check'), args = process.argv.slice(2).filter(arg => arg !== '--check');
const entry = args.at(0), binding = args.at(1), lattice = args.at(2), metadata = args.at(3), assets = args.at(4);
if (args.length !== 5 || entry === undefined || binding === undefined || lattice === undefined || metadata === undefined || assets === undefined) {
  throw new Error('bake-query-terrain: entry, function, lattice, metadata and asset folder required');
}
const root = process.cwd();
/** Confine every path to regular files in the repository tree. @param {string} path */
function confined(path) {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(part => part === '' || part === '.' || part === '..')) throw new Error(`bake-query-terrain: path escapes the tree: ${path}`);
  const parts = path.split('/');
  for (let length = 1; length <= parts.length; length++) {
    const at = resolve(root, ...parts.slice(0, length));
    if (existsSync(at) && lstatSync(at).isSymbolicLink()) throw new Error(`bake-query-terrain: symlink refused: ${path}`);
  }
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) throw new Error(`bake-query-terrain: path escapes the tree: ${path}`);
  return target;
}
const owner = /^src\/shards\/([^/]+)\/generators\//u.exec(entry)?.[1];
if (owner === undefined || !metadata.startsWith(`src/shards/${owner}/`) || assets !== `src/shards/${owner}/assets`) throw new Error('bake-query-terrain: a shard-owned generator writes only its own shard');
// Authoring resolution only (the SDK source loader's law, without engine, game or app identity): extensionless TS imports,
// and nothing outside sdk, commons, format and this shard's author folders.
const folders = new Set(['generators', 'data', 'quests', 'blender', 'assets', 'behaviour']);
registerHooks({ resolve(specifier, context, next) {
  const relativeTs = specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[cm]?[jt]s$/u.test(specifier);
  const result = relativeTs && existsSync(fileURLToPath(new URL(`${specifier}.ts`, context.parentURL)))
    ? { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true } : next(specifier, context);
  if (result.url.startsWith('file:')) {
    const parts = relative(root, fileURLToPath(result.url)).split(sep);
    if (parts[0] === 'src' && (parts.includes('runtime') || (parts[1] === 'shards' ? parts[2] !== owner || !folders.has(parts[3] ?? '') : !['sdk', 'sharddev', 'commons', 'format'].includes(parts[1] ?? '')))) {
      throw new Error(`bake-query-terrain: non-authoring dependency refused: ${parts.join('/')}`);
    }
  }
  return result;
} });
const author = await import(pathToFileURL(confined(entry)).href);
const bake = author[binding];
if (typeof bake !== 'function') throw new Error(`bake-query-terrain: ${entry} exports no ${binding}`);
const product = bake(new Uint8Array(readFileSync(confined(lattice))));
if (product?.terrain?.form !== 'query' || !(product.assets instanceof Map) || product.assets.size !== product.files.length) throw new Error('bake-query-terrain: the author must return one query terrain product');
const outputs = new Map([[metadata, Buffer.from(`${JSON.stringify({ terrain: product.terrain, files: product.files, critical: product.critical })}\n`)]]);
for (const [hash, bytes] of product.assets) {
  if (!(bytes instanceof Uint8Array) || createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('bake-query-terrain: asset differs from its hash');
  outputs.set(`${assets}/${hash}`, Buffer.from(bytes));
}
for (const [file, bytes] of outputs) {
  const path = confined(file);
  if (check) {
    if (!existsSync(path) || !readFileSync(path).equals(bytes)) throw new Error(`bake-query-terrain: stale output ${file}`);
  } else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
}
console.info(`bake-query-terrain: ${owner} query sampling ${product.critical.join(', ')}`);
