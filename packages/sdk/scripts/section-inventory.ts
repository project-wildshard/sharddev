// CS1: plain, hash-bound section facts. No progress, credit or host score.
import '@wildshard/engine/scripts/format-hook.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from '@typescript/typescript6';
import { outputFormat } from '@wildshard/engine/scripts/shard-platform-format.mjs';
import { shardProducts } from '@wildshard/engine/scripts/shard-outputs.mjs';
import type { SectionMapping } from '@wildshard/format/outputFields';
import { formatSource } from '@wildshard/engine/scripts/format-package.mjs';

const { validatePlatformFile, platformFileFamily } = await import('@wildshard/format/platformFileFamilies');

interface Reader {path:string;line:number;selector:string|null;name:string|null;schema:string|null;groups:string[];access:string}
interface Entry {product:string;shard:string;name:string;kind:'platform'|'named-json'|'platform-file';path:string;bytes:number;hash:string;schema:string|null;document:unknown;routes:string[]}
interface Product {product:string;shard:string;indexHash:string;sourceHash:string;entries:Entry[]}
interface InventoryRow extends Omit<Entry,'document'> {schemaIdentity:string;schemaBindings:string[];schemaCandidates:string[];provenance:string;readers:Reader[];schemaUsers:string[];registeredReader:string|null}
interface Inventory {version:number;basis:string;products:Omit<Product,'entries'>[];rows:InventoryRow[];unresolvedReaders:Reader[]}

const ROOT=resolve(import.meta.dirname,'..'),HOST_PIN='419cf542cd';
const digest=(value:string|Uint8Array):string=>createHash('sha256').update(value).digest('hex');
const sorted=(values:Iterable<string>):string[]=>[...new Set(values)].sort((a,b)=>a.localeCompare(b));
const canonical=(value:unknown):string=>{
  const text=JSON.stringify(value,(_key:string,item:unknown):unknown=>item!==null&&typeof item==='object'&&!Array.isArray(item)
    ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
  if(text===undefined)throw new Error('Missing schema document');return text;
};
const tree=(root:string):string[]=>readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isSymbolicLink()?[]:entry.isDirectory()?tree(resolve(root,entry.name)):[resolve(root,entry.name)]);
const sourceFile=(path:string,source:string):ts.SourceFile=>ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
const textName=(node:ts.Node|undefined):string|null=>node!==undefined&&(ts.isIdentifier(node)||ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))?node.text:null;
const unwrap=(node:ts.Expression):ts.Expression=>ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isParenthesizedExpression(node)?unwrap(node.expression):node;

/** Follow emitted section routes through named documents, including shared
 * descendants and cycles. No source-name search is mistaken for a live route. */
