import {afterEach,beforeAll,expect,test,vi} from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Every cache fixture is owned beneath the repository tmp directory.
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync,truncateSync,utimesSync,writeFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture paths never leave the owned cache root.
import {join,resolve} from 'node:path';
import {bakeWorldTexture} from './textureWasm';
import {cachedWorldTexture} from './worldTextureMemo';
import {writeImagePixels} from './image';
import {parseKtx2} from '../assets';
import {hashImmutableBytes} from '../immutable';

const owned:string[]=[];
let image:Uint8Array=new Uint8Array(),reference:Uint8Array=new Uint8Array();
const key='a'.repeat(64);
function fixture():string {
 mkdirSync('tmp',{recursive:true});const root=mkdtempSync(resolve('tmp','world-texture-cache-'));owned.push(root);return root;
}
beforeAll(async()=>{
 vi.stubEnv('WILDSHARD_WORLD_TEXTURE_CACHE',undefined);
 image=await writeImagePixels({width:8,height:4,pixels:Uint8ClampedArray.from({length:8*4*4},(_,i)=>(i*37+Math.floor(i/32)*19)%256)});
 reference=await bakeWorldTexture(image,'srgb');
});
afterEach(()=>{vi.unstubAllEnvs();for(const root of owned.splice(0))rmSync(root,{recursive:true,force:true});});

test.each([
 {role:'srgb' as const,flipY:false},
 {role:'srgb' as const,flipY:true},
 {role:'linear' as const,flipY:false},
 {role:'linear' as const,flipY:true},
])('returns the same $role flipY=$flipY encoder bytes cold and warm',async row=>{
 const root=fixture();vi.stubEnv('WILDSHARD_WORLD_TEXTURE_CACHE',root);
 const cold=await bakeWorldTexture(image,row.role,{flipY:row.flipY}),warm=await bakeWorldTexture(image,row.role,{flipY:row.flipY});
 expect(warm).toEqual(cold);expect(warm).not.toBe(cold);
 expect(readdirSync(root)).toHaveLength(1);
});

test('a hit skips encoding, re-admits its exact bytes and owns the returned storage',()=>{
 const root=fixture(),encode=vi.fn(()=>Uint8Array.from(reference)),admit=vi.fn(parseKtx2);
 const first=cachedWorldTexture(root,key,encode,admit);first.fill(0);
 const second=cachedWorldTexture(root,key,encode,admit);
 expect(second).toEqual(reference);expect(encode).toHaveBeenCalledTimes(1);expect(admit).toHaveBeenCalledTimes(2);
});

test('the atomic cache entry stores the original texture as binary, with no JSON payload',()=>{
 const root=fixture();cachedWorldTexture(root,key,()=>reference,parseKtx2);
 const file=join(root,`${key}.bin`);
 expect(existsSync(file)).toBe(true);
 const wire=readFileSync(file),header=new DataView(wire.buffer,wire.byteOffset,144),text=new TextDecoder();
 expect(text.decode(wire.subarray(0,8))).toBe('WSWTEX02');
 expect(text.decode(wire.subarray(8,72))).toBe(key);
 expect(text.decode(wire.subarray(72,136))).toBe(hashImmutableBytes(reference));
 expect(header.getUint32(136,true)).toBe(reference.length);expect(header.getUint32(140,true)).toBe(0);
 expect(wire.length).toBe(144+reference.length);expect(Uint8Array.from(wire.subarray(144))).toEqual(reference);
 expect(readdirSync(root)).toEqual([`${key}.bin`]);
});

test.each(['truncated','key','hash','payload','schema','length','reserved','trailing','oversize'] as const)('re-encodes a %s cache corruption instead of accepting it',kind=>{
 const root=fixture(),encode=vi.fn(()=>Uint8Array.from(reference)),file=join(root,`${key}.bin`);
 cachedWorldTexture(root,key,encode,parseKtx2);
 const wire=readFileSync(file),header=new DataView(wire.buffer,wire.byteOffset,144);
 if(kind==='truncated')writeFileSync(file,wire.subarray(0,143));
 else if(kind==='oversize')truncateSync(file,25_000_145);
 else if(kind==='trailing'){const extended=new Uint8Array(wire.length+1);extended.set(wire);writeFileSync(file,extended);}
 else{
  if(kind==='key')wire.fill(98,8,72);
  if(kind==='hash')wire.fill(48,72,136);
  if(kind==='payload')wire[144]=0;
  if(kind==='schema')wire[7]=51;
  if(kind==='length')header.setUint32(136,reference.length-1,true);
  if(kind==='reserved')header.setUint32(140,1,true);
  writeFileSync(file,wire);
 }
 expect(cachedWorldTexture(root,key,encode,parseKtx2)).toEqual(reference);expect(encode).toHaveBeenCalledTimes(2);
});

