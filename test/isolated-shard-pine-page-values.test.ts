// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/readings", "pine-hollow/generators/pageComposition", "pine-hollow/generators/pageLife", "pine-hollow/generators/pageStory", "pine-hollow/generators/panels", "pine-hollow/generators/peopleLook", "pine-hollow/generators/pickups", "pine-hollow/generators/placeSets", "pine-hollow/generators/population", "pine-hollow/generators/populationEnvironment", "pine-hollow/generators/questDeaths", "pine-hollow/generators/questGraph", "pine-hollow/generators/questHost", "pine-hollow/generators/questInventory", "pine-hollow/generators/questRideScenes", "pine-hollow/generators/questRuntime", "pine-hollow/generators/questShop", "pine-hollow/generators/quests"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine page, quest and population declarations preserve literal and mutable contracts',()=>{
 const consumer=resolve('src/shards/t4-pine-third-consumer.ts');
 let source=`import {PINE_PAGE_DEATH_EFFECTS} from './pine-hollow/generators/questDeaths';
import {POPULATION_ROSTER} from './pine-hollow/generators/population';
import {PINE_GRAPH} from './pine-hollow/generators/questGraph';
import {PINE_QUEST_RUNTIME,PINE_QUEST_PAYLOAD} from './pine-hollow/generators/questRuntime';
import {QUEST_RIDE_STEP} from './pine-hollow/generators/questRideScenes';
export const actor:'antler-king'=PINE_PAGE_DEATH_EFFECTS[0].when[0].kind;
export const flag:'dead:king'=PINE_PAGE_DEATH_EFFECTS[0].effects[0].flag;
export const revision:1=POPULATION_ROSTER.version;
POPULATION_ROSTER.seed=2;
PINE_GRAPH.actor='another-actor';
PINE_QUEST_RUNTIME.leadPage.quest='another-quest';
PINE_QUEST_PAYLOAD.policy.readingDelay=0.2;
QUEST_RIDE_STEP.scene='another-scene';
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Pine page consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`PINE_PAGE_DEATH_EFFECTS[0].when[0].kind='boar';
PINE_PAGE_DEATH_EFFECTS[0].effects[0].flag='other';
POPULATION_ROSTER.version=2;
POPULATION_ROSTER.seed='bad';
PINE_QUEST_RUNTIME.leadPage.quest=1;
PINE_QUEST_PAYLOAD.policy.readingDelay='late';
QUEST_RIDE_STEP.scene=1;
PINE_GRAPH.missing;
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(2);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(5);
 expect(refused).toHaveLength(8);
});
