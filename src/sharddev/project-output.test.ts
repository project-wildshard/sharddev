import { ktx2DeviceCosts } from '@wildshard/format/ktx2Cost';
import { afterEach, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Observe the exact public-view pair used by native build comparison.
import { Buffer } from 'node:buffer';
// oxlint-disable-next-line import/no-nodejs-modules -- Observe exact immutable keys for the owned build fixture only.
import { channel } from 'node:diagnostics_channel';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture owns a bounded author project and its output.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- All fixture paths are inside its scratch directory.
import { resolve } from 'node:path';
import { emitPlatformSections } from './platformSections';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { nameBlob } from './blobs';
import { mergeProjectBlobs, prepareProjectOutput, projectMirrors } from './projectOutput';
import { readProjectAssets, buildProject } from './project';
import { validateOutputProduct, writeOutputProduct } from './outputProduct';
import { compileScript } from '@wildshard/sharddev/compileScript';
import { encodeCanonicalJson } from '@wildshard/engine/host/immutable';
import { loadHeadlessProduct } from '@wildshard/engine/host/headlessProduct';
import { registeredJsonSchema } from '@wildshard/engine/host/formatJsonSchema';

const directories: string[] = [];
function directory(): string {
  mkdirSync('tmp', { recursive: true });
  const path = mkdtempSync(resolve('tmp', 'project-output-')); directories.push(path); return path;
}
const source = () => emptyShardfile({ slug: 'output-test', name: 'Output', author: 'Test', revision: 1, seed: 3 });
const binary = new Uint8Array([1, 2, 3]);
afterEach(() => { vi.restoreAllMocks(); for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });

function repeatedBlob() {
  const blob = nameBlob('base.bin', 'bin', binary);
  const first = mergeProjectBlobs(source(), new Map(), [blob]);
  const alias = nameBlob('alias.bin', 'bin', binary);
  const previous = Uint8Array.from(binary);
  return { alias, previous, merge: (bytes: Uint8Array = previous, selected = alias) =>
    mergeProjectBlobs(first.shard, new Map([[blob.file.hash, bytes]]), [selected], first.namedFiles) };
}

test('ordinary repeated assets compare complete native views while retaining names, costs and independent bytes', () => {
  const fixture = repeatedBlob(), compare = vi.spyOn(Buffer, 'compare');
  const result = fixture.merge();
  expect(compare.mock.calls.some(([a, b]) => a === fixture.previous && b === fixture.alias.bytes)).toBe(true);
  expect([...result.assets.values()]).toEqual([binary]);
  expect(result.namedFiles[0]?.name).toBe('base.bin');
  fixture.previous.fill(7); fixture.alias.bytes.fill(8);
  expect([...result.assets.values()]).toEqual([binary]);
});

test('custom some behavior, scalar callbacks and blob byte getters retain their original path', () => {
  const fixture = repeatedBlob(), bytes = fixture.alias.bytes;
  const nativeSome: unknown = Reflect.get(Uint8Array.prototype, 'some');
  if (typeof nativeSome !== 'function') throw new Error('Missing native some');
  let reads = 0, iterations = 0;
  Object.defineProperty(fixture.alias, 'bytes', { get: () => { reads++; return bytes; } });
  Object.defineProperty(fixture.previous, 'some', { value: (predicate: (value: number, index: number) => boolean) => {
    const result: unknown = Reflect.apply(nativeSome, fixture.previous, [(value: number, index: number) => {
      const before = reads, verdict = predicate(value, index);
      expect(reads).toBe(before + 1); iterations++; return verdict;
    }]);
    return Boolean(result);
  } });
  expect([...fixture.merge().assets.values()]).toEqual([binary]);
  expect(iterations).toBe(binary.length);
  const refusal = repeatedBlob(); Object.defineProperty(refusal.previous, 'some', { value: () => true });
  expect(() => refusal.merge()).toThrow('conflicts with admitted asset bytes');
});

test('proxy blobs and shared views retain scalar comparison without extra descriptor traps', () => {
  const fixture = repeatedBlob(), compare = vi.spyOn(Buffer, 'compare');
  let descriptors = 0;
  const selected = new Proxy(fixture.alias, { getOwnPropertyDescriptor: (target, key) => {
    descriptors++; return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  expect([...fixture.merge(fixture.previous, selected).assets.values()]).toEqual([binary]);
  expect(descriptors).toBe(0);
  expect(compare.mock.calls.some(([a, b]) => a === fixture.previous && b === fixture.alias.bytes)).toBe(false);
  const shared = new Uint8Array(new SharedArrayBuffer(binary.length)); shared.set(binary);
  expect([...fixture.merge(shared).assets.values()]).toEqual([binary]);
  expect(compare.mock.calls.some(([a, b]) => a === shared && b === fixture.alias.bytes)).toBe(false);
});

test('a some getter that detaches the view still runs once and retains the native refusal', () => {
  const fixture = repeatedBlob();
  const nativeSome: unknown = Reflect.get(Uint8Array.prototype, 'some');
  if (typeof nativeSome !== 'function') throw new Error('Missing native some');
  let reads = 0;
  Object.defineProperty(fixture.previous, 'some', { get: () => {
    reads++; structuredClone(fixture.previous, { transfer: [fixture.previous.buffer] }); return nativeSome;
  } });
  expect(() => fixture.merge()).toThrow(TypeError); expect(reads).toBe(1);
});

test('named JSON schemas survive merging and run during disk and runtime validation', async () => {
  const jsonSchema = registeredJsonSchema('models/shape-book.json');
  const value = [{"slot":"shape","channels":[],"file":"models/native.bin"}];
  const blob = nameBlob('models/shape-book.json', 'json', new TextEncoder().encode(encodeCanonicalJson(value)), { jsonSchema });
  const merged = mergeProjectBlobs(source(), new Map(), [blob]);
  const path = directory();
  const index = writeOutputProduct(merged.shard, merged.assets, path, { namedFiles: merged.namedFiles });
  expect(index.files[0]?.jsonSchema).toEqual(jsonSchema);
  expect(validateOutputProduct(path).shard).toEqual(merged.shard);
  expect(await (await loadHeadlessProduct(path)).json('models/shape-book.json')).toEqual(value);
  const file = index.files[0];
  if (file === undefined) throw new Error('Missing named JSON');
  file.jsonSchema = { ...jsonSchema, type: 'object' };
  writeFileSync(resolve(path, 'shard.json'), encodeCanonicalJson(index));
  expect(() => validateOutputProduct(path)).toThrow('refuses its schema');
  await expect((await loadHeadlessProduct(path)).json('models/shape-book.json')).rejects.toThrow('refuses its schema');
});

test('blob admission charges new content once, preserves conservative declarations/names and owns bytes', () => {
  const blob = nameBlob('models/body.bin', 'bin', binary, { decoded: 100, gpu: 100 });
  const original = source(), first = mergeProjectBlobs(original, new Map(), [blob, blob]);
  expect(original.files).toEqual([]);
  expect(first.shard.library).toEqual([blob.file.hash]);
  expect(first.shard.budgets.library).toMatchObject({ compressed: binary.length, resident: 200 });
  const second = mergeProjectBlobs(first.shard, first.assets, [nameBlob('alias.bin', 'bin', binary)], first.namedFiles);
  expect(second.shard).toEqual(first.shard); expect(second.namedFiles).toEqual(first.namedFiles);
  blob.bytes.fill(0); expect(first.assets.get(blob.file.hash)).toEqual(binary);
  expect(() => mergeProjectBlobs(first.shard, first.assets, [nameBlob('models/body.bin', 'bin', new Uint8Array([4]))], first.namedFiles)).toThrow('conflicting content');
  expect(() => mergeProjectBlobs(first.shard, new Map([[blob.file.hash, new Uint8Array([4])]]), [nameBlob('alias.bin', 'bin', binary)])).toThrow('asset bytes');
  const changedKind = source(); changedKind.files = first.shard.files.map(row => ({ ...row, kind: 'wasm' }));
  changedKind.library = first.shard.library; changedKind.budgets = first.shard.budgets;
  expect(() => mergeProjectBlobs(changedKind, first.assets, [nameBlob('body.bin', 'bin', binary)])).toThrow('kind');
});

test('config output carries platform sections, source and in-memory Wasm blobs through disk validation', async () => {
  const path = directory(), destination = resolve(path, 'out');
  const wasm = await compileScript(`
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return 16384; }
export function in_cap(): i32 { return 4096; }
export function out_ptr(): i32 { return 24576; }
export function out_cap(): i32 { return 32; }
export function out_count(): i32 { return 0; }
export function on_tick(): void {}
`);
  writeFileSync(resolve(path, 'body.bin'), binary);
  writeFileSync(resolve(path, 'bake.json'), '[{"slot":"shape","channels":[],"file":"models/native.bin"}]');
  writeFileSync(resolve(path, 'quest.wasm'), wasm);
  writeFileSync(resolve(path, 'shard.config.ts'), `
import * as v from 'valibot';
import { registeredJsonSchema } from '@wildshard/sharddev/formatJsonSchema';
import { emitPlatformSections } from '@wildshard/sharddev/platformSections';
import { nameBlob, emitNamedBlobs } from '@wildshard/sharddev/blobs';
export default ${JSON.stringify(source())};
const named = emitNamedBlobs([nameBlob('behaviour/quest.wasm', 'wasm', new Uint8Array(${JSON.stringify([...wasm])}), { script: { abi: 0 } })]);
export const output = {
 blobs: [{ name: 'models/body.bin', kind: 'bin', source: 'body.bin' },
         { name: 'models/shape-book.json', kind: 'json', source: 'bake.json', options: {jsonSchema:registeredJsonSchema('models/shape-book.json')} },
         { name: 'behaviour/quest.wasm', kind: 'wasm', source: 'quest.wasm', options: { script: { abi: 0 } } }],
 namedFiles: named.files, assets: named.assets,
 platform: emitPlatformSections(new Map([['ui/strings', { hello: 'Hello' }]]))
};
export const mirrors = [{ name: 'REWARD', value: { amount: 3 } }];
`);
  const loaded = await readProjectAssets(path);
  expect(loaded.mirrors).toEqual([{ name: 'REWARD', value: { amount: 3 } }]);
  expect(loaded.output.namedFiles?.map(row => row.name)).toEqual(['models/body.bin', 'models/shape-book.json', 'behaviour/quest.wasm']);
  await buildProject(path, destination, { client: null });
  const checked = validateOutputProduct(destination);
  expect(checked.index.formatVersion).toBe(2);
  const bake = checked.index.files.find(row => row.name === 'models/shape-book.json');
  expect(bake?.kind).toBe('json');
  if (bake === undefined) throw new Error('Missing named JSON bake');
  expect(JSON.parse(readFileSync(resolve(destination, bake.path), 'utf8'))).toEqual([{"slot":"shape","channels":[],"file":"models/native.bin"}]);
  expect(checked.index.files.find(row => row.name === 'behaviour/quest.wasm')?.kind).toBe('wasm');
  expect(checked.index.sections.map(row => row.name)).toEqual(expect.arrayContaining(['ui/strings']));
  expect(readFileSync(resolve(destination, 'sections/ui/strings.json'), 'utf8')).toContain('Hello');
});

test('output declarations refuse unknown policy fields, escapes, changed hashes and invalid mirrors', async () => {
  const parent = directory(), path = resolve(parent, 'project'); mkdirSync(path);
  writeFileSync(resolve(parent, 'escape.bin'), binary);
  await expect(prepareProjectOutput(path, { runtime: {} })).rejects.toThrow();
  await expect(prepareProjectOutput(path, { blobs: [{ name: 'escape.bin', kind: 'bin', source: '../escape.bin' }] })).rejects.toThrow('escapes');
  await expect(prepareProjectOutput(path, { assets: new Map([['bad-hash', binary]]) })).rejects.toThrow('hash');
  await expect(prepareProjectOutput(path, { blobs: [{ name: 'x.bin', kind: 'bin', source: 'x.bin', options: { decoded: -1 } }] })).rejects.toThrow();
  expect(() => projectMirrors([{ name: 'x', value: 1 }, { name: 'x', value: 1 }])).toThrow('Duplicate');
  expect(() => projectMirrors([{ name: 'constructor.x', value: 1 }])).toThrow();
  expect(() => projectMirrors([{ name: 'x', value: () => 1 }])).toThrow('JSON');
});


test('author config and output sidecars inline reachable lazy helpers into their one-module execution', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'rows.ts'), `export default ${JSON.stringify(source())};`);
  writeFileSync(resolve(path, 'shard.config.ts'), 'export default async () => (await import("./rows")).default;');
  writeFileSync(resolve(path, 'generators/strings.ts'), 'export const messages = { lazy: "original helper" };');
  writeFileSync(resolve(path, 'generators/output.ts'), `
import { emitPlatformSections } from '@wildshard/sharddev/platformSections';
const {messages} = await import('./strings');
export const output = {platform:emitPlatformSections(new Map([['ui/strings',messages]]))};
`);
  const loaded = await readProjectAssets(path);
  expect(loaded.shard.identity).toEqual(source().identity);
  expect(loaded.output.platform?.sections.map(row => row.name)).toEqual(['ui/strings']);
  const bytes = loaded.output.platform?.files.get('sections/ui/strings.json');
  expect(bytes).toBeDefined();
  expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({lazy:'original helper'});
});

test('inlining lazy author helpers retains the executable filesystem dependency refusal', async () => {
  const path = directory();
  writeFileSync(resolve(path, 'shard.config.ts'), `export default async () => {
    await import('node:fs/promises'); return ${JSON.stringify(source())};
  };`);
  await expect(readProjectAssets(path)).rejects.toThrow('must use injected build capabilities for file access');
});

test('output preparation receives bounded cached inputs and admits detached binary output', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'shard.config.ts'), `export default ${JSON.stringify(source())};`);
  writeFileSync(resolve(path, 'input.bin'), binary);
  writeFileSync(resolve(path, 'generators/output.ts'), `
import { nameBlob } from '@wildshard/sharddev/blobs';
export const output = {};
export async function prepareOutput(ctx) {
  const files = await ctx.cached({id:'named-input',inputs:['input.bin']}, inputs => new Map([['body.bin',inputs.get('input.bin')]]));
  const blob = nameBlob('models/body.bin','bin',files.get('body.bin'));
  return {namedFiles:[blob.file],assets:new Map([[blob.file.hash,blob.bytes]])};
}`);
  const first = await readProjectAssets(path), second = await readProjectAssets(path);
  const file = first.output.namedFiles?.find(row => row.name === 'models/body.bin');
  if (file === undefined) throw new Error('Missing prepared blob');
  expect(first.assets.get(file.hash)).toEqual(binary);
  first.assets.get(file.hash)?.fill(0);
  expect(second.assets.get(file.hash)).toEqual(binary);
  writeFileSync(resolve(path, 'input.bin'), new Uint8Array([4, 5, 6]));
  const changed = await readProjectAssets(path);
  expect(changed.output.namedFiles?.[0]?.hash).not.toBe(file.hash);
  const nextSource = readFileSync(resolve(path, 'generators/output.ts'), 'utf8')
    .replace("inputs.get('input.bin')", 'new Uint8Array([7,8,9])');
  writeFileSync(resolve(path, 'generators/output.ts'), nextSource);
  const revised = await readProjectAssets(path), nextFile = revised.output.namedFiles?.[0];
  if (nextFile === undefined) throw new Error('Missing revised blob');
  expect(revised.assets.get(nextFile.hash)).toEqual(new Uint8Array([7, 8, 9]));
});

