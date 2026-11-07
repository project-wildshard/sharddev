// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/ambientLife", "pine-hollow/generators/cabinSceneContribution", "pine-hollow/generators/crossbowRows", "pine-hollow/generators/eliteFeatureRows", "pine-hollow/generators/forestStory", "pine-hollow/generators/interactions", "pine-hollow/generators/items", "pine-hollow/generators/journalContent", "pine-hollow/generators/kingDecision", "pine-hollow/generators/kingFight", "pine-hollow/generators/layout", "pine-hollow/generators/leverProfile", "pine-hollow/generators/longbow", "pine-hollow/generators/longbowLook", "pine-hollow/generators/nativeQuest", "pine-hollow/generators/nativeReadings", "pine-hollow/generators/nativeView", "pine-hollow/generators/nightSpawn"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine ecology, journal and world declarations preserve readonly and mutable identities',()=>{
 const consumer=resolve('src/shards/t4-pine-second-consumer.ts');
 let source=`import {JOURNAL} from './pine-hollow/generators/journalContent';
import {PINE_LIFE} from './pine-hollow/generators/ambientLife';
import {PINE_GRAPH_DATA,PINE_LANTERN_ROWS} from './pine-hollow/generators/interactions';
import {SPECIES_LOOKS,NATIVE_VIEW} from './pine-hollow/generators/nativeView';
import {PINE_HELD_BOW} from './pine-hollow/generators/longbow';
export const community:'forest-community'=PINE_LIFE.kind;
export const flock:4=PINE_LIFE.scavenger.flock.count;
PINE_LIFE.scavenger.flock.flight.wave=1;
PINE_GRAPH_DATA.actor='another-actor';
SPECIES_LOOKS.slug='another-catalogue';
NATIVE_VIEW.SPRAY_LOOK='another-look';
PINE_HELD_BOW.bow.arrow.maxStuck=50;
const row=PINE_LANTERN_ROWS[0];
if(row!==undefined)row.act=5;
export const first:'red-deer'=JOURNAL.entries[0].id;
export const atlas:'/assets/pine-hollow/journal/chalk.webp'=JOURNAL.chalk.atlas;
import {PINE_ITEMS} from './pine-hollow/generators/items';
const item=PINE_ITEMS.rows[0];
if(item!==undefined)item.ui.icon='crossbow';
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 // Only the virtual consumer changes between the positive and negative pass.
 // Retain dependency ASTs within this one fixture, never across test files.
 const parse=host.getSourceFile.bind(host),parsed=new Map<string,ts.SourceFile>();
 host.getSourceFile=(file,language,onError,fresh)=>{
  if(file===consumer||fresh===true)return parse(file,language,onError,fresh);
  const cached=parsed.get(file);if(cached!==undefined)return cached;
  const value=parse(file,language,onError,fresh);if(value!==undefined)parsed.set(file,value);
  return value;
 };
 let previous:ts.Program|undefined;
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host,previous),file=program.getSourceFile(consumer);
  previous=program;
  if(file===undefined)throw new Error('Missing virtual Pine world consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`PINE_LIFE.kind='other';
PINE_LIFE.forager.policy.grazing.length[0]=1;
PINE_GRAPH_DATA.actor=1;
if(row!==undefined)row.act='five';
SPECIES_LOOKS.slug=1;
NATIVE_VIEW.SPRAY_LOOK=1;
PINE_HELD_BOW.bow.arrow.maxStuck='many';
PINE_LIFE.absent;
JOURNAL.entries[0].id='white-deer';
JOURNAL.chalk.atlas='/other.webp';
if(item!==undefined)item.ui.icon='missing-icon';
if(item!==undefined)item.ui.icon=2;
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(4);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(7);
 expect(refused).toHaveLength(12);
});