export function namedJsonRoutes(roots:ReadonlyMap<string,unknown>,documents:ReadonlyMap<string,unknown>):Record<string,string[]>{
  const result:Record<string,string[]>={};
  const names=(value:unknown):string[]=>typeof value==='string'?(documents.has(value)?[value]:[]):Array.isArray(value)?value.flatMap(names)
    :value!==null&&typeof value==='object'?Object.values(value).flatMap(names):[];
  for(const [root,value]of roots){
    const visited=new Set<string>(),pending=names(value);
    while(pending.length>0){
      const name=pending.pop();if(name===undefined||visited.has(name))continue;visited.add(name);
      result[name]=sorted([...(result[name]??[]),root]);pending.push(...names(documents.get(name)));
    }
  }
  return result;
}
function imports(file:ts.SourceFile):Map<string,string>{
  const result=new Map<string,string>();
  for(const statement of file.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)){
    const bindings=statement.importClause?.namedBindings;
    if(bindings!==undefined&&ts.isNamedImports(bindings))for(const item of bindings.elements){
      let module=statement.moduleSpecifier.text;
      if(module.startsWith('.'))module=relative('src',resolve(dirname(file.fileName),module)).replaceAll('\\','/').replace(/\.ts$/u,'');
      if(module.startsWith('format/'))module=`@wildshard/${module}`;
      result.set(item.name.text,`${module}#${item.propertyName?.text??item.name.text}`);
    }
  }
  return result;
}
/** Static defining bindings, not a second schema registry. */
export function platformSchemaBindings(source:string):Record<string,string>{
  const file=sourceFile('src/format/platformDataSections.ts',source),bindings=imports(file),result:Record<string,string>={};
  const visit=(node:ts.Node):void=>{
    if(ts.isVariableDeclaration(node)&&textName(node.name)==='PLATFORM_DATA_SECTIONS'&&node.initializer!==undefined){
      const object=unwrap(node.initializer);
      if(!ts.isObjectLiteralExpression(object))throw new Error('Platform schema registry is not an object');
      for(const property of object.properties){
        if(!ts.isPropertyAssignment(property))throw new Error('Unresolved platform schema name');
        const name=textName(property.name);
        if(name===null)throw new Error('Unresolved platform schema name');
        const value=unwrap(property.initializer);
        if(!ts.isObjectLiteralExpression(value))throw new Error('Unresolved platform schema binding');
        const schema=value.properties.find(row=>ts.isPropertyAssignment(row)&&textName(row.name)==='schema');
        const binding=schema!==undefined&&ts.isPropertyAssignment(schema)?textName(unwrap(schema.initializer)):null;
        const identity=binding===null?undefined:bindings.get(binding);
        if(identity===undefined)throw new Error(`Missing defining platform schema: ${textName(property.name)}`);
        result[name]=identity;
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(file);if(Object.keys(result).length===0)throw new Error('Missing platform schema registry');return result;
}
/** H-group labels come from the accepted historical table and its exact cited text. */
export function hostGroupBindings(table:string,hostBar:string):Record<string,string[]>{
  const lines=hostBar.split('\n'),result:Record<string,string[]>={};
  for(const match of table.matchAll(/^\| (H\d{3}) [^|]*\| L(\d+) /gmu)){
    const line=lines[Number(match[2])-1];if(line===undefined)throw new Error(`Missing accepted host line: ${match[1]}`);
    for(const module of line.matchAll(/`((?:engine|game|sdk|sharddev|format)\/[\w./-]+)(?:#[\w$]+)?`/gu)){
      const group=match[1];if(group===undefined)throw new Error('Missing accepted host group');
      const path=`src/${module[1]}.ts`;result[path]=sorted([...(result[path]??[]),group]);
    }
  }
  return result;
}
/** Literal reads and adjacent defining parsers are source evidence, not proof of live adoption. */
export function sectionReaders(files:readonly {path:string;source:string}[],groups:Readonly<Record<string,string[]>>={}):Reader[]{
  const rows:Reader[]=[];
  for(const {path,source}of files){
    const file=sourceFile(path,source),bindings=imports(file);
    const visit=(node:ts.Node):void=>{
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['json','section'].includes(node.expression.name.text)&&node.arguments.length===1){
        const argument=node.arguments[0],name=argument!==undefined&&(ts.isStringLiteral(argument)||ts.isNoSubstitutionTemplateLiteral(argument))?argument.text:null;let parent=node.parent;
        while(parent!==undefined&&(ts.isAwaitExpression(parent)||ts.isAsExpression(parent)||ts.isParenthesizedExpression(parent)))parent=parent.parent;
        const schemaName=parent!==undefined&&ts.isCallExpression(parent)&&ts.isPropertyAccessExpression(parent.expression)&&parent.expression.name.text==='parse'?textName(parent.arguments[0]):null;
        const schema=schemaName===null?undefined:bindings.get(schemaName);
        let owner:ts.Node|undefined=node.parent,selector:string|null=null;
        while(owner!==undefined){
          if((ts.isFunctionDeclaration(owner)||ts.isMethodDeclaration(owner)||ts.isVariableDeclaration(owner))&&textName(owner.name)!==null){selector=textName(owner.name);break;}
          owner=owner.parent;
        }
        rows.push({path,line:file.getLineAndCharacterOfPosition(node.getStart()).line+1,
          selector,name,schema:schema??null,groups:groups[path]??[],access:node.expression.name.text});
      }
      ts.forEachChild(node,visit);
    };
    visit(file);
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line);
}
/** Every JSON member is checked against its actual declared hash and size. */
export function productSectionEntries(folder:string,product:string,shard:string):Product{
  const indexBytes=readFileSync(resolve(folder,'shard.json')),index=outputFormat.parseOutputIndex(JSON.parse(indexBytes.toString('utf8')));
  if(index.identity.slug!==(product==='_template'?'template':product))throw new Error(`Foreign product identity: ${product}`);
  const read=(entry:{path:string;hash:string;bytes?:number;compressed?:number}):unknown=>{
    const path=resolve(folder,entry.path);
    for(let at=path;at!==resolve(folder);at=dirname(at))if(lstatSync(at).isSymbolicLink())throw new Error(`Symbolic inventory member: ${entry.path}`);
    const bytes=readFileSync(path),expected=entry.bytes??entry.compressed;
    if(bytes.byteLength!==expected||digest(bytes)!==entry.hash)throw new Error(`Inventory member hash/size differs: ${product}/${entry.path}`);
    return JSON.parse(bytes.toString('utf8'));
  };
  const roots=new Map<string,unknown>(),documents=new Map<string,unknown>();
  const entries:Entry[]=index.sections.map(section=>{
    roots.set(section.name,read(section));
    return {product,shard,name:section.name,kind:'platform',path:section.path,
      bytes:section.bytes,hash:section.hash,schema:section.schema,document:null,routes:[]};
  });
  for(const file of index.files)if(file.kind==='json'&&file.name!==undefined){
    const value=read(file),source=file.jsonSchema?.['$comment'];documents.set(file.name,value);
    const family=validatePlatformFile(file.name,typeof source==='string'?source:undefined,value);
    entries.push({product,shard,name:file.name,kind:family===undefined?'named-json':'platform-file',path:file.path,bytes:file.compressed,hash:file.hash,schema:null,document:file.jsonSchema??null,routes:[]});
  }
  const routes=namedJsonRoutes(roots,documents);
  for(const entry of entries)entry.routes=routes[entry.name]??[];
  return {product,shard,indexHash:digest(indexBytes),sourceHash:index.build.sourceHash,entries};
}
/** Emitters are deduplicated by source project, never counted as live host users. */
export function sectionInventory(products:readonly Product[],catalogue:Readonly<Record<string,unknown>>,platformBindings:Readonly<Record<string,string>>,rootSections:readonly SectionMapping[],readers:readonly Reader[]):Inventory{
  if(new Set(products.map(product=>product.product)).size!==products.length)throw new Error('Duplicate inventory product');
  const documents=new Map(Object.entries(catalogue).map(([name,document])=>[name,canonical(document)]));
  const shape=(document:unknown):string=>canonical(document!==null&&typeof document==='object'&&!Array.isArray(document)
    ?Object.fromEntries(Object.entries(document).filter(([key])=>key!=='$comment')):document);
  const shapes=Object.entries(catalogue).map(([name,document])=>({name,shape:shape(document)}));
  const rows:InventoryRow[]=products.flatMap(product=>product.entries).map(entry=>{
    let schemaBindings:string[]=[],schemaIdentity:string,provenance:string;
    if(entry.kind==='platform'){
      const binding=platformBindings[entry.name],mapping=rootSections.find(row=>row.name===entry.name);
      if(binding!==undefined)schemaBindings=[binding];
      else if(mapping!==undefined)schemaBindings=[`@wildshard/format/${mapping.row===undefined?'shardSchema#ShardfileFieldSchemas':'rows#RowsSchema'}`];
      else throw new Error(`Missing platform schema source: ${entry.name}`);
      if(entry.schema===null)throw new Error(`Missing platform schema identity: ${entry.name}`);
      schemaIdentity=entry.schema;provenance='platform-registry';
    }else{
      const claimed=entry.document!==null&&typeof entry.document==='object'?Reflect.get(entry.document,'$comment'):undefined;
      if(typeof claimed==='string'&&documents.get(claimed)===canonical(entry.document))schemaBindings=[claimed];
      schemaIdentity=entry.document===null?`unattributed:${entry.shard}/${entry.name}`:`json:${digest(canonical(entry.document))}`;
      provenance=schemaBindings.length===0?'unattributed':'verified-format';
    }
    const matches=readers.filter(reader=>reader.access===(entry.kind==='named-json'||entry.kind==='platform-file'?'json':'section')
      &&(reader.name===entry.name||reader.schema!==null&&schemaBindings.includes(reader.schema)));
    const {document:_document,...metadata}=entry;
    const schemaCandidates=entry.document===null?[]:shapes.filter(candidate=>candidate.shape===shape(entry.document)).map(candidate=>candidate.name);
    const family=entry.kind==='platform-file'?platformFileFamily(entry.name,schemaBindings[0]):undefined;
    if(entry.kind==='platform-file'&&family===undefined)throw new Error(`Platform family requires verified defining schema: ${entry.name}`);
    return Object.assign(metadata,{schemaIdentity,schemaBindings,schemaCandidates,provenance,readers:matches,schemaUsers:[],registeredReader:family?.reader??null});
  });
  for(const row of rows)row.schemaUsers=sorted(rows.filter(candidate=>candidate.schemaIdentity===row.schemaIdentity).map(candidate=>candidate.shard));
  return {version:1,basis:'Hash-verified emitted JSON; source readers are static evidence, not host scores or live adoption.',
    products:products.map(({entries:_entries,...product})=>product),rows:rows.sort((a,b)=>a.product.localeCompare(b.product)||a.name.localeCompare(b.name)),
    unresolvedReaders:readers.filter(reader=>!rows.some(row=>row.readers.includes(reader)))};
}
/** Read existing products only; missing declared outputs refuse rather than become empty rows. */
export async function readSectionInventory(root:string=ROOT,productsRoot:string=resolve(root,'out')):Promise<Inventory>{
  const {namedFormatJsonSchemas}=await import('@wildshard/sdk/formatJsonSchema');
  const {OUTPUT_SECTIONS}=await import('@wildshard/format/outputFields');
  const folders=readdirSync(resolve(root,'src/shards'),{withFileTypes:true})
    .filter(entry=>entry.isDirectory()&&!entry.name.endsWith('-legacy')&&existsSync(resolve(root,'src/shards',entry.name,'shard.config.ts'))).map(entry=>entry.name);
  const products=shardProducts(root,folders).map(({slug,folder})=>productSectionEntries(resolve(productsRoot,slug),slug,folder));
  const table=readFileSync(resolve(root,'project/archive/reviews/2026-10-24-host-audit-inventory.md'),'utf8');
  const historic=execFileSync('git',['show',`${HOST_PIN}:docs/HOST-BAR.md`],{cwd:root,encoding:'utf8'});
  const groups=hostGroupBindings(table,historic),files=['src/engine','src/game'].flatMap(folder=>tree(resolve(root,folder)))
    .filter(path=>path.endsWith('.ts')&&!path.endsWith('.d.ts')&&!path.endsWith('.test.ts')).map(path=>({path:relative(root,path).replaceAll('\\','/'),source:readFileSync(path,'utf8')}));
  return sectionInventory(products,namedFormatJsonSchemas(),platformSchemaBindings(readFileSync(formatSource(root,'platformDataSections.ts'),'utf8')),OUTPUT_SECTIONS,sectionReaders(files,groups));
}
export function renderSectionInventory(report:Inventory):string{
  const cell=(value:unknown):string=>String(value).replaceAll('|',String.raw`\|`).replaceAll('\n',' ');
  return ['# Emitted section inventory','',report.basis,'',
    '| Product | Custom | Registered streamed files |','|---|---:|---:|',
    ...report.products.map(product=>{const rows=report.rows.filter(row=>row.product===product.product);return `| ${cell(product.product)} | ${rows.filter(row=>row.kind==='named-json').length} | ${rows.filter(row=>row.kind==='platform-file').length} |`;}),'',
    '| Product | Source project | Name | Kind | Bytes | Defining schema | Schema emitters | Reading hosts (H-group) | Emitted routes |',
    '|---|---|---|---|---:|---|---|---|---|',...report.rows.map(row=>`| ${cell(row.product)} | ${cell(row.shard)} | ${cell(row.name)} | ${row.kind} | ${row.bytes} | ${cell(row.schemaBindings.join(', ')||'unattributed')} | ${cell(row.schemaUsers.join(', '))} | ${cell(row.readers.length===0?(row.registeredReader??'unresolved'):row.readers.map(reader=>`${reader.path}:${reader.line}${reader.groups.length===0?' (unmapped)':` (${reader.groups.join(', ')})`}`).join('; '))} | ${cell(row.routes.join(', ')||'direct reader')} |`),''].join('\n');
}
if(process.argv[1]!==undefined&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--json'))throw new Error('Usage: node scripts/section-inventory.ts [--json]');
  const report=await readSectionInventory();console.info(args.includes('--json')?JSON.stringify(report,null,2):renderSectionInventory(report));
}
