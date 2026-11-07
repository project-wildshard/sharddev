// oxlint-disable-next-line import/no-nodejs-modules -- Native output admission is exercised against real bounded local files.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture stays inside the repository's ignored scratch root.
import { dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Load the real in-memory author build through an owned temporary module.
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { registeredJsonSchema } from '@wildshard/engine/host/formatJsonSchema';
import { build } from 'vite';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { parseOutputIndex } from '@wildshard/format/outputIndex';
import { outputSectionPayloads } from '@wildshard/format/outputFields';
import { loadHeadlessProduct } from '@wildshard/engine/host/headlessProduct';

const bytes = (input: unknown): Uint8Array => new TextEncoder().encode(encodeCanonicalJson(input));
async function nativeReader(mode: 'direct' | 'author-bundle'): Promise<typeof loadHeadlessProduct> {
  if (mode === 'direct') return loadHeadlessProduct;
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent',
    define: { 'import.meta.env.SSR': 'false' },
    build: { write: false, minify: false, lib: { entry: new URL('@wildshard/engine/host/headlessProduct', import.meta.url).pathname, formats: ['es'] },
      rolldownOptions: { platform: 'node', external: [/^node:/u], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing native author bundle');
  const chunks = built.output.filter(row => row.type === 'chunk');
  if (chunks.length !== 1 || chunks[0] === undefined) throw new Error('Expected one native author module');
  await mkdir('tmp', { recursive: true });
  const dir = await mkdtemp(resolve('tmp/headless-reader-')), file = resolve(dir, 'reader.mjs');
  try {
    await writeFile(file, chunks[0].code);
    const loaded: unknown = await import(pathToFileURL(file).href);
    if (!nativeModule(loaded)) throw new Error('Missing native author reader');
    return loaded.loadHeadlessProduct;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
function nativeModule(input: unknown): input is { loadHeadlessProduct: typeof loadHeadlessProduct } {
  return typeof input === 'object' && input !== null && 'loadHeadlessProduct' in input && typeof input.loadHeadlessProduct === 'function';
}
test.each(['direct', 'author-bundle'] as const)('%s native admission supplies checked sections and hash-verified named blobs without a renderer', async mode => {
  const load = await nativeReader(mode);
  await mkdir('tmp', { recursive: true });
  const dir = await mkdtemp(resolve('tmp/headless-product-'));
  const put = async (path: string, wire: Uint8Array): Promise<void> => { const file = resolve(dir, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, wire); };
  try {
    const source = emptyShardfile({ slug: 'native-product', name: 'Native', author: 'Test', revision: 1, seed: 1 });
    const blob = new Uint8Array([1, 2, 3]), hash = hashImmutableBytes(blob);
    source.files.push({ hash, kind: 'binary', compressed: 3, decoded: 3, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: false });
    const json = bytes([{"slot":"shape","channels":[],"file":"models/native.bin"}]), jsonHash = hashImmutableBytes(json);
    source.files.push({ hash: jsonHash, kind: 'json', compressed: json.length, decoded: json.length, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: false });
    source.library.push(hash, jsonHash); source.budgets.library = { compressed: 3 + json.length, resident: 3 + json.length };
    const values = new Map(outputSectionPayloads(source)); values.set('ui/strings', { count: '7' });
    const sections = await Promise.all([...values].map(async ([name, value]) => {
      const wire = bytes(value), path = `sections/${name}.json`; await put(path, wire);
      return { name, path, hash: hashImmutableBytes(wire), bytes: wire.length,
        schema: `wildshard:${name}@1` };
    }));
    const index = parseOutputIndex({ format: 'wildshard.shardfile', formatVersion: 2, sdk: '0.2', version: source.version,
      identity: source.identity, requires: source.requires, build: { sourceHash: hashImmutableBytes(bytes(source)), validator: 'test' },
      admission: { budgets: source.budgets, serverBudget: source.serverBudget, authorCaps: source.authorCaps, critical: source.critical, library: source.library },
      sections, schemas: [],
      files: source.files.map(file => file.hash === hash ? { ...file, kind: 'bin', name: 'models/native.bin', path: `blobs/bin/${hash}.bin` }
        : { ...file, kind: 'json', name: 'models/shape-book.json', path: `blobs/json/${jsonHash}.json`, jsonSchema: registeredJsonSchema('models/shape-book.json') }), runtime: null });
    await put('shard.json', bytes(index)); await put(`blobs/bin/${hash}.bin`, blob);
    await put(`blobs/json/${jsonHash}.json`, json);
    const product = await load(dir);
    expect(product.shardfile).toEqual(source);
    expect(product.section('ui/strings')).toEqual({ count: '7' });
    expect(await product.file('models/native.bin')).toEqual(blob);
    expect(await product.json('models/shape-book.json')).toEqual([{"slot":"shape","channels":[],"file":"models/native.bin"}]);
    const badJsonIndex = structuredClone(index), jsonFile = badJsonIndex.files.find(file => file.name === 'models/shape-book.json');
    if (jsonFile === undefined) throw new Error('Missing named JSON');
    jsonFile.jsonSchema = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'array' };
    await put('shard.json', bytes(badJsonIndex));
    await expect(load(dir)).rejects.toThrow('Unregistered named JSON');
    await put('shard.json', bytes(index));
    const checked = await load(dir);
    expect(checked.section('ui/strings')).toEqual({ count: '7' });
    await put(`blobs/bin/${hash}.bin`, new Uint8Array([3, 2, 1]));
    await expect(product.file('models/native.bin')).rejects.toThrow('hash or size');
    const bad = bytes({ count: 7 });
    const malformed = structuredClone(index), custom = malformed.sections.find(row => row.name === 'ui/strings');
    if (custom === undefined) throw new Error('Missing native custom section');
    custom.hash = hashImmutableBytes(bad); custom.bytes = bad.length;
    await put('sections/ui/strings.json', bad);
    await put('shard.json', bytes(malformed));
    await expect(load(dir)).rejects.toThrow();
    await put('shard.json', bytes(source));
    await expect(load(dir)).rejects.toThrow('format-2');
  } finally { await rm(dir, { recursive: true, force: true }); }
  await expect(load(resolve(dir, 'absent-output'))).rejects.toThrow('run `wildshard build absent-output`');
});
