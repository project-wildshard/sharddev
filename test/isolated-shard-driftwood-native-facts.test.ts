// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["driftwood-isle/generators/nativeView", "driftwood-isle/generators/output", "driftwood-isle/generators/ropeBridge", "driftwood-isle/generators/shipwreck", "driftwood-isle/generators/spawnTables", "driftwood-isle/generators/staticWorld", "driftwood-isle/generators/trailsideModels"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Driftwood native facts keep widened strings, mutable arrays and readonly constructor identities',()=>{
 const consumer=resolve('src/shards/t4-driftwood-native-consumer.ts');
 let source=`import {NATIVE_VIEW} from './driftwood-isle/generators/nativeView';
import {STATIC_BOAT,WORLD_GULL_PERCHES,boatColliders} from './driftwood-isle/generators/staticWorld';
import {DRIFTWOOD_SPAWNS} from './driftwood-isle/generators/spawnTables';
import {TRAIL_COLOURS} from './driftwood-isle/generators/trailsideModels';
import {bridgeFacts} from './driftwood-isle/generators/ropeBridge';
import type {ShipwreckBuilder} from './driftwood-isle/generators/shipwreck';
import type {ColliderDesc} from '@wildshard/engine/world/registry';
NATIVE_VIEW.FIREFLY_LOOK='another-look';
NATIVE_VIEW.CAPTAIN_NAME='another-name';
TRAIL_COLOURS.post.set('#ffffff');
export const colliders:ColliderDesc[]=STATIC_BOAT.colliders;
export const perches:{x:number;y:number;z:number}[]=WORLD_GULL_PERCHES;
export const defaults=boatColliders(undefined);
declare const facts:ReturnType<typeof bridgeFacts>;
export const width:number=facts.width;
export const plankWidth:number|undefined=facts.planks[0]?.w;
declare const ship:ShipwreckBuilder;
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Driftwood default consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`NATIVE_VIEW.FIREFLY_LOOK=1;
NATIVE_VIEW.CAPTAIN_NAME=false;
TRAIL_COLOURS.post='bad';
STATIC_BOAT.colliders.push({kind:'invalid'});
facts.planks[0]={seg:'bad',z:0,w:0};
DRIFTWOOD_SPAWNS.push({id:'bad',table:{mode:'invalid',rows:[]}});
ship.spec=ship.spec;
TRAIL_COLOURS.absent;
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(6);
 expect(refused).toHaveLength(8);
});
