// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["driftwood-isle/generators/oceanFoam", "driftwood-isle/generators/pageLife", "driftwood-isle/generators/pageStory", "driftwood-isle/generators/questShop", "driftwood-isle/generators/questGraph", "driftwood-isle/generators/quests", "driftwood-isle/generators/toonPresentation", "driftwood-isle/generators/wakeEncounter", "driftwood-isle/generators/nativeHunt", "driftwood-isle/generators/nativeInventory", "driftwood-isle/generators/entryWalk", "driftwood-isle/generators/questNpcs", "driftwood-isle/generators/questServiceEffects", "driftwood-isle/generators/reefCatalogue", "driftwood-isle/generators/reefSpecimenRows", "driftwood-isle/generators/monkeyClips", "driftwood-isle/generators/npcFocusPrograms", "driftwood-isle/generators/worldScenes"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Driftwood story, native and world declarations keep their admitted contracts',()=>{
 const consumer=resolve('src/shards/t4-driftwood-story-consumer.ts');
 let source=`import {PAGE_LIFE} from './driftwood-isle/generators/pageLife';
import {PAGE_STORY} from './driftwood-isle/generators/pageStory';
import {DRIFTWOOD_QUESTS} from './driftwood-isle/generators/quests';
import {TOON_LOOK} from './driftwood-isle/generators/toonPresentation';
import {WAKE_ENCOUNTER} from './driftwood-isle/generators/wakeEncounter';
import {DRIFTWOOD_NATIVE_HUNT} from './driftwood-isle/generators/nativeHunt';
import {DRIFTWOOD_NATIVE_PACK} from './driftwood-isle/generators/nativeInventory';
import {ENTRY_WALK} from './driftwood-isle/generators/entryWalk';
import {QUEST_NPCS} from './driftwood-isle/generators/questNpcs';
import {QUEST_SERVICES} from './driftwood-isle/generators/questServiceEffects';
import {REEF_MODEL_SEED} from './driftwood-isle/generators/reefSpecimenRows';
import {NPC_FOCUS_PROGRAMS} from './driftwood-isle/generators/npcFocusPrograms';
import {CREATURE_BODY_INPUTS} from './driftwood-isle/generators/creatureBodyBank';
import {REEF_SCENE_LIBRARY} from './driftwood-isle/generators/reefCatalogue';
import {MONKEY_CLIPS} from './driftwood-isle/generators/monkeyClips';
import {parsePageLife} from '@wildshard/format/pageLife';
import {parseQuestStory} from '@wildshard/format/questStory';
import {parseQuestData} from '@wildshard/sharddev/quests';
import {parseToonLook} from '@wildshard/format/toonLook';
import {parseChapterWake} from '@wildshard/format/chapterDirector';
import {creaturePoseRows} from '@wildshard/sharddev/clientChannels';
export const life:ReturnType<typeof parsePageLife>=PAGE_LIFE;
export const story:ReturnType<typeof parseQuestStory>=PAGE_STORY;
export const quests:ReturnType<typeof parseQuestData>=DRIFTWOOD_QUESTS;
export const toon:ReturnType<typeof parseToonLook>=TOON_LOOK;
export const wake:ReturnType<typeof parseChapterWake>=WAKE_ENCOUNTER;
export const clips:ReturnType<typeof creaturePoseRows>[]=MONKEY_CLIPS;
export const limit:256=DRIFTWOOD_NATIVE_HUNT.limit;
export const quantity:'positive-safe-integer'=DRIFTWOOD_NATIVE_PACK.quantity;
export const lanes:23=ENTRY_WALK.lanes;
export const version:1=QUEST_SERVICES.version;
export const kind:'posed-talk'=QUEST_NPCS[0].kind;
export const seed:number=REEF_MODEL_SEED;
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Driftwood story consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`DRIFTWOOD_NATIVE_HUNT.limit=257;
DRIFTWOOD_NATIVE_PACK.quantity='float';
ENTRY_WALK.ramp.halfWidths.north=2;
QUEST_NPCS.push({});
QUEST_SERVICES.actions.push({});
export const wrongSeed:typeof REEF_MODEL_SEED='reef';
export const wrongPrograms:typeof NPC_FOCUS_PROGRAMS=[1];
export const wrongBodies:typeof CREATURE_BODY_INPUTS={head:1,captain:''};
export const wrongLibrary:typeof REEF_SCENE_LIBRARY={id:'x',kind:'other',models:[]};
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(3);
 expect(refused.filter(code=>code===2339)).toHaveLength(2);
 expect(refused.filter(code=>code===2322)).toHaveLength(4);
 expect(refused).toHaveLength(9);
});