test.each(['dimensions','mips','transfer'] as const)('re-encodes a self-consistent cache with wrong %s',async kind=>{
 const root=fixture();vi.stubEnv('WILDSHARD_WORLD_TEXTURE_CACHE',root);
 await bakeWorldTexture(image,'srgb');
 const [name]=readdirSync(root);if(name===undefined)throw new Error('Missing cold cache entry');
 const file=join(root,name),entryKey=name.slice(0,-4);
 const bytes=cachedWorldTexture(root,entryKey,()=>{throw new Error('Missing cold cache bytes');},()=>undefined);
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(kind==='dimensions')header.setUint32(20,4,true);
 if(kind==='mips')header.setUint32(40,1,true);
 if(kind==='transfer')bytes[header.getUint32(48,true)+14]=1;
 // Use the real wire serializer to seed self-consistent but invalid texture content.
 rmSync(file);cachedWorldTexture(root,entryKey,()=>bytes,()=>undefined);
 const text=new TextDecoder();
 expect(text.decode(readFileSync(file).subarray(72,136))).toBe(hashImmutableBytes(bytes));
 expect(await bakeWorldTexture(image,'srgb')).toEqual(reference);
 expect(text.decode(readFileSync(file).subarray(72,136))).toBe(hashImmutableBytes(reference));
});

test('changed decoded pixels, roles and orientation get separate keys; invalid input still refuses',async()=>{
 const root=fixture();vi.stubEnv('WILDSHARD_WORLD_TEXTURE_CACHE',root);
 await bakeWorldTexture(image,'srgb');await bakeWorldTexture(image,'linear');await bakeWorldTexture(image,'srgb',{flipY:true});
 const changed=await writeImagePixels({width:8,height:4,pixels:new Uint8ClampedArray(8*4*4).fill(127)});
 expect(await bakeWorldTexture(changed,'srgb')).not.toEqual(reference);expect(readdirSync(root)).toHaveLength(4);
 await expect(bakeWorldTexture(new Uint8Array([1,2,3]),'srgb')).rejects.toThrow();expect(readdirSync(root)).toHaveLength(4);
});

test('disabled or unwritable storage encodes normally; failed encodes never publish',()=>{
 const root=fixture(),file=join(root,'not-a-directory');writeFileSync(file,'keep');
 const encode=vi.fn(()=>Uint8Array.from(reference));
 expect(cachedWorldTexture(undefined,key,encode,parseKtx2)).toEqual(reference);
 expect(cachedWorldTexture(file,key,encode,parseKtx2)).toEqual(reference);expect(readFileSync(file,'utf8')).toBe('keep');
 expect(()=>cachedWorldTexture(root,key,()=>{throw new Error('encode refused');},parseKtx2)).toThrow('encode refused');
 expect(existsSync(join(root,`${key}.bin`))).toBe(false);
 expect(()=>cachedWorldTexture(root,key,()=>reference,()=>{throw new Error('admission refused');})).toThrow('admission refused');
 expect(existsSync(join(root,`${key}.bin`))).toBe(false);
});

test('bounds cache count and bytes while preserving unrelated paths',()=>{
 const root=fixture();
 for(let i=0;i<130;i++){
  const file=join(root,`${i.toString(16).padStart(64,'0')}.bin`);writeFileSync(file,'old');utimesSync(file,1,1);
 }
 const large=join(root,`${'f'.repeat(64)}.bin`);writeFileSync(large,'old');truncateSync(large,128*1024*1024+1);utimesSync(large,0,0);
 writeFileSync(join(root,'keep.txt'),'keep');
 cachedWorldTexture(root,key,()=>reference,parseKtx2);
 expect(readdirSync(root).filter(name=>name.endsWith('.bin')).length).toBeLessThanOrEqual(128);
 expect(existsSync(large)).toBe(false);expect(readFileSync(join(root,'keep.txt'),'utf8')).toBe('keep');
 expect(cachedWorldTexture(root,key,()=>{throw new Error('warm encode');},parseKtx2)).toEqual(reference);
});

test('ignores old JSON and removes only owned regular legacy entries after publishing',()=>{
 const root=fixture(),legacy=join(root,`${key}.json`),unrelated=join(root,'keep.json');
 writeFileSync(legacy,'{"schema":1}');writeFileSync(unrelated,'keep');
 const encode=vi.fn(()=>reference);
 expect(cachedWorldTexture(root,key,encode,parseKtx2)).toEqual(reference);expect(encode).toHaveBeenCalledOnce();
 expect(existsSync(legacy)).toBe(false);expect(readFileSync(unrelated,'utf8')).toBe('keep');
});

test('refuses symlink cache reads without modifying their target; preserves payload subviews',()=>{
 const root=fixture(),outside=fixture(),file=join(root,`${key}.bin`);
 cachedWorldTexture(outside,key,()=>reference,parseKtx2);
 const target=join(outside,`${key}.bin`),original=readFileSync(target);symlinkSync(target,file);
 const storage=new Uint8Array(reference.length+6).fill(255);storage.set(reference,3);
 const encode=vi.fn(()=>storage.subarray(3,-3));
 expect(cachedWorldTexture(root,key,encode,parseKtx2)).toEqual(reference);expect(encode).toHaveBeenCalledOnce();
 expect(readFileSync(target)).toEqual(original);
 expect(cachedWorldTexture(root,key,()=>{throw new Error('warm encode');},parseKtx2)).toEqual(reference);
});

test('refuses invalid keys and empty or oversized encoder results without publishing',()=>{
 const root=fixture(),encode=vi.fn(()=>reference);
 expect(()=>cachedWorldTexture(root,'../escape',encode,parseKtx2)).toThrow();expect(encode).not.toHaveBeenCalled();
 for(const length of [0,25_000_001])expect(()=>cachedWorldTexture(root,key,()=>new Uint8Array(length),()=>undefined)).toThrow('wire cap exceeded');
 expect(readdirSync(root)).toEqual([]);
});
