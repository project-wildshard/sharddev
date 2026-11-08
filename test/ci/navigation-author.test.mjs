// J186: installed author -> real bake -> product admission -> runtime queries.
// Explicit CI proof, outside local hook globs. No renderer or live world.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { installWildshard } from '../../src/test/helpers/install.ts';

const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');
const { parseNavmesh } = await import('@wildshard/engine/physics/navmesh');
const { outputDescriptor } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const parent = process.env.WS_PROOF_SCRATCH ?? tmpdir();
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'navigation-author-'));
after(() => rmSync(root, { recursive: true, force: true }));
const bin = installWildshard(root), app = join(root, 'app'), source = join(app, 'marsh-road');

function run(args, success = true) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: app, encoding: 'utf8', timeout: 8000,
    env: { ...process.env, WILDSHARD_GEN_CACHE: join(root, 'gen'), WILDSHARD_SHARDFILE_CACHE: join(root, 'compiler') } });
  assert.ifError(result.error);
  if (success) assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  else assert.notEqual(result.status, 0);
  return result;
}

function config(threshold = 0.5, margin = 0.25) {
  writeFileSync(join(source, 'shard.config.ts'), `
import { emptyShardfile } from '@wildshard/sharddev/author';
import { bakeNavigation } from '@wildshard/sharddev/bake/navigation';
import { declareNavigation } from '@wildshard/sharddev/bake/navigationAsset';
import { encodePortableBytes } from '@wildshard/sharddev/bake/portableBytes';
import { navmeshGroundExclusion } from '@wildshard/sharddev/scripts/bake/navmeshGround.ts';
import { ScalarLatticeBindings } from '@wildshard/engine/world/scalarChannel';
export default async function generate(ctx) {
 const files = await ctx.cached({ id: 'wet', inputs: [] }, () => new Map([
  ['wet.bin', encodePortableBytes(new Uint8Array(Float32Array.from([1,1,1,1]).buffer))]
 ]));
 const scalars = new ScalarLatticeBindings();
 const terrain = { waterLevel() { return 0; }, trailDistance(x,z) { return Math.abs(z); } };
 const policy = { ground: { waterMargin: ${margin}, wetThreshold: ${threshold}, trailClearance: 3.5,
  wet: { res: 2, size: 32, values: { type: 'f32', count: 4, data: { file: 'wet.bin' } } } } };
 const exclude = navmeshGroundExclusion(policy, terrain, scalars); scalars.prepare(files);
 const positions = [], indices = [], height = x => x < -8 ? 0 : 2;
 for(let z=-16;z<=16;z++) for(let x=-16;x<=16;x++) positions.push(x,height(x),z);
 const tri=(a,b,c)=>{ const centroid=k=>(positions[3*a+k]+positions[3*b+k]+positions[3*c+k])/3;
  if(!exclude(centroid(0),centroid(2),centroid(1))) indices.push(a,b,c); };
 for(let z=0;z<32;z++) for(let x=0;x<32;x++) { const a=z*33+x;tri(a,a+33,a+1);tri(a+1,a+33,a+34); }
 const baked = bakeNavigation({positions,indices}, [{name:'small',radius:.3,height:1.8,climb:.4,slope:40}],
  {cellSize:.25,cellHeight:.1,tileSizeVoxels:128,minRegionArea:24,mergeRegionArea:64,maxSimplificationError:2,
   maxEdgeLength:24,maxVerticesPerPoly:6,detailSampleDistance:3,detailSampleMaxError:.8});
 const rows=declareNavigation(baked.bytes), shard=emptyShardfile({slug:'marsh-road',name:'Marsh road',author:'Outside author',seed:1,revision:1});
 for(const [hash,bytes] of rows.assets) if(ctx.asset(bytes)!==hash) throw new Error('Navigation address differs');
 shard.navigation=rows.navigation;shard.files.push(...rows.files);shard.critical.push(...rows.critical);
 shard.budgets.sim={compressed:1000000,resident:10000000};
 return {shard,output:{}};
}
`);
}

async function navigation(directory) {
  const product = await loadHeadlessProduct(directory), row = product.shardfile.navigation;
  assert.ok(row, 'The built product must admit navigation');
  const descriptor = outputDescriptor(product.shardfile), file = descriptor.index.files.find(file => file.hash === row.file);
  assert.ok(file, 'Navigation must be a charged immutable product file');
  const bytes = readFileSync(join(directory, file.path)), nav = parseNavmesh(Uint8Array.from(bytes).buffer);
  assert.ok(nav); nav.datum = () => 0;
  return { bytes, nav };
}

test('the installed author creates its real navigation project', { timeout: 9500 }, () => {
  run(['new', source, 'marsh-road', '--empty']); rmSync(join(source, 'generators/output.ts')); config();
});

test('an installed author builds a real wetland road with dry queries', { timeout: 9500 }, async () => {
  run(['build', source, join(app, 'road'), '--product-only']);
  const { nav } = await navigation(join(app, 'road'));
  const route = nav.findPath({x:-4,y:2,z:0}, {x:12,y:2,z:0}, .3);
  assert.ok(route && route.length >= 2, 'The authored trail through wet ground must remain traversable');
  assert.ok(Math.abs(route.at(-1).x - 12) < .5, 'The real path must reach its goal');
  assert.equal(nav.closestWalkable({x:4,y:2,z:12}, .3), null, 'Wet off-road terrain must not acquire polygons');
  assert.equal(nav.closestWalkable({x:-12,y:0,z:0}, .3), null, 'Submerged trail terrain must not acquire polygons');
});

test('the installed CLI packs the admitted navigation product', { timeout: 9500 }, () => {
  run(['pack', join(app, 'road'), '--out', join(root, 'road.tar')]);
});

test('the strict wet threshold survives a second actual author build', { timeout: 9500 }, async () => {
  config(1); run(['build', source, join(app, 'equality'), '--product-only']);
  const { nav, bytes } = await navigation(join(app, 'equality'));
  assert.ok(nav.closestWalkable({x:4,y:2,z:12}, .3), 'Wet equality must remain dry enough to walk');
  assert.equal(nav.closestWalkable({x:-12,y:0,z:0}, .3), null, 'Water exclusion remains active at wet equality');
  const baseline = await navigation(join(app, 'road'));
  assert.notDeepEqual(bytes, baseline.bytes, 'Changing the author policy must change real baked polygons');
});

test('an invalid policy refuses the real author build and preserves prior bytes', { timeout: 9500 }, async () => {
  const before = await navigation(join(app, 'road'));
  config(.5, -1);
  const refused = run(['build', source, join(app, 'invalid'), '--product-only'], false);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /(?:waterMargin|>=0|>= 0)/);
  const after = await navigation(join(app, 'road'));
  assert.deepEqual(after.bytes, before.bytes);
});
