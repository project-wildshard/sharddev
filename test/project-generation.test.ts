// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures own their source and cache directories.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- All fixture paths are explicitly bounded.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Buffer.slice aliases its source; ownership must still detach.
import { Buffer } from 'node:buffer';
import { afterEach, expect, test } from 'vitest';
import { createProjectGeneration } from '../src/sharddev/projectGeneration';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { emptyShardfile } from '../src/sharddev/author';
import { readProjectAssets } from '../src/sharddev/project';
import { runWildshard } from '../scripts/wildshard.mjs';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';

const owned: string[] = [], encoder = new TextEncoder(), program = 'a'.repeat(64);
function fixture() {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'generation-')); owned.push(root);
  return { root, cache: resolve(root, '.cache'), assets: new Map<string, Uint8Array>() };
}
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });

test('project-relative inventories stay fresh, feed cached inputs and refuse escaped or linked directories', async () => {
  const { root, cache, assets } = fixture(), outside = fixture();
  mkdirSync(resolve(root, 'behaviour'));
  writeFileSync(resolve(root, 'behaviour', 'first.as'), 'first');
  const context = createProjectGeneration(root, program, assets, cache), inventory = context.inputFiles;
  if (inventory === undefined) throw new Error('Missing generation inventory');
  expect(inventory(['behaviour/'])).toEqual(['behaviour/first.as']);
  writeFileSync(resolve(root, 'behaviour', 'second.as'), 'second');
  const names = inventory(['behaviour/']);
  expect(names).toEqual(['behaviour/first.as', 'behaviour/second.as']);
  const files = await context.cached({ id: 'source-inventory', inputs: names }, inputs => new Map([['first.txt', inputs.get('behaviour/first.as') ?? new Uint8Array()]]));
  expect(new TextDecoder().decode(files.get('first.txt'))).toBe('first');
  for (const prefix of ['../', './behaviour/', 'behaviour/../', '/undeclared/']) expect(() => inventory([prefix])).toThrow();
  expect(() => inventory(['behaviour/', 'behaviour/'])).toThrow('Overlapping');
  symlinkSync(outside.root, resolve(root, 'linked'));
  expect(() => inventory(['linked/'])).toThrow('Linked');
});

test('cold/hit/concurrent steps preserve bytes and isolate callers, inputs and asset ownership', async () => {
  const { root, cache, assets } = fixture(); writeFileSync(resolve(root, 'input.bin'), new Uint8Array([1, 2, 3]));
  const ctx = createProjectGeneration(root, program, assets, cache); let calls = 0;
  const generate = (inputs: ReadonlyMap<string, Uint8Array>) => { calls++; return inputs; };
  const step = { id: 'mesh', inputs: ['input.bin'] };
  const [first, concurrent] = await Promise.all([ctx.cached(step, generate), ctx.cached(step, generate)]);
  expect(calls).toBe(1); expect(first).toEqual(concurrent);
  first.get('input.bin')?.fill(9);
  expect((await ctx.cached(step, generate)).get('input.bin')).toEqual(new Uint8Array([1, 2, 3]));
  const hit = createProjectGeneration(root, program, assets, cache);
  expect(await hit.cached(step, generate)).toEqual(concurrent); expect(calls).toBe(1);
  const bytes = concurrent.get('input.bin'); if (bytes === undefined) throw new Error('Missing fixture bytes');
  const key = ctx.asset(bytes); bytes.fill(7);
  expect(key).toBe(hashImmutableBytes(new Uint8Array([1, 2, 3]))); expect(assets.get(key)).toEqual(new Uint8Array([1, 2, 3]));
  const buffer = Buffer.from([5, 6]), bufferKey = ctx.asset(buffer); buffer.fill(0);
  expect(assets.get(bufferKey)).toEqual(new Uint8Array([5, 6]));
  writeFileSync(resolve(root, 'input.bin'), new Uint8Array([4]));
  await hit.cached(step, generate); expect(calls).toBe(2);
  await createProjectGeneration(root, 'b'.repeat(64), assets, cache).cached(step, generate); expect(calls).toBe(3);
  await hit.cached({ ...step, native: true }, generate); expect(calls).toBe(4);
});

