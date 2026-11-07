// oxlint-disable-next-line import/no-nodejs-modules -- The build fixture owns its tiny project/output tree.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve files only beneath the owned fixture root.
import { basename, dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build as viteBuild } from 'vite';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { runCli } from '../src/sharddev/cli';
import { writeOutputProduct } from '@wildshard/sharddev/outputProduct';
import { writeRuntimeFiles } from '@wildshard/sharddev/outputRuntime';
import { mergeProjectBlobs } from '@wildshard/sharddev/projectOutput';
import { manifestImages, packManifestImages } from '@wildshard/sharddev/projectManifest';
import { parseManifestMetadata } from '@wildshard/format/minimap';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { parseOutputIndex } from '@wildshard/format/outputIndex';
import { buildShardfiles } from '../scripts/build-shardfiles.mjs';
import { mapPixelHash, mapTilesHash } from '../scripts/map-hash.mjs';
import { copyOutputProducts } from '../scripts/app-build/outputProducts.mjs';
import metadata from '../src/shards/far-reach/manifest.json';
import { FIXTURE_RUNTIME_COST } from './fixtures/clientPlanRuntime';

const owned: string[] = [], png = Uint8Array.from(readFileSync('test/fixtures/world-source/image.png'));
afterEach(() => { vi.restoreAllMocks();vi.unstubAllEnvs(); for (const folder of owned.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function put(root: string, path: string, bytes: string | Uint8Array): void {
  const target = resolve(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
}
async function fixture(): Promise<string> {
  mkdirSync('tmp', { recursive: true }); const root = mkdtempSync(resolve('tmp/catalog-build-')); owned.push(root);
  put(root, 'lint/tile-bake-debt.json', JSON.stringify({ version: 1, products: {} }));
  const placements = [];
  for (const [order, slug] of ['alpha', 'beta'].entries()) {
    const project = resolve(root, 'src/shards', slug), image = `public/assets/${slug}/map/top.webp`;
    put(project, 'shard.config.ts', 'export default {};\n');
    put(project, 'look/map.json', JSON.stringify({ why: 'Synthetic map uses the normal project inputs' }));
    put(project, 'runtime/client.d.ts', `// ${slug} client declarations only (LD9: a client-plan runtime ships no TypeScript)\nexport declare const client: string;\n`);
    put(root, image, png);
    put(project, 'look/map.baked.json', JSON.stringify({ image: `/assets/${slug}/map/top.webp`, tilesHash: mapTilesHash(project), pixelHash: await mapPixelHash(resolve(root, image)) }));
    placements.push({ slug, instance: slug, cell: [order, 0], size: [500, 500, 500] });
  }
  put(root, 'src/shared/game/grid/singleplayer.json', JSON.stringify({ version: 0, placements })); return root;
}
function builder(calls: string[][], fail?: string, missingTile = false): (args: string[]) => Promise<void> {
  return async args => {
    calls.push([...args]); const [command, project, destination] = args;
    if (command === 'validate') { await runCli(args); return; }
    if (command !== 'build' || project === undefined || destination === undefined) throw new Error('Unexpected fixture build');
    const slug = args.find(arg=>arg.startsWith('--output='))?.slice('--output='.length) ?? basename(project); if (slug === fail) throw new Error('Fixture build refused');
    const authored = parseManifestMetadata({ ...metadata, slug, name: slug, order: slug === 'alpha' ? 1 : 2 }, slug);
    const packed = packManifestImages(slug, authored, new Map(manifestImages(authored).map(row => [row.url, png])));
    const source = emptyShardfile({ slug, name: slug, author: 'Test', revision: 1, seed: 1 });
    for (const lod of [0, 1] as const) for (let x = 0; x < (lod === 0 ? 8 : 4); x++) for (let z = 0; z < (lod === 0 ? 8 : 4); z++) {
      const size = lod === 0 ? 62.5 : 125;
      source.tiles.push({ lod, x, z, bounds: { min: [-250 + x * size, 0, -250 + z * size], max: [-250 + (x + 1) * size, 0, -250 + (z + 1) * size] },
        files: [], geometricError: 0, decoded: 0, gpu: 0, compressed: 0, triangles: 0, draws: 0 });
    }
    if (missingTile && slug === 'alpha') source.tiles.shift();
    const merged = mergeProjectBlobs({ ...source, manifest: packed.manifest, runtime: { kind: 'client-plan', cost: FIXTURE_RUNTIME_COST, binds: [] } }, new Map(), packed.blobs);
    const runtime = args.includes('--copy-runtime') ? writeRuntimeFiles(project, destination) : undefined;
    writeOutputProduct(merged.shard, merged.assets, destination, { namedFiles: merged.namedFiles, ...(runtime === undefined ? {} : { runtime }) });
  };
}
function productCalls(calls: string[][]): string[][] {
  return calls.filter(call => call[0] === 'build').sort((a,b) => (a[1] ?? '').localeCompare(b[1] ?? ''));
}
it('refuses missing tile coverage after both fresh builds and cache reuse', async () => {
  const root = await fixture(), calls: string[][] = [];
  vi.stubEnv('WILDSHARD_SHARDFILE_CACHE', resolve(root, 'tmp/cache'));
  const options = { strict: false, reuse: true, build: builder(calls, undefined, true) };
  await expect(buildShardfiles(root, options)).rejects.toThrow('alpha: tile bake refused: missing/0/0/0');
  calls.length = 0;
  await expect(buildShardfiles(root, options)).rejects.toThrow('alpha: tile bake refused: missing/0/0/0');
  expect(productCalls(calls)).toHaveLength(0);
});
it('checks every multi-output raster independently in report mode',async()=>{
  const root=await fixture(),calls:string[][]=[],failures:Record<string,string>={},project=resolve(root,'src/shards/beta');
  vi.stubEnv('WILDSHARD_SHARDFILE_CACHE',resolve(root,'tmp/cache'));
  put(project,'outputs.json',JSON.stringify({outputs:[{slug:'beta-first'},{slug:'beta-second'}]}));
  const stamps=[];
  for(const slug of ['beta-first','beta-second']) {
    const image=`/assets/${slug}/map/top.webp`,path=`look/map.${slug}.baked.json`;
    put(root,`public${image}`,png);const stamp={image,tilesHash:mapTilesHash(project),pixelHash:await mapPixelHash(resolve(root,`public${image}`))};
    put(project,path,JSON.stringify(stamp));stamps.push({path,stamp});
  }
  const options={strict:false,reuse:true,build:builder(calls),onFailure:(slug:string,error:unknown)=>{failures[slug]=String(error);}};
  expect(await buildShardfiles(root,options)).toBe(3);expect(failures).toEqual({});
  const second=stamps[1];if(second===undefined)throw new Error('Fixture needs two maps');
  put(project,second.path,JSON.stringify({...second.stamp,pixelHash:'0'.repeat(64)}));
  expect(await buildShardfiles(root,options)).toBe(2);
  expect(failures['beta-second']).toContain('decoded pixels differ');expect(failures['beta-first']).toBeUndefined();
});
it('a strict generation phase builds only its scope and never checks another project map', async () => {
  const root=await fixture(),calls:string[][]=[];
  put(root,'src/shards/beta/look/map.baked.json','{"image":"foreign invalid map"}');
  expect(await buildShardfiles(root,{strict:true,scope:['alpha'],build:builder(calls)})).toBe(1);
  expect(calls.map(args=>basename(args[1]??''))).toEqual(['alpha']);
  await expect(buildShardfiles(root,{scope:['alpha'],only:['alpha'],build:builder(calls)})).rejects.toThrow('cannot be combined');
});
it('builds client-plan runtimes without copying TypeScript while publishing only data products with the app', async () => {
  const root = await fixture(), calls: string[][] = [];
  expect(await buildShardfiles(root, { strict: true, copyRuntime: true, build: builder(calls) })).toBe(2);
  expect(calls.map(call => call[0])).toEqual(['build', 'build']);
  expect(calls.every(call => call.includes('--copy-runtime'))).toBe(true);
  const output = resolve(root, 'out');
  for (const slug of ['alpha', 'beta']) expect(existsSync(resolve(output, slug, 'runtime'))).toBe(false);
  expect(readdirSync(output).sort()).toEqual(['alpha', 'beta']);
  put(root, 'main.js', 'export const ready = true;\n');
  put(output, 'alpha/.build-key', 'not shipped');
  await viteBuild({ root, configFile: false, publicDir: false, logLevel: 'silent', build: {
    outDir: resolve(root, 'dist'), lib: { entry: resolve(root, 'main.js'), formats: ['es'], fileName: 'app' },
  } });
  copyOutputProducts(root, resolve(root, 'dist'));
  const shipped = resolve(root, 'dist/shardfiles');
  expect(readdirSync(shipped).sort()).toEqual(['alpha', 'beta']);
  for (const slug of ['alpha', 'beta']) {
    expect(existsSync(resolve(shipped, slug, 'shard.json'))).toBe(true);
    expect(existsSync(resolve(shipped, slug, 'runtime'))).toBe(false);
    expect(existsSync(resolve(shipped, slug, '.build-key'))).toBe(false);
  }
});

it('passes the runtime flag only for closed runtimes and ships no runtime TypeScript', async () => {
  const root = await fixture(), calls: string[][] = [];
  put(root, 'src/shards/beta/runtime/index.ts', "import '../data/native';\n");
  await buildShardfiles(root, { strict: true, copyRuntime: 'closed', build: builder(calls) });
  expect(calls.map(call => call[0])).toEqual(['build', 'build']);
  expect(productCalls(calls).map(call => call.includes('--copy-runtime'))).toEqual([true, false]);
  expect(existsSync(resolve(root, 'out/alpha/runtime'))).toBe(false);
  expect(existsSync(resolve(root, 'out/beta/runtime'))).toBe(false);
  expect(existsSync(resolve(root, 'out/catalog.json'))).toBe(false);
});

it('uses the same product flags for ordinary and strict builds', async () => {
  const root = await fixture(), flags: string[][][] = [];
  put(root, 'src/shards/beta/runtime/index.ts', "import '../data/native';\n");
  for (const options of [{ strict: false }, { strict: true, copyRuntime: 'closed' as const }]) {
    const calls: string[][] = [];
    await buildShardfiles(root, { ...options, build: builder(calls) });
    flags.push(productCalls(calls).map(call => call.slice(3)));
  }
  expect(flags[0]).toEqual(flags[1]);
  expect(flags[0]?.map(row => row.includes('--copy-runtime'))).toEqual([true, false]);
});


it('reports exact changed map inputs while still refusing publication', async () => {
  const root = await fixture(), calls: string[][] = [], error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const project = resolve(root, 'src/shards/alpha');
  const expected = mapTilesHash(project);
  put(project, 'world/changed.ts', 'export const placement = 2;\n');
  const actual = mapTilesHash(project);
  try {
    await expect(buildShardfiles(root, { strict: true, build: builder(calls) })).rejects.toThrow('does not match its world');
    expect(existsSync(resolve(root, 'out/catalog.json'))).toBe(false);
    expect(error).toHaveBeenCalledWith(`wildshard map inputs: ${JSON.stringify({ shard: 'alpha', expected, actual, files: {
      'look/map.json': hashImmutableBytes(Uint8Array.from(readFileSync(resolve(project, 'look/map.json')))),
      'shard.config.ts': hashImmutableBytes(new TextEncoder().encode('export default {};\n')),
      'world/changed.ts': hashImmutableBytes(new TextEncoder().encode('export const placement = 2;\n')),
    } })}`);
  } finally { error.mockRestore(); }
});


it('reuses exact inputs in strict CI while validating every cached product and rejecting damaged cache bytes',async()=>{
 const root=await fixture(),calls:string[][]=[],options={strict:true,reuse:true,build:builder(calls)};
 vi.stubEnv('WILDSHARD_SHARDFILE_CACHE',resolve(root,'tmp/cache'));
 expect(await buildShardfiles(root,options)).toBe(2);expect(productCalls(calls)).toHaveLength(2);
 calls.length=0;
 expect(await buildShardfiles(root,options)).toBe(2);expect(productCalls(calls)).toHaveLength(0);
 expect(calls.filter(call=>call[0]==='validate')).toHaveLength(2);
 put(root,'src/shared/game-input.ts','export const changed=1;');calls.length=0;
 expect(await buildShardfiles(root,options)).toBe(2);expect(productCalls(calls)).toHaveLength(2);
 const index=parseOutputIndex(JSON.parse(readFileSync(resolve(root,'out/alpha/shard.json'),'utf8')));
 const entry=index.sections[0];if(entry===undefined)throw new Error('Missing fixture section');
 // A damaged restored cache is rejected by the ordinary strict validator.
 const cache=resolve(root,'tmp/cache/alpha'),key=readdirSync(cache).find(entryName=>/^[a-f0-9]{64}$/u.test(entryName));
 if(key===undefined)throw new Error('Missing cached product');
 for(const savedKey of readdirSync(cache).filter(entryName=>/^[a-f0-9]{64}$/u.test(entryName)))put(cache,`${savedKey}/${entry.path}`,'{}');
 rmSync(resolve(root,'out/alpha'),{recursive:true,force:true});calls.length=0;
 await expect(buildShardfiles(root,options)).rejects.toThrow();
 expect(calls.some(call=>call[0]==='validate')).toBe(true);
});

it('strict cache reuse still refuses changed world/map inputs',async()=>{
 const root=await fixture(),calls:string[][]=[],options={strict:true,reuse:true,build:builder(calls)};
 vi.stubEnv('WILDSHARD_SHARDFILE_CACHE',resolve(root,'tmp/cache'));
 await buildShardfiles(root,options);
 put(root,'src/shards/alpha/world/changed.ts','export const placement=2;');
 await expect(buildShardfiles(root,options)).rejects.toThrow('does not match its world');
});
