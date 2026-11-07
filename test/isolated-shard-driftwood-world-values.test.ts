// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["driftwood-isle/generators/gullsLook", "driftwood-isle/generators/islandClips", "driftwood-isle/generators/islandRows", "driftwood-isle/generators/items", "driftwood-isle/generators/loot", "driftwood-isle/generators/meleeProfile", "driftwood-isle/generators/nativeQuestProps", "driftwood-isle/generators/oceanLook", "driftwood-isle/generators/questHost", "driftwood-isle/generators/questInventory", "driftwood-isle/generators/questStory", "driftwood-isle/generators/returnProgram", "driftwood-isle/generators/sea", "driftwood-isle/generators/sections", "driftwood-isle/generators/worldAssembly", "driftwood-isle/generators/worldSites", "driftwood-isle/generators/speciesPrograms", "driftwood-isle/generators/spawns"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Driftwood equipment and world declarations preserve literal and mutable contracts',()=>{
 const consumer=resolve('src/shards/t4-driftwood-world-consumer.ts');
 let source=`import {DRIFTWOOD_SWORDS} from './driftwood-isle/generators/items';
import {DRIFTWOOD_FLAG_FEATS} from './driftwood-isle/generators/questInventory';
import {DRIFTWOOD_MELEE_PROFILE} from './driftwood-isle/generators/meleeProfile';
import {DECLARED_SEA} from './driftwood-isle/generators/sea';
import {RETURN_WASM_OPTIONS} from './driftwood-isle/generators/returnProgram';
import {GULL_FLOCK} from './driftwood-isle/generators/gullsLook';
import {BRIDGE} from './driftwood-isle/generators/worldSites';
import {islandClippedIndex} from './driftwood-isle/generators/islandClips';
export const family:'melee'=DRIFTWOOD_MELEE_PROFILE.family;
export const abi:1=RETURN_WASM_OPTIONS.script.abi;
export const slots:12=DRIFTWOOD_SWORDS.loadout.inventory.slots;
export const flag:'talked:castaway'=DRIFTWOOD_FLAG_FEATS[0].value.flag;
BRIDGE.a[0]=1;
GULL_FLOCK.count=36;
export const omitted=islandClippedIndex(new Uint16Array(0),undefined);
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
  const program=ts.createProgram([consumer],options,host,previous),file=program.getSourceFile(consumer);
  previous=program;
  if(file===undefined)throw new Error('Missing virtual Driftwood default consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`DRIFTWOOD_MELEE_PROFILE.family='other';
RETURN_WASM_OPTIONS.script.abi=2;
DRIFTWOOD_SWORDS.loadout.inventory.slots=13;
DECLARED_SEA.level=1;
DRIFTWOOD_FLAG_FEATS[0].value.flag='other';
BRIDGE.a[0]='bad';
GULL_FLOCK.count='many';
islandClippedIndex([],{sourceVertices:0,sourceIndices:0,outputIndices:0,ranges:'invalid'});
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(3);
 expect(refused.filter(code=>code===2322)).toHaveLength(5);
 expect(refused).toHaveLength(8);
});