test('an output sidecar may prepare the project map lattice, published as its named image', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'shard.config.ts'), `export default ${JSON.stringify(source())};`);
  writeFileSync(resolve(path, 'generators/output.ts'), `
export const output = {};
export async function prepareMap() { const pixels = new Uint8Array(1000 * 1000 * 4); pixels.fill(200); return { pixels, name: 'ui/images/map' }; }`);
  const made = await readProjectAssets(path), image = made.shard.map?.image;
  if (image === undefined) throw new Error('Missing prepared map');
  expect(made.shard.map?.tilesHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(made.assets.get(image)?.byteLength).toBeGreaterThan(0);
});

test('map preparation refuses a non-function and a second map producer', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'shard.config.ts'), `export default ${JSON.stringify(source())};`);
  writeFileSync(resolve(path, 'generators/output.ts'), 'export const output={}; export const prepareMap=42;');
  await expect(readProjectAssets(path)).rejects.toThrow('Map preparation must be a build function');
  writeFileSync(resolve(path, 'generators/output.ts'), 'export const output={}; export function prepareMap(){return {pixels:new Uint8Array(3)};}');
  await expect(readProjectAssets(path)).rejects.toThrow('Invalid generated map lattice');
});

test('output preparation retains function, filesystem and output admission refusals', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'shard.config.ts'), `export default ${JSON.stringify(source())};`);
  const sidecar = resolve(path, 'generators/output.ts');
  writeFileSync(sidecar, 'export const output={}; export const prepareOutput=42;');
  await expect(readProjectAssets(path)).rejects.toThrow('build function');
  writeFileSync(sidecar, 'export const output={}; export function prepareOutput(){return {runtime:{}};}');
  await expect(readProjectAssets(path)).rejects.toThrow();
  writeFileSync(sidecar, `import {readFileSync} from 'node:fs';
    export const output={}; export function prepareOutput(){return readFileSync('input.bin');}`);
  await expect(readProjectAssets(path)).rejects.toThrow('must use injected build capabilities');
});

