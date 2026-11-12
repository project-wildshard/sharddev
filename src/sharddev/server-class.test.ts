import { afterEach, expect, it } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The product fixture owns its generated directories.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve fixture files inside the owned output directory.
import { join, resolve } from 'node:path';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { readOutputDownloadIndex } from '@wildshard/format/outputDownload';
import { parseOutputIndex } from '@wildshard/format/outputIndex';
import { resolveOutputDescriptor } from '@wildshard/engine/game/shardfile/outputDescriptor';
import { shardProductData } from '@wildshard/engine/game/shardfile/productData';
import { copyOutputProducts } from '@wildshard/engine/scripts/app-build/outputProducts.mjs';
import { nativeAssemblyFiles, serverBlob, type NativeAssemblyPlan } from './blobs';
import { loadHeadlessProduct } from '@wildshard/engine/host/headlessProduct';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { validateOutputProduct, writeOutputProduct } from './outputProduct';
import { prepareProjectOutput } from './projectOutput';
import { nodeOutputDescriptorChecks } from '@wildshard/engine/game/shardfile/outputChecksNode';
import { parseShardfile } from '@wildshard/format/shardSchema';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function root(): string { mkdirSync('tmp', { recursive: true }); const path = mkdtempSync(resolve('tmp', 'server-class-')); directories.push(path); return path; }
const MARK = new TextEncoder().encode('server-class-only-bytes-never-in-a-client-pack');

/** One product with a client file (library) and one server-class binary. */
function product(destination: string) {
  const shard = emptyShardfile({ slug: 'server-class', name: 'Server class', author: 'Test', revision: 1, seed: 3 });
  const client = new Uint8Array([1, 2, 3]), hash = hashImmutableBytes(client);
  shard.files = [{ hash, kind: 'binary', compressed: 3, decoded: 3, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: false }];
  shard.library = [hash]; shard.budgets.library = { resident: 3, compressed: 3 };
  const server = serverBlob('server/navmesh.bin', { bytes: MARK });
  return { server, index: writeOutputProduct(shard, new Map([[hash, client]]), destination, { server: [server] }) };
}
const every = (folder: string): string[] => readdirSync(folder, { recursive: true, withFileTypes: true }).filter(row => row.isFile()).map(row => join(row.parentPath, row.name));
const holds = (bytes: Uint8Array): boolean => Buffer.from(bytes).includes(Buffer.from(MARK));

it('lists a server file in the index, validated and hashed, but never in its client files', () => {
  const directory = root(), { server, index } = product(directory);
  expect(index.admission.server).toEqual([server.file]);
  expect(existsSync(resolve(directory, server.file.path))).toBe(true);
  expect(index.files.map(file => file.hash)).not.toContain(server.file.hash);

  const validated = validateOutputProduct(directory);
  expect(validated.shard.files.map(file => file.hash)).not.toContain(server.file.hash);
  expect([...validated.assets.keys()]).not.toContain(server.file.hash);
  expect(Object.keys(validated.shard)).not.toContain('server');

  // validated and hashed like any other file
  writeFileSync(resolve(directory, server.file.path), 'tampered');
  expect(() => validateOutputProduct(directory)).toThrow(/hash|size/u);
  rmSync(resolve(directory, server.file.path));
  expect(() => validateOutputProduct(directory)).toThrow();
});

it('gives the client fetch list nothing to ask for: the schedule, the admitted source and every read miss it', async () => {
  const directory = root(), { server } = product(directory);
  const input: unknown = JSON.parse(readFileSync(resolve(directory, 'shard.json'), 'utf8'));
  const schedule = readOutputDownloadIndex(input);
  const listed = [...schedule.sections, ...schedule.schemas, ...schedule.files, ...schedule.packs ?? []];
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.map(row => row.path).filter(path => path.startsWith('server/'))).toEqual([]);
  expect(listed.map(row => row.hash)).not.toContain(server.file.hash);

  const reads: string[] = [];
  const read = (path: string): Promise<Uint8Array> => { reads.push(path); return Promise.resolve(Uint8Array.from(readFileSync(resolve(directory, path)))); };
  const assembled = await resolveOutputDescriptor(input, { offline: false, hash: bytes => Promise.resolve(hashImmutableBytes(bytes)), read, checks: nodeOutputDescriptorChecks });
  const source = parseShardfile(assembled);
  expect(source.files.map(file => file.hash)).not.toContain(server.file.hash);
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.filter(path => path.startsWith('server/'))).toEqual([]);
});