test('escaping/duplicate inputs and corrupt cached bytes refuse before generating again', async () => {
  const { root, cache, assets } = fixture(), outside = fixture(); let calls = 0;
  writeFileSync(resolve(outside.root, 'input'), 'outside'); symlinkSync(resolve(outside.root, 'input'), resolve(root, 'link'));
  const ctx = createProjectGeneration(root, program, assets, cache);
  const generate = () => { calls++; return new Map([['body.bin', new Uint8Array([1])]]); };
  await expect(ctx.cached({ id: 'mesh', inputs: ['link'] }, generate)).rejects.toThrow('escaped');
  await expect(ctx.cached({ id: 'mesh', inputs: ['../input'] }, generate)).rejects.toThrow('file name');
  writeFileSync(resolve(root, 'input'), 'ok');
  await expect(ctx.cached({ id: 'mesh', inputs: ['input', 'input'] }, generate)).rejects.toThrow('Duplicate');
  expect(calls).toBe(0);
  await ctx.cached({ id: 'mesh' }, generate);
  const directory = resolve(cache, 'v3', 'keys', root.split('/').at(-1) ?? '', 'mesh');
  const key = readdirSync(directory).find(file => /^[a-f0-9]{64}$/u.test(file));
  if (key === undefined) throw new Error('Missing fixture cache');
  writeFileSync(resolve(cache, 'blobs', hashImmutableBytes(new Uint8Array([1]))), new Uint8Array([2]));
  await expect(createProjectGeneration(root, program, assets, cache).cached({ id: 'mesh' }, generate)).rejects.toThrow('byte mismatch');
  expect(calls).toBe(1);
});

test('declared public inputs stay bounded, detached and content-keyed on cache hits', async () => {
  const { root, cache, assets } = fixture(), publicRoot = fixture(), outside = fixture();
  writeFileSync(resolve(publicRoot.root, 'model.bin'), new Uint8Array([11]));
  writeFileSync(resolve(outside.root, 'secret'), 'outside');
  symlinkSync(resolve(outside.root, 'secret'), resolve(publicRoot.root, 'escape'));
  const roots = [{ prefix: '/assets/', directory: publicRoot.root }]; let calls = 0;
  const ctx = createProjectGeneration(root, program, assets, cache, roots);
  const step = { id: 'public-model', inputs: ['/assets/model.bin'] };
  const generate = (inputs: ReadonlyMap<string, Uint8Array>) => {
    calls++; const bytes = inputs.get('/assets/model.bin'); if (bytes === undefined) throw new Error('Missing public input');
    return new Map([['body.bin', bytes]]);
  };
  const first = await ctx.cached(step, generate); first.get('body.bin')?.fill(0);
  const hit = createProjectGeneration(root, program, assets, cache, roots);
  expect((await hit.cached(step, generate)).get('body.bin')).toEqual(new Uint8Array([11]));
  expect(calls).toBe(1);
  writeFileSync(resolve(publicRoot.root, 'model.bin'), new Uint8Array([12]));
  expect((await hit.cached(step, generate)).get('body.bin')).toEqual(new Uint8Array([12])); expect(calls).toBe(2);
  for (const path of ['/assets/../secret', '/assets/%2e%2e/secret', '/assets/escape', '/unknown/model.bin']) {
    await expect(ctx.cached({ id: 'refused', inputs: [path] }, generate)).rejects.toThrow();
  }
  await expect(createProjectGeneration(root, program, assets, cache).cached(step, generate)).rejects.toThrow('exactly one');
  await expect(createProjectGeneration(root, program, assets, cache, [...roots, ...roots]).cached(step, generate)).rejects.toThrow('exactly one');
  await expect(ctx.cached({ ...step, id: 'bad-output' }, inputs => inputs)).rejects.toThrow('file name');
  expect(() => createProjectGeneration(root, program, assets, cache, [{ prefix: '/', directory: publicRoot.root }])).toThrow('bounded');
  expect(calls).toBe(2);
});

test('the author entry receives only the public roots supplied by its caller', async () => {
  const { root } = fixture(), publicRoot = fixture(), source = emptyShardfile({ slug: 'rooted-input', name: 'Rooted input', author: 'Test', revision: 1, seed: 3 });
  writeFileSync(resolve(publicRoot.root, 'model.bin'), new Uint8Array([11]));
  writeFileSync(resolve(root, 'shard.config.ts'), `export default async function generate(ctx) {
    const files=await ctx.cached({id:'public',inputs:['/assets/model.bin']},inputs=>{
      const bytes=inputs.get('/assets/model.bin');if(bytes===undefined)throw new Error('Missing input');return new Map([['body.bin',bytes]]);
    });
    const bytes=files.get('body.bin');if(bytes===undefined)throw new Error('Missing cached body');
    const source=${JSON.stringify(source)};source.identity.revision=bytes[0];return source;
  }`);
  await expect(readProjectAssets(root)).rejects.toThrow('exactly one');
  const roots = { folder: 'rooted-input', imageRoots: [{ prefix: '/assets/', directory: publicRoot.root }] };
  expect((await readProjectAssets(root, undefined, roots)).shard.identity.revision).toBe(11);
  writeFileSync(resolve(publicRoot.root, 'model.bin'), new Uint8Array([12]));
  expect((await readProjectAssets(root, undefined, roots)).shard.identity.revision).toBe(12);
  expect(readdirSync(root)).toEqual(['shard.config.ts']);
});