test('source entry and sidecar share one immutable construction and invalidate both recipes', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'input.bin'), binary);
  writeFileSync(resolve(path, 'shard.config.ts'), `export default async ctx => {
    const files=await ctx.cached({id:'shared-body',inputs:['input.bin']}, inputs=>new Map([['body.bin',inputs.get('input.bin')]]));
    const row=${JSON.stringify(source())}; row.identity.name='owned-'+files.get('body.bin')[0]; return row;
  };`);
  const sidecar = resolve(path, 'generators/output.ts');
  writeFileSync(sidecar, `import {nameBlob} from '@wildshard/sharddev/blobs';
    export const output={};
    export async function prepareOutput(ctx){
      const files=await ctx.cached({id:'shared-body',inputs:['input.bin']},()=>{throw new Error('Duplicate source construction');});
      const blob=nameBlob('body.bin','bin',files.get('body.bin'));
      return {namedFiles:[blob.file],assets:new Map([[blob.file.hash,blob.bytes]])};
    }`);
  const keys: string[] = [], observer = channel('wildshard.generation-key');
  const observe = (value: unknown): void => {
    if (typeof value === 'object' && value !== null && 'key' in value && typeof value.key === 'string') keys.push(value.key);
  };
  observer.subscribe(observe);
  try {
  const first = await readProjectAssets(path), file = first.output.namedFiles?.[0];
  if (file === undefined) throw new Error('Missing shared source output');
  expect(first.shard.identity.name).toBe('owned-1');
  expect(first.assets.get(file.hash)).toEqual(binary);
  first.assets.get(file.hash)?.fill(0);
  const warm = await readProjectAssets(path);
  expect(warm.assets.get(file.hash)).toEqual(binary);
  writeFileSync(resolve(path, 'input.bin'), new Uint8Array([4, 5, 6]));
  const changed = await readProjectAssets(path);
  expect(changed.shard.identity.name).toBe('owned-4');
  expect(changed.output.namedFiles?.[0]?.hash).not.toBe(file.hash);
  writeFileSync(sidecar, readFileSync(sidecar, 'utf8').replace("'body.bin','bin'", "'revised.bin','bin'"));
  const revised = await readProjectAssets(path);
  expect(revised.output.namedFiles?.[0]?.name).toBe('revised.bin');
  expect(revised.shard.identity.name).toBe('owned-4');
  expect(keys).toHaveLength(8);
  expect(keys[0]).toBe(keys[1]); expect(keys[0]).toBe(keys[2]); expect(keys[2]).toBe(keys[3]);
  expect(keys[4]).toBe(keys[5]); expect(keys[4]).not.toBe(keys[0]);
  expect(keys[6]).toBe(keys[7]); expect(keys[6]).not.toBe(keys[4]);
  } finally { observer.unsubscribe(observe); }
});


