// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["sunscar-dunes/generators/landscape", "sunscar-dunes/generators/towerColliders", "sunscar-dunes/generators/quests", "sunscar-dunes/generators/lightEmitters", "sunscar-dunes/generators/mapProgram"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Sunscar terrain and map rows preserve optional numeric seed contracts',()=>{
 const consumer=resolve('src/shards/t4-signal-third-consumer.ts');
 let source="import {signalHeightAt} from './sunscar-dunes/generators/landscape';\nimport {signalTowerPhysicsPlacements} from './sunscar-dunes/generators/towerColliders';\nimport {LATER_FLAGS,SIGNAL_QUESTS} from './sunscar-dunes/generators/quests';\nimport {SIGNAL_EMITTERS} from './sunscar-dunes/generators/lightEmitters';\nimport {SIGNAL_MAP_INPUTS} from './sunscar-dunes/generators/mapProgram';\nexport const height:(x:number,z:number)=>number=signalHeightAt();\nexport const seeded:(x:number,z:number)=>number=signalHeightAt(123);\nexport const tower=signalTowerPhysicsPlacements();\nexport const alternate=signalTowerPhysicsPlacements(456);\nexport const first:'sunscar.logbook'=LATER_FLAGS[0];\nexport const version:1=SIGNAL_EMITTERS.version;\nSIGNAL_MAP_INPUTS.push('explicit-owned-input');\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Sunscar author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {signalHeightAt} from './sunscar-dunes/generators/landscape';\nimport {signalTowerPhysicsPlacements} from './sunscar-dunes/generators/towerColliders';\nimport {LATER_FLAGS,SIGNAL_QUESTS} from './sunscar-dunes/generators/quests';\nimport {SIGNAL_EMITTERS} from './sunscar-dunes/generators/lightEmitters';\nimport {SIGNAL_MAP_INPUTS} from './sunscar-dunes/generators/mapProgram';\nexport const height:(x:number,z:number)=>number=signalHeightAt();\nexport const seeded:(x:number,z:number)=>number=signalHeightAt(123);\nexport const tower=signalTowerPhysicsPlacements();\nexport const alternate=signalTowerPhysicsPlacements(456);\nexport const first:'sunscar.logbook'=LATER_FLAGS[0];\nexport const version:1=SIGNAL_EMITTERS.version;\nSIGNAL_MAP_INPUTS.push('explicit-owned-input');\nsignalHeightAt('bad');\nsignalTowerPhysicsPlacements('bad');\nLATER_FLAGS[0]='other';\nSIGNAL_MAP_INPUTS.push(1);\nSIGNAL_MAP_INPUTS.missing;\nSIGNAL_QUESTS.nonexistent;\nSIGNAL_EMITTERS.version=2;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(1);
 expect(refused.filter(code=>code===2345)).toHaveLength(3);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(2);
 expect(refused).toHaveLength(7);
});