test('the project loader executes a build entry and admits its generated asset without source output files', async () => {
  const { root } = fixture(), bytes = new Uint8Array([1, 2, 3]), source = emptyShardfile({ slug: 'generated-fixture', name: 'Generated', author: 'Test', revision: 1, seed: 3 });
  writeFileSync(resolve(root, 'shard.config.ts'), `export default ${JSON.stringify(source)};
  export async function generate(ctx) {
    const files=await ctx.cached({id:'fixture'},()=>new Map([['body.bin',new Uint8Array([1,2,3])]]));
    const bytes=files.get('body.bin'); if(bytes===undefined)throw new Error('Missing fixture bytes');
    const hash=ctx.asset(bytes), source=${JSON.stringify(source)};
    source.files=[{hash,kind:'binary',compressed:3,decoded:3,gpu:0,triangles:0,draws:0,dependencies:[],critical:false}];
    source.library=[hash]; source.budgets.library={resident:3,compressed:3}; return source;
  }`);
  const loaded = await readProjectAssets(root);
  expect(loaded.assets.get(hashImmutableBytes(bytes))).toEqual(bytes);
  expect(readdirSync(root)).toEqual(['shard.config.ts']);
  expect(encoder.encode(JSON.stringify(loaded.shard)).byteLength).toBeGreaterThan(0);
  const output = resolve(root, 'out');
  await runWildshard(['build', root, output, '--product-only', '--no-placeholders', '--format=2']);
  expect((await loadHeadlessProduct(output)).shardfile.identity.slug).toBe('generated-fixture');
});


test('a build function returns its named bytes with its shard and refuses competing output declarations', async () => {
  const { root } = fixture(), source = emptyShardfile({ slug: 'generated-output', name: 'Generated', author: 'Test', revision: 1, seed: 3 });
  const config = `export default async function generate(ctx) {
    const bytes=new Uint8Array([1,2,3]), hash=ctx.asset(bytes);
    return {shard:${JSON.stringify(source)},output:{namedFiles:[{name:'generated/body',path:'blobs/bin/'+hash+'.bin',hash,kind:'bin',compressed:3,decoded:3,gpu:0,triangles:0,draws:0,dependencies:[],critical:false}],assets:new Map([[hash,bytes]])}};
  }`;
  writeFileSync(resolve(root, 'shard.config.ts'), config);
  const loaded = await readProjectAssets(root);
  expect(loaded.output.namedFiles?.map(file => file.name)).toEqual(['generated/body']);
  expect(loaded.assets.get(hashImmutableBytes(new Uint8Array([1, 2, 3])))).toEqual(new Uint8Array([1, 2, 3]));
  expect(readdirSync(root)).toEqual(['shard.config.ts']);
  writeFileSync(resolve(root, 'shard.config.ts'), `${config}\nexport const output = {};`);
  await expect(readProjectAssets(root)).rejects.toThrow('unambiguous');
});


test('a generated map packs its actual pixels with the adapter source key and original naming admission', async () => {
  const { root } = fixture(), source = emptyShardfile({ slug: 'generated-map', name: 'Generated map', author: 'Test', revision: 1, seed: 3 });
  writeFileSync(resolve(root, 'shard.config.ts'), `export default function generate() {
    return {shard:${JSON.stringify(source)},output:{},map:{pixels:new Uint8Array(4000000),name:'ui/map'}};
  }`);
  const loaded = await readProjectAssets(root, undefined, undefined, { mapSourceHash: 'd'.repeat(64) });
  expect(loaded.shard.map?.tilesHash).toBe('d'.repeat(64));
  expect(loaded.output.namedFiles?.map(file => file.name)).toEqual(['ui/map']);
  expect(loaded.assets.get(loaded.shard.map?.image ?? '')).toBeInstanceOf(Uint8Array);
  expect(readdirSync(root)).toEqual(['shard.config.ts']);
  const output = resolve(root, 'out');
  await runWildshard(['build', root, output, '--product-only', '--no-placeholders', '--format=2', `--generated-map-tiles-hash=${'e'.repeat(64)}`]);
  expect((await loadHeadlessProduct(output)).shardfile.map?.tilesHash).toBe('e'.repeat(64));
  writeFileSync(resolve(root, 'shard.config.ts'), `export default ${JSON.stringify(source)};`);
  await expect(readProjectAssets(root, undefined, undefined, { mapSourceHash: 'd'.repeat(64) })).rejects.toThrow('requires a generated map');
});