test('sidecar discovery uses fresh bounded inputs and rejects executable values', async () => {
  const path = directory(); mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'shard.config.ts'), `export default ${JSON.stringify(source())};`);
  writeFileSync(resolve(path, 'seed.bin'), new Uint8Array([7]));
  const program = `export const output = {};
export async function prepareDiscovery(ctx) {
  const files = await ctx.cached({id:'discovery-seed',inputs:['seed.bin']}, bytes => new Map([['seed',bytes.get('seed.bin')]]));
  return {'ground.rows':{seed:files.get('seed')[0]}};
}`;
  writeFileSync(resolve(path, 'generators/output.ts'), program);
  const first = await readProjectAssets(path);
  expect(first.output.discovery).toEqual({'ground.rows':{seed:7}});
  writeFileSync(resolve(path, 'seed.bin'), new Uint8Array([9]));
  expect((await readProjectAssets(path)).output.discovery).toEqual({'ground.rows':{seed:9}});
  expect(first.output.discovery).toEqual({'ground.rows':{seed:7}});
  writeFileSync(resolve(path, 'generators/output.ts'), program.replace("{seed:files.get('seed')[0]}", '() => 7'));
  await expect(readProjectAssets(path)).rejects.toThrow('Discovery values must be plain bounded JSON');
});

