// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["sunscar-dunes/generators/signalGraph", "sunscar-dunes/generators/questHost", "sunscar-dunes/generators/rows/matriarchPresentation", "sunscar-dunes/generators/questRepair", "sunscar-dunes/generators/rows/pieces", "sunscar-dunes/generators/rows/hostOwners", "sunscar-dunes/generators/rows/population", "sunscar-dunes/generators/questPage", "sunscar-dunes/generators/rows/matriarchEncounter", "sunscar-dunes/generators/lashTargets", "sunscar-dunes/generators/rows/spawns", "sunscar-dunes/generators/rows/boot", "sunscar-dunes/generators/rows/sandFields", "sunscar-dunes/generators/rows/headlessOwners", "sunscar-dunes/generators/bucket", "sunscar-dunes/generators/rows/rigLibrary", "sunscar-dunes/generators/skirtScenes", "sunscar-dunes/generators/rows/matriarchDecision"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Sunscar population and page rows preserve ownership and mutable collections',()=>{
 const consumer=resolve('src/shards/t4-signal-fourth-consumer.ts');
 let source="import {QUEST_HOST} from './sunscar-dunes/generators/questHost';\nimport {SIGNAL_NATIVE_POPULATION,SIGNAL_PAGE_PROGRAM} from './sunscar-dunes/generators/rows/population';\nimport {SIGNAL_BUCKET_CHANNELS} from './sunscar-dunes/generators/bucket';\nimport {SIGNAL_SKIRT_STEPS} from './sunscar-dunes/generators/skirtScenes';\nexport const admission:'prepare'=SIGNAL_NATIVE_POPULATION.admission;\nexport const kind:'flags'=SIGNAL_PAGE_PROGRAM.fight.record.kind;\nexport const first:'duneRay'=SIGNAL_PAGE_PROGRAM.population.witness.kinds[0];\nQUEST_HOST.version=2;\nQUEST_HOST.commands.step=null;\nconst home=SIGNAL_NATIVE_POPULATION.rows[0];if(home!==undefined)SIGNAL_NATIVE_POPULATION.rows.push(home);\nconst channel=SIGNAL_BUCKET_CHANNELS[0];if(channel!==undefined)SIGNAL_BUCKET_CHANNELS.push(channel);\nconst step=SIGNAL_SKIRT_STEPS[0];if(step!==undefined){step.cube='cell';SIGNAL_SKIRT_STEPS.push(step);}\n";
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
 source="import {QUEST_HOST} from './sunscar-dunes/generators/questHost';\nimport {SIGNAL_NATIVE_POPULATION,SIGNAL_PAGE_PROGRAM} from './sunscar-dunes/generators/rows/population';\nimport {SIGNAL_BUCKET_CHANNELS} from './sunscar-dunes/generators/bucket';\nimport {SIGNAL_SKIRT_STEPS} from './sunscar-dunes/generators/skirtScenes';\nexport const admission:'prepare'=SIGNAL_NATIVE_POPULATION.admission;\nexport const kind:'flags'=SIGNAL_PAGE_PROGRAM.fight.record.kind;\nexport const first:'duneRay'=SIGNAL_PAGE_PROGRAM.population.witness.kinds[0];\nQUEST_HOST.version=2;\nQUEST_HOST.commands.step=null;\nconst home=SIGNAL_NATIVE_POPULATION.rows[0];if(home!==undefined)SIGNAL_NATIVE_POPULATION.rows.push(home);\nconst channel=SIGNAL_BUCKET_CHANNELS[0];if(channel!==undefined)SIGNAL_BUCKET_CHANNELS.push(channel);\nconst step=SIGNAL_SKIRT_STEPS[0];if(step!==undefined){step.cube='cell';SIGNAL_SKIRT_STEPS.push(step);}\nSIGNAL_NATIVE_POPULATION.admission='other';\nSIGNAL_PAGE_PROGRAM.species.program={...SIGNAL_PAGE_PROGRAM.species.program};\nSIGNAL_PAGE_PROGRAM.population.witness.kinds[0]='other';\nSIGNAL_NATIVE_POPULATION.rows=[];\nSIGNAL_NATIVE_POPULATION.rows.push(1);\nQUEST_HOST.version='one';\nQUEST_HOST.commands.routes.push('bad');\nSIGNAL_BUCKET_CHANNELS.push(1);\nSIGNAL_SKIRT_STEPS.push(1);\nSIGNAL_SKIRT_STEPS.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(4);
 expect(refused.filter(code=>code===2345)).toHaveLength(4);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(10);
});
