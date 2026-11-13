// oxlint-disable-next-line import/no-nodejs-modules -- A trusted build-only cache owns its immutable encoder results.
import {lstatSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keys, never author paths, select cache files.
import {join} from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Concurrent publishers use unique temporary files, without locks or waits.
import {randomBytes} from 'node:crypto';
import * as v from 'valibot';
import {hashImmutableBytes} from '../immutable';

const digest=v.pipe(v.string(),v.regex(/^[a-f0-9]{64}$/u));
const headerBytes=144,magic='WSWTEX02';
const maximumWire=25_000_000,maximumEntry=headerBytes+maximumWire,maximumCache=128*1024*1024;
const filename=/^[a-f0-9]{64}\.bin$/u,legacyFilename=/^[a-f0-9]{64}\.json$/u;

function trim(directory:string):void {
 const files=readdirSync(directory,{withFileTypes:true});
 // Version-one JSON is optional memo data, never an input to the binary reader.
 for(const row of files)if(row.isFile()&&legacyFilename.test(row.name))rmSync(join(directory,row.name),{force:true});
 const rows=files.filter(row=>row.isFile()&&filename.test(row.name)).map(row=>{
  const path=join(directory,row.name),stat=lstatSync(path);return {path,size:stat.size,time:stat.mtimeMs};
 }).sort((a,b)=>b.time-a.time||a.path.localeCompare(b.path));
 let bytes=0,kept=0;
 for(const row of rows){
  if(kept>=128||bytes+row.size>maximumCache)rmSync(row.path,{force:true});
  else{bytes+=row.size;kept++;}
 }
}

/** Pure transform memo only. Every caller still admits the exact cached bytes.
 * Missing, corrupt or unwritable storage encodes normally; failed encodes never publish. */
export function cachedWorldTexture(directory:string|undefined,key:string,encode:()=>Uint8Array,admit:(bytes:Uint8Array)=>unknown):Uint8Array {
 v.parse(digest,key);
 const file=directory===undefined?undefined:join(directory,`${key}.bin`);
 if(file!==undefined)try{
  const stat=lstatSync(file);
  if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>headerBytes&&stat.size<=maximumEntry){
   const wire=readFileSync(file),text=new TextDecoder('utf-8',{fatal:true});
   if(wire.length>headerBytes&&wire.length<=maximumEntry){
    const header=new DataView(wire.buffer,wire.byteOffset,headerBytes),bytes=wire.subarray(headerBytes);
    if(text.decode(wire.subarray(0,8))===magic&&text.decode(wire.subarray(8,72))===key&&
     header.getUint32(136,true)===bytes.length&&header.getUint32(140,true)===0&&
     hashImmutableBytes(bytes)===text.decode(wire.subarray(72,136))){
     admit(bytes);return Uint8Array.from(bytes);
    }
   }
  }
 }catch{/* A cache is never authority for an invalid or unavailable texture. */}
 const bytes=encode();admit(bytes);
 if(bytes.length===0||bytes.length>maximumWire)throw new Error('World texture memo wire cap exceeded');
 if(file!==undefined&&directory!==undefined){
  const temporary=`${file}.${randomBytes(8).toString('hex')}.tmp`;
  try{
   mkdirSync(directory,{recursive:true});
   const wire=new Uint8Array(headerBytes+bytes.length),text=new TextEncoder(),header=new DataView(wire.buffer);
   wire.set(text.encode(magic));wire.set(text.encode(key),8);wire.set(text.encode(hashImmutableBytes(bytes)),72);
   header.setUint32(136,bytes.length,true);wire.set(bytes,headerBytes);
   writeFileSync(temporary,wire);
   renameSync(temporary,file);trim(directory);
  }catch{/* An optional memo write cannot turn a valid encode into a failure. */}
  finally{try{rmSync(temporary,{force:true});}catch{/* Failed cache cleanup leaves no reusable entry. */}}
 }
 return bytes;
}