test('prepared output late roots join newly admitted named blobs without dropping their library cost', async () => {
  const blob = nameBlob('world/late-shape.bin', 'bin', binary, {decoded:12,gpu:8});
  const input = {namedFiles:[blob.file],assets:new Map([[blob.file.hash,blob.bytes]]),late:[{hash:blob.file.hash,at:[-150,-138]}]};
  const prepared = await prepareProjectOutput(directory(), input);
  const merged = mergeProjectBlobs(source(), prepared.assets, prepared.blobs, prepared.options.namedFiles, prepared.late);
  expect(merged.shard.late).toEqual(input.late); expect(merged.shard.late).not.toBe(input.late);
  expect(merged.shard.library).toContain(blob.file.hash);
  expect(merged.shard.budgets.library).toMatchObject({resident:20,compressed:3});
  const destination = directory(), index = writeOutputProduct(merged.shard, merged.assets, destination, {namedFiles:merged.namedFiles});
  expect(index.admission.late).toEqual(input.late);
  expect(validateOutputProduct(destination).shard.late).toEqual(input.late);
});

test('ordinary project output carries late roots through its defining asset assembly', async () => {
  const path = directory();
  writeFileSync(resolve(path, 'shard.config.ts'), `
import { nameBlob } from '@wildshard/sharddev/blobs';
export default ${JSON.stringify(source())};
const blob=nameBlob('world/shape.bin','bin',new Uint8Array([1,2,3]));
export const output={namedFiles:[blob.file],assets:new Map([[blob.file.hash,blob.bytes]]),late:[{hash:blob.file.hash,at:[-150,-138]}]};
`);
  const loaded = await readProjectAssets(path), [late] = loaded.shard.late ?? [];
  if (late === undefined) throw new Error('Missing ordinary project late root');
  expect(late.at).toEqual([-150,-138]); expect(loaded.shard.library).toContain(late.hash);
  expect(loaded.shard.files.find(file => file.hash === late.hash)?.compressed).toBe(3);
  expect(loaded.assets.get(late.hash)).toEqual(binary);
});

