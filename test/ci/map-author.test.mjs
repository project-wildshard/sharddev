// J186: an installed author's actual map output, explicitly in CI only.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { installWildshard } from '../../src/test/helpers/install.ts';

const parent = process.env.WS_PROOF_SCRATCH ?? tmpdir();
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'map-author-'));
after(() => rmSync(root, { recursive: true, force: true }));
const bin = installWildshard(root), app = join(root, 'app'), source = join(app, 'map-isle');
const author = createRequire(join(app, 'node_modules/@wildshard/sharddev/package.json'));
const { rasterSceneMap } = await import(pathToFileURL(author.resolve('@wildshard/sharddev/bake/groundMap')).href);
const { rasterDataMap } = await import(pathToFileURL(author.resolve('@wildshard/sharddev/scripts/bake-data-maps.mjs')).href);
const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');
function floorFixture() {
  const original = readFileSync('test/fixtures/shard-assets/triangle.glb');
  const jsonSize = original.readUInt32LE(12), document = JSON.parse(original.subarray(20, 20 + jsonSize).toString());
  document.nodes = [{ mesh: 0, name: 'kept' }, { mesh: 0, name: 'omitted', translation: [0, 10, 0] }];
  document.scenes = [{ nodes: [0, 1] }]; document.scene = 0;
  const text = Buffer.from(JSON.stringify(document)), json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(json);
  const binary = Buffer.from(original.subarray(28 + jsonSize));
  [0, 4, 0, 0, 4, 20, 20, 4, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const chunk = Buffer.alloc(8); chunk.writeUInt32LE(binary.length); chunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, chunk, binary]);
}
const floor = floorFixture();
const style = { kind: 'void', void: 'transparent', stone: ['#7d7466', '#a0937a', '#c2b08c'], stoneBands: [40, 60], grass: '#79a84f', rim: '#1a1526' };
const settings = { style, painter: { version: 1, glbs: ['floor.glb'] } };
function run(args, success = true) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: app, encoding: 'utf8', timeout: 8000,
    env: { ...process.env, WILDSHARD_GEN_CACHE: join(root, 'gen'), WILDSHARD_SHARDFILE_CACHE: join(root, 'compiler') } });
  const timing = result.stdout.split('\n').filter(line => line.startsWith('author timing: '));
  console.info(`map author CLI: ${JSON.stringify({ command: args[0], seconds: (performance.now() - started) / 1000, exit: result.status, error: result.error?.message, timing })}`);
  if (result.error !== undefined) console.error(result.stdout, result.stderr);
  assert.ifError(result.error);
  if (success) assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  else assert.notEqual(result.status, 0);
  return result;
}
function config(missing = false, selected = settings, inputs = ['floor.glb']) {
  writeFileSync(join(source, 'shard.config.ts'), `
import { emptyShardfile } from '@wildshard/sharddev/author';
import { rasterSceneMap } from '@wildshard/sharddev/bake/groundMap';
export default async function generate(ctx) {
 const files = await ctx.cached({ id: 'floor', inputs: ${JSON.stringify(inputs)} }, inputs => inputs);
 const read = name => { const value = files.get(name); if (value === undefined) throw new Error('Undeclared map input ' + name); return value; };
 const raster = await rasterSceneMap(${JSON.stringify(missing ? { ...settings, painter: { version: 1, glbs: ['absent.glb'] } } : selected)},
  { input: read, bytes: read, json: name => JSON.parse(new TextDecoder().decode(read(name))) });
 return { shard: emptyShardfile({ slug: 'map-isle', name: 'Map isle', author: 'Outside author', seed: 1, revision: 1 }),
  output: {}, map: { pixels: raster.pixels, name: 'ui/map' } };
}
`);
}
let baseline;
test('the installed author owns its source inputs', { timeout: 9500 }, () => {
  run(['new', source, 'map-isle', '--empty']);
  rmSync(join(source, 'generators/output.ts'));
  writeFileSync(join(source, 'floor.glb'), floor);
  config();
});
test('owned map pixels survive actual build, lossless encoding and product readmission', { timeout: 9500 }, async () => {
  run(['build', source, join(app, 'first'), '--product-only']);
  const read = name => { assert.equal(name, 'floor.glb'); return floor; };
  const direct = await rasterSceneMap(settings, { input: read, bytes: read, json: () => { throw new Error('No JSON'); } });
  const legacy = await rasterDataMap(settings, { input: read, bytes: read, json: () => { throw new Error('No JSON'); } });
  assert.deepEqual(Buffer.from(direct.pixels), Buffer.from(legacy.pixels));
  const product = await loadHeadlessProduct(join(app, 'first'));
  baseline = Buffer.from(await product.file('ui/map'));
  const { data, info } = await sharp(baseline).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [1000, 1000, 4]);
  assert.ok(data.some((value, index) => index % 4 === 3 && value !== 0), 'The real floor must paint nonempty pixels');
  assert.deepEqual(data, Buffer.from(direct.pixels));
  direct.pixels.fill(0);
  assert.deepEqual(Buffer.from(await product.file('ui/map')), baseline);
});
test('a second map build keeps every encoded byte and packs the real product', { timeout: 9500 }, async () => {
  run(['build', source, join(app, 'second'), '--product-only']);
  const product = await loadHeadlessProduct(join(app, 'second'));
  assert.deepEqual(Buffer.from(await product.file('ui/map')), baseline);
  run(['pack', join(app, 'second'), '--out', join(root, 'map.tar')]);
});
test('an undeclared map input fails the real build without changing its prior product', { timeout: 9500 }, async () => {
  config(true);
  const failed = run(['build', source, join(app, 'refused'), '--product-only'], false);
  assert.match(`${failed.stdout}\n${failed.stderr}`, /Undeclared map input absent.glb/);
  const product = await loadHeadlessProduct(join(app, 'first'));
  assert.deepEqual(Buffer.from(await product.file('ui/map')), baseline);
});
test('owned baked selectors and repeated placements reach the packed map without a file handoff', { timeout: 9500 }, async () => {
  const recipe = { scene: { root: 'root', nodes: [
    { kind: 'group', id: 'root', children: ['left', 'right', 'pooled'] },
    { kind: 'object', id: 'left', source: 'selected', position: [-20, 0, 0] },
    { kind: 'object', id: 'right', source: 'selected', position: [20, 0, 0] },
    { kind: 'mesh', id: 'pooled', geometry: 'kept', position: [0, 0, 40] },
  ], materials: [] }, imports: [{ id: 'selected', kind: 'baked', piece: 'fixture', only: { warm: true } }] };
  const sources = new Map([
    ['scene.json', Buffer.from(JSON.stringify(recipe))],
    ['bake.json', Buffer.from(JSON.stringify({ kinds: [{ name: 'kept', warm: true }, { name: 'omitted', warm: false }] }))],
    ['bakes/fixture.glb', floor],
  ]);
  for (const [name, bytes] of sources) { mkdirSync(join(source, name, '..'), { recursive: true }); writeFileSync(join(source, name), bytes); }
  const selected = { style, painter: { version: 1, scenes: { pools: ['bakes/fixture.glb'],
    bakes: [{ piece: 'fixture', rows: { file: 'bake.json', path: [] }, directory: 'bakes' }],
    recipes: [{ file: 'scene.json', path: [] }] } } };
  config(false, selected, [...sources.keys()]);
  run(['build', source, join(app, 'selected'), '--product-only']);
  const read = name => { const bytes = sources.get(name); assert.ok(bytes, `Undeclared ${name}`); return bytes; };
  const readers = { input: read, bytes: read, json: name => JSON.parse(read(name).toString()) };
  const legacy = await rasterDataMap(selected, readers);
  assert.equal(legacy.raster.triangles, 3);
  assert.equal(legacy.raster.height.reduce((maximum, value) => Math.max(maximum, value), -Infinity), 4 * 65536);
  const product = await loadHeadlessProduct(join(app, 'selected'));
  const pixels = await sharp(await product.file('ui/map')).ensureAlpha().raw().toBuffer();
  assert.deepEqual(pixels, Buffer.from(legacy.pixels));
});
