// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["sunscar-dunes/generators/persistence", "sunscar-dunes/shard.config", "sunscar-dunes/generators/rows/matriarchBoss", "sunscar-dunes/generators/rows/ledger", "sunscar-dunes/generators/rows/audio", "sunscar-dunes/generators/rows/creatureLooks", "sunscar-dunes/generators/rows/nativeWorld", "sunscar-dunes/generators/questNpc", "sunscar-dunes/generators/clientMotion", "sunscar-dunes/generators/weatherFields", "sunscar-dunes/generators/rows/meleePhase", "sunscar-dunes/generators/rows/equipment", "sunscar-dunes/generators/rows/budgets", "sunscar-dunes/generators/rows/flags", "sunscar-dunes/generators/rows/lightLook", "sunscar-dunes/generators/rows/devPoses", "sunscar-dunes/generators/rows/gearModels", "sunscar-dunes/generators/rows/places"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Sunscar author rows preserve readonly identities and mutable budgets',()=>{
 const consumer=resolve('src/shards/t4-signal-first-consumer.ts');
 let source="import {SIGNAL_PERSISTENCE} from './sunscar-dunes/generators/persistence';\nimport {SIGNAL_CREATURE_LOOK_ROWS} from './sunscar-dunes/generators/rows/creatureLooks';\nimport {SIGNAL_NATIVE_WORLD} from './sunscar-dunes/generators/rows/nativeWorld';\nimport {BUDGETS} from './sunscar-dunes/generators/rows/budgets';\nimport {SCOUT_AT} from './sunscar-dunes/generators/rows/flags';\nimport {SIGNAL_DEV_POSES} from './sunscar-dunes/generators/rows/devPoses';\nimport {GEAR_MODEL_ROWS} from './sunscar-dunes/generators/rows/gearModels';\nimport {AUDIO} from './sunscar-dunes/generators/rows/audio';\nimport {WHIP_ROW} from './sunscar-dunes/generators/rows/equipment';\nexport const reward:'flag'=SIGNAL_PERSISTENCE.reward.kind;\nexport const body:'ray'=SIGNAL_CREATURE_LOOK_ROWS[0].body;\nexport const terrain:'collider'=SIGNAL_NATIVE_WORLD.terrain;\nexport const x:number=SCOUT_AT.x;\nexport const eye:readonly[number,number,number]=SIGNAL_DEV_POSES.spawn.eye;\nexport const gear:'sunscar-dunes/bullwhip'=GEAR_MODEL_ROWS[0].id;\nexport const touch:'melee'=WHIP_ROW.ui.touch;\nBUDGETS.phone.fps=30;\n";
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
 source="import {SIGNAL_PERSISTENCE} from './sunscar-dunes/generators/persistence';\nimport {SIGNAL_CREATURE_LOOK_ROWS} from './sunscar-dunes/generators/rows/creatureLooks';\nimport {SIGNAL_NATIVE_WORLD} from './sunscar-dunes/generators/rows/nativeWorld';\nimport {BUDGETS} from './sunscar-dunes/generators/rows/budgets';\nimport {SCOUT_AT} from './sunscar-dunes/generators/rows/flags';\nimport {SIGNAL_DEV_POSES} from './sunscar-dunes/generators/rows/devPoses';\nimport {GEAR_MODEL_ROWS} from './sunscar-dunes/generators/rows/gearModels';\nimport {AUDIO} from './sunscar-dunes/generators/rows/audio';\nimport {WHIP_ROW} from './sunscar-dunes/generators/rows/equipment';\nexport const reward:'flag'=SIGNAL_PERSISTENCE.reward.kind;\nexport const body:'ray'=SIGNAL_CREATURE_LOOK_ROWS[0].body;\nexport const terrain:'collider'=SIGNAL_NATIVE_WORLD.terrain;\nexport const x:number=SCOUT_AT.x;\nexport const eye:readonly[number,number,number]=SIGNAL_DEV_POSES.spawn.eye;\nexport const gear:'sunscar-dunes/bullwhip'=GEAR_MODEL_ROWS[0].id;\nexport const touch:'melee'=WHIP_ROW.ui.touch;\nBUDGETS.phone.fps=30;\nSIGNAL_PERSISTENCE.reward.kind='other';\nSIGNAL_CREATURE_LOOK_ROWS[0].body='strider';\nSIGNAL_NATIVE_WORLD.terrain='other';\nSCOUT_AT.x=1;\nSIGNAL_DEV_POSES.spawn.eye[0]=1;\nGEAR_MODEL_ROWS[0].id='other';\nWHIP_ROW.ui.touch='ranged';\nBUDGETS.phone.fps='slow';\nBUDGETS.missing;\nAUDIO.nonexistent;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(7);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(2);
 expect(refused).toHaveLength(10);
});