test('output late hints refuse missing library roots and malformed scheduling metadata', async () => {
  const blob = nameBlob('world/late-shape.bin', 'bin', binary);
  await expect(prepareProjectOutput(directory(), {late:[{hash:blob.file.hash,at:[251,0]}]})).rejects.toThrow();
  expect(() => mergeProjectBlobs(source(), new Map(), [], [], [{hash:blob.file.hash}])).toThrow('declared library roots');
  expect(() => mergeProjectBlobs(source(), new Map(), [blob], [], [{hash:blob.file.hash},{hash:blob.file.hash}])).toThrow('unique late');
  const local = source(), {name:_name,path:_path,kind:_kind,...metadata} = blob.file;
  local.files.push({...metadata,kind:'binary',critical:true}); local.critical.push(blob.file.hash);
  local.budgets.sim.compressed += blob.bytes.length; local.budgets.sim.resident += metadata.decoded+metadata.gpu;
  expect(() => mergeProjectBlobs(local,new Map([[blob.file.hash,blob.bytes]]),[blob],[],[{hash:blob.file.hash}])).toThrow('declared library roots');
  expect(local.library).toEqual([]); expect(local.late).toBeUndefined();
  expect(() => mergeProjectBlobs(source(),new Map(),[blob],[],[{hash:'world/late-shape.bin'}])).toThrow();
  const alias = nameBlob('world/alias.bin','bin',binary);
  expect(mergeProjectBlobs(source(),new Map(),[blob,alias],[],[{hash:blob.file.hash}]).shard.late).toEqual([{hash:blob.file.hash}]);
  expect(() => mergeProjectBlobs(source(),new Map(),[blob,alias],[],[{hash:blob.file.hash},{hash:alias.file.hash}])).toThrow('unique late');
});

