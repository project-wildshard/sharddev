// Ring 2, J186: generated-program builds repeatedly exhausted the eight-
// second child budget on Linux. Source bundling, real input edits and full
// admission belong to this cold author journey, not the quick candidate
// or hooks. No injected compiler or admission double.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after,test} from 'node:test';
import sharp from 'sharp';
import {installWildshard} from '../../src/test/helpers/install.ts';

const {readTar}=await import('@wildshard/format/tar');
const {loadHeadlessProduct}=await import('@wildshard/engine/host/headlessProduct');
const {outputDescriptor}=await import('@wildshard/engine/game/shardfile/outputDescriptor');

const parent=process.env.WS_PROOF_SCRATCH??tmpdir();mkdirSync(parent,{recursive:true});
const root=mkdtempSync(join(parent,'author-inputs-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const bin=installWildshard(root),app=join(root,'app'),repo=join(app,'input-isle'),source=join(repo,'src');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity={slug:'input-isle',name:'Input isle',author:'Outside author',seed:1,revision:1};
let manifest;
function cli(args,success=true){
 const run=spawnSync(process.execPath,[bin,...args],{cwd:app,encoding:'utf8',timeout:30_000,
  env:{...process.env,WILDSHARD_GEN_CACHE:join(root,'generation'),WILDSHARD_SHARDFILE_CACHE:join(root,'compiler')}});
 assert.ifError(run.error);if(success)assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);else assert.notEqual(run.status,0);return run;
}
async function build(name,flags=[]){const output=join(app,name);cli(['build',source,output,'--product-only',...flags]);return loadHeadlessProduct(output);}
function config(body){writeFileSync(join(source,'shard.config.ts'),`import {emptyShardfile} from '@wildshard/sdk/author';
 import {nameBlob} from '@wildshard/sdk/blobs';
 import {registeredJsonSchema} from '@wildshard/sdk/formatJsonSchema';
 export async function generate(ctx){const shard=emptyShardfile(${JSON.stringify(identity)});${body}}
 export default generate;`);}
const token=`const files=await ctx.cached({id:'token',inputs:['assets/token.bin']},inputs=>new Map([['token.bin',inputs.get('assets/token.bin')]]));
 const blob=nameBlob('authored/token.bin','bin',files.get('token.bin'));
 return {shard,output:{namedFiles:[blob.file],assets:new Map([[blob.file.hash,blob.bytes]])}};`;

test('an outside author creates its input project',{timeout:45_000},()=>{
 cli(['new',repo,'input-isle','--empty']);
});
test('the author builds its initial product',{timeout:45_000},async()=>{
 await build('base');
});
test('the author derives level metadata from its real packed discovery',{timeout:45_000},()=>{
 cli(['pack',join(app,'base'),'--out',join(root,'base.tar')]);
 const files=readTar(readFileSync(join(root,'base.tar'))),entry=[...files].find(([name])=>name.endsWith('/discovery.json'));
 assert.ok(entry);manifest=JSON.parse(new TextDecoder().decode(entry[1])).data;assert.equal(manifest.slug,'input-isle');
 // This author chooses a generated output instead of the empty sidecar it owns.
 rmSync(join(source,'generators/output.ts'));
});
test('generated input bytes reach the admitted product through the installed build',{timeout:45_000},async()=>{
 writeFileSync(join(source,'assets/token.bin'),new Uint8Array([11]));config(token);
 const product=await build('token-a');assert.deepEqual([...await product.file('authored/token.bin')],[11]);
});
test('editing an author input invalidates generation without changing the prior product',{timeout:45_000},async()=>{
 writeFileSync(join(source,'assets/token.bin'),new Uint8Array([12]));
 const product=await build('token-b');assert.deepEqual([...await product.file('authored/token.bin')],[12]);
 assert.deepEqual([...await (await loadHeadlessProduct(join(app,'token-a'))).file('authored/token.bin')],[11]);
});
test('one real image serves every level image alias in the emitted product',{timeout:45_000},async()=>{
 const bytes=await sharp({create:{width:4,height:4,channels:4,background:'#387ace'}}).png().toBuffer();
 writeFileSync(join(source,'shared.png'),bytes);const url='/src/shards/input-isle/shared.png';
 manifest.card={thumb:url,portrait:url,landscape:url};manifest.minimap.image=url;
 manifest.explore.art={world:url,models:url,sets:url,practice:url};
 writeFileSync(join(source,'manifest.json'),JSON.stringify(manifest));
 const product=await build('level'),level=product.shardfile.manifest,files=outputDescriptor(product.shardfile).index.files;
 assert.equal(level.card.thumb,level.minimap.image);assert.equal(level.card.thumb,level.explore.art.world);
 assert.equal(files.filter(file=>file.hash===hash(bytes)).length,1);
 const image=files.find(file=>file.hash===hash(bytes));assert.ok(image);assert.deepEqual(Buffer.from(await product.file(image.name)),bytes);
});
test('Explorer-only art stays late while shared card and map bytes remain early',{timeout:45_000},async()=>{
 const bytes=await sharp({create:{width:4,height:4,channels:4,background:'#ee6842'}}).webp({lossless:true}).toBuffer();
 writeFileSync(join(source,'explorer.webp'),bytes);manifest.explore.art.world='/src/shards/input-isle/explorer.webp';
 writeFileSync(join(source,'manifest.json'),JSON.stringify(manifest));
 const product=await build('late'),shard=product.shardfile;
 assert.deepEqual(shard.late,[{hash:hash(bytes)}]);assert.ok(shard.library.includes(hash(bytes)));
 assert.ok(!shard.late.some(row=>row.hash===hash(readFileSync(join(source,'shared.png')))));
});
test('a named JSON producer reaches a real packed and readmitted product',{timeout:45_000},async()=>{
 const rows={bosses:{key:'bosses'},elites:{key:'elites'},nonnegative:true,legacyNamespace:'content',refuseWrites:false};
 config(`const blob=nameBlob('quests/persistence.json','json',new TextEncoder().encode(JSON.stringify(${JSON.stringify(rows)})),{jsonSchema:registeredJsonSchema('quests/persistence.json')});
 return {shard,output:{namedFiles:[blob.file],assets:new Map([[blob.file.hash,blob.bytes]])}};`);
 const product=await build('json');assert.deepEqual(await product.json('quests/persistence.json'),rows);
 cli(['pack',join(app,'json'),'--out',join(root,'json.tar')]);const files=readTar(readFileSync(join(root,'json.tar')));
 assert.ok([...files.values()].some(bytes=>new TextDecoder().decode(bytes)===JSON.stringify(rows)));
});
test('a generated map ships its actual lossless pixels and author source identity',{timeout:45_000},async()=>{
 config(`const pixels=new Uint8Array(4000000);for(let i=0;i<pixels.length;i+=4){pixels[i]=39;pixels[i+1]=83;pixels[i+2]=121;pixels[i+3]=255;}
 return {shard,output:{},map:{pixels,name:'ui/map'}};`);
 const product=await build('map',[`--generated-map-tiles-hash=${'a'.repeat(64)}`]);
 assert.equal(product.shardfile.map.tilesHash,'a'.repeat(64));
 const bytes=await product.file('ui/map'),{data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,1000);assert.equal(info.height,1000);assert.deepEqual([...data.subarray(0,info.channels)],[39,83,121,...info.channels===4?[255]:[]]);
 assert.ok(data.every((value,index)=>value===[39,83,121,255][index%info.channels]));
 assert.equal(hash(bytes),product.shardfile.map.image);
});
test('an edited map program ships new pixels while its previous product stays immutable',{timeout:45_000},async()=>{
 config(`const pixels=new Uint8Array(4000000);for(let i=0;i<pixels.length;i+=4){pixels[i]=81;pixels[i+1]=83;pixels[i+2]=121;pixels[i+3]=255;}
 return {shard,output:{},map:{pixels,name:'ui/map'}};`);
 const product=await build('map-edited',[`--generated-map-tiles-hash=${'b'.repeat(64)}`]),old=await loadHeadlessProduct(join(app,'map'));
 assert.equal(product.shardfile.map.tilesHash,'b'.repeat(64));assert.notEqual(product.shardfile.map.image,old.shardfile.map.image);
 const pixels=await sharp(await product.file('ui/map')).raw().toBuffer();assert.equal(pixels[0],81);
 const previous=await sharp(await old.file('ui/map')).raw().toBuffer();assert.equal(previous[0],39);
});
test('a missing declared level image refuses the actual installed build',{timeout:45_000},()=>{
 manifest.card.thumb='/src/shards/input-isle/absent.png';writeFileSync(join(source,'manifest.json'),JSON.stringify(manifest));
 const run=cli(['build',source,join(app,'refused'),'--product-only',`--generated-map-tiles-hash=${'a'.repeat(64)}`],false);
 assert.match(run.stderr,/absent\.png/);
});