it('never publishes the server class to the app, and only a server reader can name it', async () => {
  const tree = root(), slug = 'server-class', { server } = product(resolve(tree, 'out', slug));
  const dist = resolve(tree, 'dist');
  copyOutputProducts(tree, dist);
  const published = every(resolve(dist, 'shardfiles', slug));
  expect(published.length).toBeGreaterThan(0);
  expect(published.filter(path => path.includes(`${slug}/server/`))).toEqual([]);
  for (const path of published) expect(holds(readFileSync(path))).toBe(false);
  // standalone's server is a worker on the device: it reads them from its server pack (C2), never a tree of their own
  expect(existsSync(resolve(dist, 'server-class'))).toBe(false);

  const headless = await loadHeadlessProduct(resolve(tree, 'out', slug));
  expect(headless.hasFile(server.file.name)).toBe(true);
  expect(await headless.file(server.file.name)).toEqual(MARK);

  const client = shardProductData(headless.shardfile, 'https://example.test/', () => Promise.reject(new Error('A client must not read this')));
  expect(client.hasFile(server.file.name)).toBe(false);
  await expect(client.file(server.file.name)).rejects.toThrow(/names no file/u);
});

it('carries a generator\'s server files from its project output to the writer', async () => {
  const blob = serverBlob('server/navmesh.bin', { bytes: MARK });
  expect((await prepareProjectOutput(root(), { server: [blob] })).options.server).toEqual([blob]);
  await expect(prepareProjectOutput(root(), { server: [{ file: blob.file }] })).rejects.toThrow();
});

it('refuses a server class that overlaps the client, escapes server/ or is unregistered', () => {
  const directory = root(), { index } = product(directory), row = index.admission.server?.[0];
  if (row === undefined) throw new Error('Missing fixture server row');
  const client = index.files[0]; if (client === undefined) throw new Error('Missing fixture client file');
  const withServer = (rows: readonly unknown[]): unknown => ({ ...index, admission: { ...index.admission, server: rows } });
  expect(() => parseOutputIndex(withServer([{ ...row, hash: client.hash, path: `server/bin/${client.hash}.bin` }]))).toThrow(/never also a client/u);
  expect(() => parseOutputIndex(withServer([{ ...row, path: `blobs/bin/${row.hash}.bin` }]))).toThrow();
  expect(() => parseOutputIndex(withServer([{ ...row, name: 'data/physics.bin' }]))).toThrow();
  expect(() => parseOutputIndex(withServer([{ ...row, kind: 'json', path: `server/json/${row.hash}.json`, name: 'server/x.json', schema: 'unregistered' }]))).toThrow(/Unregistered/u);
  expect(() => serverBlob('server/x.json', { schema: 'unregistered', value: {} })).toThrow(/Unregistered/u);
});

it('a native world names its plan, rows and binaries through one server class', () => {
  const plan: NativeAssemblyPlan = { kind: 'native-assembly', level: { speed: 5, ground: { size: 500, height: 0 } }, terrain: { kind: 'bake-ground' }, navigation: 'shard',
    bake: { rows: { file: 'server/physics.json' }, reader: { label: 'Fixture', resolution: 4, size: 4 }, ground: 'data/ground.bin', colliders: [], read: 'bake' }, collision: { resolution: 4 }, entries: { walk: {} }, features: [{ host: 'decisions' }] };
  const files = nativeAssemblyFiles(plan, new Map([['server/physics.json', {}]]), new Map([['server/navmesh.bin', MARK]]));
  expect(files.map(row => row.file.name)).toEqual(['server/native-assembly.json', 'server/physics.json', 'server/navmesh.bin']);
  expect(() => nativeAssemblyFiles({ ...plan, features: [] }, new Map())).toThrow();
});
