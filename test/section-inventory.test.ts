import {expect,test} from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- These controls own their small isolated output directory.
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned fixture paths.
import {resolve,dirname} from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Verify the actual emitted-byte identity.
import {createHash} from 'node:crypto';
import {emptyShardfile} from '../src/sharddev/author';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import {productSectionEntries,sectionInventory,platformSchemaBindings,sectionReaders,hostGroupBindings,renderSectionInventory} from '../scripts/section-inventory';

const hash=(wire:string):string=>createHash('sha256').update(wire).digest('hex');
const provenance='@wildshard/format/demo#DemoSchema',document={$comment:provenance,type:'object',additionalProperties:false};
function fixture(){
  mkdirSync('tmp',{recursive:true});const root=mkdtempSync(resolve('tmp','section-inventory-'));
  const source=emptyShardfile({slug:'demo',name:'Demo',author:'Unplayed fixture',revision:1,seed:1});
  const member=(path:string,value:unknown)=>{
    const wire=JSON.stringify(value);mkdirSync(dirname(resolve(root,path)),{recursive:true});writeFileSync(resolve(root,path),wire);
    return {path,hash:hash(wire),bytes:Buffer.byteLength(wire)};
  };
  const value=[{slot:'shape',channels:[],file:'models/shape.glb'}];
  const namedPath=`blobs/json/${hash(JSON.stringify(value))}.json`;
  const section=member('sections/world/spawn.json',source.spawn),named=member(namedPath,value);
  const schemas:{path:string;hash:string;bytes:number}[]=[];
  const index={format:'wildshard.shardfile',formatVersion:2,sdk:'0.2',version:source.version,identity:source.identity,
    build:{sourceHash:'a'.repeat(64),validator:'unplayed'},requires:source.requires,
    admission:{budgets:source.budgets,serverBudget:source.serverBudget,authorCaps:source.authorCaps,critical:[],library:[]},
    sections:[{...section,name:'world/spawn',schema:'wildshard:world/spawn@1'}],schemas,runtime:null,
    files:[{path:named.path,hash:named.hash,kind:'json',name:'models/shape-book.json',compressed:named.bytes,decoded:named.bytes,gpu:0,triangles:0,draws:0,critical:false,dependencies:[],jsonSchema:registeredJsonSchema('models/shape-book.json')}]};
  const publish=():void=>{writeFileSync(resolve(root,'shard.json'),JSON.stringify(index));};publish();
  return {root,index,publish,member};
}
test('every declared platform section and named JSON keeps its checked byte identity',()=>{
  const f=fixture();try{
    const product=productSectionEntries(f.root,'demo','source-demo');
    expect(product.entries.map(row=>[row.name,row.kind,row.bytes])).toEqual([['world/spawn','platform',f.index.sections[0]?.bytes],['models/shape-book.json','platform-file',f.index.files[0]?.compressed]]);
    expect(product.sourceHash).toBe('a'.repeat(64));expect(product.indexHash).toHaveLength(64);
    const path=f.index.files[0]?.path;if(path===undefined)throw new Error('Missing named fixture');
    writeFileSync(resolve(f.root,path),'foreign');expect(()=>productSectionEntries(f.root,'demo','source-demo')).toThrow('hash/size');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('missing, foreign, duplicate and symbolic product inputs refuse',()=>{
  const f=fixture();try{
    expect(()=>productSectionEntries(f.root,'foreign','source-demo')).toThrow('Foreign product');
    f.index.sections.push({...f.index.sections[0],name:'world/spawn',path:'sections/world/spawn.json',schema:'wildshard:world/spawn@1',hash:'b'.repeat(64),bytes:1});f.publish();
    expect(()=>productSectionEntries(f.root,'demo','source-demo')).toThrow();f.index.sections.pop();f.publish();
    const path=f.index.files[0]?.path;if(path===undefined)throw new Error('Missing named fixture');
    rmSync(resolve(f.root,path));expect(()=>productSectionEntries(f.root,'demo','source-demo')).toThrow();
    f.member('real.json',{value:1});symlinkSync(resolve(f.root,'real.json'),resolve(f.root,path));
    expect(()=>productSectionEntries(f.root,'demo','source-demo')).toThrow('Symbolic');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('custom section and schema inventories refuse instead of receiving a checked identity',()=>{
  const f=fixture();try{
    const schema=f.member('schemas/custom/demo.schema.json',document),section=f.member('sections/custom/demo.json',{value:1});
    f.index.schemas.push(schema);f.index.sections.push({...section,name:'custom/demo',schema:schema.path});f.publish();
    expect(()=>productSectionEntries(f.root,'demo','source-demo')).toThrow();
    f.index.schemas.pop();f.publish();
    expect(()=>productSectionEntries(f.root,'demo','source-demo')).toThrow();
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('defining schemas resolve aliases and refuse a guessed platform binding',()=>{
  expect(platformSchemaBindings("import { RowsSchema as Shape } from './demo'; export const PLATFORM_DATA_SECTIONS={'world/demo':{schema:Shape}} as const;")).toEqual({'world/demo':'@wildshard/format/demo#RowsSchema'});
  expect(()=>platformSchemaBindings("const PLATFORM_DATA_SECTIONS={'world/demo':{schema:Missing}};")).toThrow('Missing defining');
});
test('reader evidence retains literal, parser, line and accepted host-group provenance',()=>{
  const groups=hostGroupBindings('| H001 Example | L2 · evidence | keep |','title\n- G571 `game/read#read` reads a row.');
  const rows=sectionReaders([{path:'src/game/read.ts',source:"import {DemoSchema as Shape} from '@wildshard/format/demo';\nexport async function read(product){ return v.parse(Shape,await product.json(file)); }\nfunction fixed(product){return product.section('world/spawn');}"}],groups);
  expect(rows).toEqual([
    {path:'src/game/read.ts',line:2,selector:'read',name:null,schema:provenance,groups:['H001'],access:'json'},
    {path:'src/game/read.ts',line:3,selector:'fixed',name:'world/spawn',schema:null,groups:['H001'],access:'section'}]);
});
test('schema users deduplicate source projects and an unverified label grants no provenance',()=>{
  const f=fixture();try{
    const admitted=productSectionEntries(f.root,'demo','one');
    // Pure attribution inputs may model an unverified label; no such document
    // enters product admission now that every shipping named file is registered.
    const first={...admitted,entries:admitted.entries.map(row=>{const copy=structuredClone(row);if(copy.kind==='platform-file'){copy.kind='named-json';copy.name='quest/demo.json';copy.document=document;}return copy;})},second={...first,product:'second',entries:first.entries.map(row=>{const copy=structuredClone(row);copy.product='second';return copy;})},third={...first,product:'third',shard:'two',entries:first.entries.map(row=>{const copy=structuredClone(row);copy.product='third';copy.shard='two';return copy;})};
    const report=sectionInventory([first,second,third],{[provenance]:document},{},[{name:'world/spawn',fields:['spawn']}],[]);
    const named=report.rows.find(row=>row.kind==='named-json');expect(named?.schemaUsers).toEqual(['one','two']);expect(named?.provenance).toBe('verified-format');
    expect(sectionInventory([first],{[provenance]:{...document,type:'number'}},{},[{name:'world/spawn',fields:['spawn']}],[]).rows.find(row=>row.kind==='named-json')?.provenance).toBe('unattributed');
    const missing={...first,entries:first.entries.map(row=>{const copy=structuredClone(row);if(row.kind==='named-json')copy.document={type:'object',additionalProperties:false};return copy;})};
    const unmatched=sectionInventory([missing],{[provenance]:document},{},[{name:'world/spawn',fields:['spawn']}],[]).rows.find(row=>row.kind==='named-json');
    expect(unmatched?.schemaCandidates).toEqual([provenance]);expect(unmatched?.schemaBindings).toEqual([]);expect(unmatched?.provenance).toBe('unattributed');
    expect(()=>sectionInventory([first,first],{[provenance]:document},{},[],[])).toThrow('Duplicate inventory product');
    const rendered=renderSectionInventory(report);expect(rendered).toContain('unresolved');expect(rendered).not.toContain('%');
    expect(report).not.toHaveProperty('progress');expect(report).not.toHaveProperty('shares');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
