#!/usr/bin/env node
// J198: prepare an already built candidate using actual phone WebKit links.
// Draft sdk 0.2 output is not relabelled until this exact product enters.
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync,statSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import '@wildshard/format/formatHook';
import {readCookData,cookMountPath} from '@wildshard/format/cookData';
import {cookPreparationBytes,readEntryPrograms,requireCookPreparation} from '@wildshard/format/cookPreparation';
import {parseOutputIndex,assembleOutputShardfile} from '@wildshard/format/outputIndex';
import {controlFileHashes,playLibrarySteps} from '@wildshard/format/admissionControl';
import {entryFileSteps} from '@wildshard/format/tierSelection';
import {validationSourceBytes} from '@wildshard/format/validationReceipt';
import {prepareAssetDecoders} from '@wildshard/format/product';
import {validateShardfileProduct} from '@wildshard/format/productValidation';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(dir,name)=>JSON.parse(readFileSync(join(dir,name),'utf8'));
const bytesOf=value=>validationSourceBytes(value);
const drain=steps=>{for(;;){const row=steps.next();if(row.done)return row.value;}};

function productPaths(dir){
  if(lstatSync(dir).isSymbolicLink())throw new Error('The shard file folder to prepare must be a regular directory');
  const entries=readdirSync(dir,{recursive:true,withFileTypes:true});
  if(entries.some(row=>!row.isDirectory()&&!row.isFile()))throw new Error('The shard file folder to prepare must hold regular files, not symlinks');
  return entries.filter(row=>row.isFile()).map(row=>join(row.parentPath,row.name).slice(dir.length+1).split('\\').join('/'));
}
async function validateFinished(dir,index){
  const paths=productPaths(dir);
  await prepareAssetDecoders();
  validateShardfileProduct({paths:()=>paths,read:(path,cap)=>{
    const file=join(dir,path);if(statSync(file).size>cap)throw new Error(`Preparation read exceeds byte cap: ${path}`);
    return readFileSync(file);
  }},{hash});
  // This is the same admitted source and validator revision; only the index
  // transport digest changed. Never invent a new cost or revision receipt.
  const receipt=json(dir,'validation.json');
  if(receipt.indexHash!==undefined){
    receipt.indexHash=hash(bytesOf(index));
    writeFileSync(join(dir,'validation.json'),bytesOf(receipt));
  }
}

/** The producer's computed conservative dependency fence plus actual cold reads. */
export function preparationFence(index,sections,recording,mounts){
  const source=assembleOutputShardfile(index,sections),descriptor={index,sections};
  const cold=drain(playLibrarySteps(source,descriptor));
  const required=controlFileHashes({...source,library:source.library.filter(row=>!cold.has(row))});
  const excluded=drain(entryFileSteps(source,'phone',descriptor));
  const known=new Set([...index.files.map(row=>row.hash),...mounts.map(row=>row.hash),...index.requires.commons]);
  return [...new Set([...required,...(recording.hashes??[]).filter(row=>known.has(row)),...index.files.filter(row=>recording.reads.some(url=>url.endsWith(`/${row.path}`))).map(row=>row.hash),...mounts.filter(row=>recording.reads.some(url=>url.endsWith(row.url))).map(row=>row.hash)])].filter(row=>!excluded.has(row)).sort();
}