test('small late bodies never ride a required control body pack', () => {
  const early = nameBlob('world/shared.bin', 'bin', binary), late = nameBlob('world/later.bin', 'bin', new Uint8Array([4,5,6]));
  const merged = mergeProjectBlobs(source(), new Map(), [early,late], [], [{hash:late.file.hash,at:[200,0]}]);
  const index = writeOutputProduct(merged.shard, merged.assets, directory(), {namedFiles:merged.namedFiles});
  const earlyPack = index.packs?.find(pack => pack.entries.some(entry => entry.hash === early.file.hash));
  const latePack = index.packs?.find(pack => pack.entries.some(entry => entry.hash === late.file.hash));
  if (earlyPack === undefined || latePack === undefined) throw new Error('Missing scoped body packs');
  expect(earlyPack.hash).not.toBe(latePack.hash);
  expect(earlyPack.entries.some(entry => entry.hash === late.file.hash)).toBe(false);
  expect(index.files.find(file => file.hash === early.file.hash)?.compressed).toBe(3);
  expect(index.files.find(file => file.hash === late.file.hash)?.compressed).toBe(3);
  expect(merged.shard.library).toEqual(expect.arrayContaining([early.file.hash,late.file.hash]));
});


test('the writer computes KTX2 device costs from exact bytes and rejects forged footprints', () => {
  const bytes = Uint8Array.from(readFileSync('node_modules/@wildshard/engine/test/fixtures/shard-assets/pixel.ktx2')), blob = nameBlob('surface.ktx2','ktx2',bytes);
  const merged = mergeProjectBlobs(source(),new Map(),[blob]), path = directory();
  const index = writeOutputProduct(merged.shard,merged.assets,path,{namedFiles:merged.namedFiles});
  expect(index.ktx2Costs?.[blob.file.hash]).toEqual(ktx2DeviceCosts(bytes));
  expect(validateOutputProduct(path).index.ktx2Costs).toEqual(index.ktx2Costs);
  if (index.ktx2Costs === undefined) throw new Error('Missing device metadata');
  index.ktx2Costs[blob.file.hash] = {rgba:0,astc:0,bc7:0};
  writeFileSync(resolve(path,'shard.json'),encodeCanonicalJson(index));
  expect(() => validateOutputProduct(path)).toThrow('KTX2 device costs differ');
});