/** Only the measured recorder envelope can finish the exact candidate. */
export async function finishPreparation(dir,recording,originalHeader){
  dir=resolve(dir);
  productPaths(dir); // Refuse linked output paths before any file is written.
  const header=readFileSync(join(dir,'shard.json'));
  if(hash(header)!==hash(originalHeader)||recording.headerHash!==hash(header))throw new Error('Candidate changed during preparation; rerun wildshard prepare');
  const held=parseOutputIndex(JSON.parse(header)),programs=readEntryPrograms(recording.programs),renderer=recording.renderer;
  if(typeof renderer!=='string'||!/^[a-f0-9]{64}$/u.test(renderer))throw new Error('Recording has no engine renderer revision; use a D5 preparation preview');
  const sections=new Map(held.sections.map(row=>[row.name,json(dir,row.path)]));
  const old=held.cook===undefined?{mounts:[]}:readCookData(json(dir,'cook.json'));
  const url=`/programs/${held.identity.slug}.json`,path=cookMountPath(url),programBytes=bytesOf(programs);
  const mounts=[...old.mounts.filter(row=>row.url!==url),{url,path,hash:hash(programBytes),bytes:programBytes.length}].sort((a,b)=>a.url.localeCompare(b.url));
  const index={...held,sdk:'0.3'},fence=preparationFence(index,sections,recording,mounts);
  // A full phone set contains every admitted non-desktop file. Only a strict
  // measured subset needs the existing fence policy; desktop stays whole.
  const all=index.files.filter(row=>row.tier!=='desktop'),selected=new Set(fence);
  const packs=all.some(row=>!selected.has(row.hash))?'fence':'whole';
  const cook={version:3,mounts,packs,fence,programs,renderer,inputHash:hash(cookPreparationBytes(index,mounts,renderer))};
  const bytes=bytesOf(cook),next={...index,cook:{path:'cook.json',hash:hash(bytes),bytes:bytes.length}};
  requireCookPreparation(parseOutputIndex(next),readCookData(cook),hash);
  mkdirSync(dirname(join(dir,path)),{recursive:true});writeFileSync(join(dir,path),programBytes);
  writeFileSync(join(dir,'cook.json'),bytes);writeFileSync(join(dir,'shard.json'),bytesOf(next));
  await validateFinished(dir,next);
  return {slug:index.identity.slug,fence:fence.length,programs:programs.programs.length,renderer,document:programs.build};
}

/** SA43: with no --base, serve engine's preparation client (fetched at this package's engine pin) around the candidate. */
async function ownPreview(dir){
  const {preparationClient}=await import('../src/sharddev/devClient.ts');
  const {clientPage}=await import('../src/sharddev/clientPage.ts');
  const {preparationPreview}=await import('./preparation-preview.mjs');
  return preparationPreview(await preparationClient(),dir,{clientPage});
}

export async function prepareProduct(dir,base,inline=false){
  if(base===undefined){
    const preview=await ownPreview(dir);
    console.error(`wildshard prepare: serving engine's preparation client at ${preview.url}`);
    try{return await prepareProduct(dir,preview.url,true);}finally{await preview.close();}
  }
  const header=readFileSync(join(dir,'shard.json')),index=parseOutputIndex(JSON.parse(header));
  const scratch=mkdtempSync(join(tmpdir(),'wildshard-prepare-'));
  try{
    const out=join(scratch,'recording.json');
    const script=fileURLToPath(new URL('./bake-entry-programs.mjs',import.meta.url));
    // Like the existing recorder, the operator runs this command through the
    // engine browser-lane wrapper. Do not acquire a second nested browser slot.
    // Not spawnSync: with no --base this process serves the preview the recorder reads (SA43).
    const run=await new Promise(done=>{
      const child=spawn(process.execPath,[script,'--base',base,'--out',out,'--header',hash(header),'--title',index.identity.name,...(inline?['--inline']:[]),index.identity.slug],{stdio:'inherit',timeout:300000});
      child.once('error',error=>{done({error,status:null});});
      child.once('exit',status=>{done({error:undefined,status});});
    });
    if(run.error!==undefined||run.status!==0)throw new Error('Phone WebKit preparation did not pass; candidate left as a draft');
    return await finishPreparation(dir,json(scratch,'recording.json'),header);
  }finally{rmSync(scratch,{recursive:true,force:true});}
}

if(process.argv[1]!==undefined&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [dir,flag,base]=process.argv.slice(2);
  if(dir===undefined||(flag!==undefined&&(flag!=='--base'||base===undefined)))throw new Error('usage: wildshard prepare <folder> [--base <exact-preview-url>]');
  console.log(JSON.stringify(await prepareProduct(resolve(dir),base)));
}