test('owned hull resources follow control without changing files, costs or explicit priorities', async () => {
  const image = nameBlob('creatures/coat.png','image',Uint8Array.from(readFileSync('public/icon-192.png')));
  const rig = nameBlob('creatures/body.glb','glb',Uint8Array.from(readFileSync('test/fixtures/shard-assets/triangle.glb')));
  const maps = nameBlob('creatures/maps.ktx2','ktx2',Uint8Array.from(readFileSync('node_modules/@wildshard/engine/test/fixtures/shard-assets/pixel.ktx2')));
  const tier = {files:{body:{rig:'creatures/body.glb',base:'creatures/maps.ktx2',normal:'creatures/maps.ktx2'}},coats:{'body:bird:adult':{key:'/original/coat.png',image:'creatures/coat.png'}}};
  const book = {productFiles:true,family:{label:'fixture',rigs:['body'],hulls:{'bird:adult':'body'}},tiers:{phone:tier,desktop:tier}};
  const platform = emitPlatformSections(new Map([['look/rigged-hulls',book]]));
  const input = {platform,namedFiles:[image.file,rig.file,maps.file],assets:new Map([[image.file.hash,image.bytes],[rig.file.hash,rig.bytes],[maps.file.hash,maps.bytes]])};
  const prepared = await prepareProjectOutput(directory(),input);
  expect(prepared.late).toEqual([{hash:image.file.hash},{hash:rig.file.hash},{hash:maps.file.hash}]);
  const merged = mergeProjectBlobs(source(),prepared.assets,prepared.blobs,prepared.options.namedFiles,prepared.late);
  expect(merged.shard.library).toEqual(expect.arrayContaining([image.file.hash,rig.file.hash,maps.file.hash]));
  expect(merged.shard.files.find(file=>file.hash===image.file.hash)?.compressed).toBe(image.bytes.length);
  const explicit = [{hash:image.file.hash,at:[20,30] as [number,number]}];
  expect((await prepareProjectOutput(directory(),{...input,late:explicit})).late).toEqual([...explicit,{hash:rig.file.hash},{hash:maps.file.hash}]);
  const critical = nameBlob('creatures/coat.png','image',image.bytes,{critical:true});
  expect((await prepareProjectOutput(directory(),{...input,namedFiles:[critical.file,rig.file,maps.file]})).late).toEqual([{hash:rig.file.hash},{hash:maps.file.hash}]);
  const criticalAlias = nameBlob('world/critical.png','image',image.bytes,{critical:true});
  expect((await prepareProjectOutput(directory(),{...input,namedFiles:[image.file,criticalAlias.file,rig.file,maps.file]})).late).toEqual([{hash:rig.file.hash},{hash:maps.file.hash}]);
  const publicBook = {...book,productFiles:false};
  expect((await prepareProjectOutput(directory(),{...input,platform:emitPlatformSections(new Map([['look/rigged-hulls',publicBook]]))})).late).toBeUndefined();
});
