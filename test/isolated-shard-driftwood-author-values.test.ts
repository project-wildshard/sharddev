// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["driftwood-isle/generators/crabClips", "driftwood-isle/generators/enemyPlacement", "driftwood-isle/generators/enemySpecies", "driftwood-isle/generators/entryDeck", "driftwood-isle/generators/entryDecks", "driftwood-isle/generators/entryLandings", "driftwood-isle/generators/explorerCatalogue", "driftwood-isle/generators/fauna", "driftwood-isle/generators/faunaSpecies", "driftwood-isle/generators/figureCatalogue", "driftwood-isle/generators/heldArms", "driftwood-isle/generators/humanoidClips", "driftwood-isle/generators/interactables", "driftwood-isle/generators/ledger", "driftwood-isle/generators/modelFiles", "driftwood-isle/generators/nativeBake", "driftwood-isle/generators/nativeQuest"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('native trail compatibility emits the original isolated model declarations',()=>{
 const fileName='test/fixtures/driftwood-trail-models.ts';
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Driftwood author values retain model parameters, poses and native versions',()=>{
 const consumer=resolve('src/shards/t4-driftwood-author-consumer.ts');
 let source=`import {fencePost,signpost,plankStep} from '../../test/fixtures/driftwood-trail-models';
import {CRAB_CLIPS} from './driftwood-isle/generators/crabClips';
import {SAILOR_CLIPS,CAPTAIN_CLIPS} from './driftwood-isle/generators/humanoidClips';
import {ISLAND_BOAR,ISLAND_BEAR} from './driftwood-isle/generators/faunaSpecies';
import {driftwoodNativeRows} from './driftwood-isle/generators/nativeBake';
import {deriveSpecies} from '@wildshard/engine/ai/species';
import {creaturePoseRows} from '@wildshard/sharddev/clientChannels';
export const boar:ReturnType<typeof deriveSpecies>=ISLAND_BOAR;
export const bear:ReturnType<typeof deriveSpecies>=ISLAND_BEAR;
export const crab:ReturnType<typeof creaturePoseRows>=CRAB_CLIPS;
export const sailor:ReturnType<typeof creaturePoseRows>=SAILOR_CLIPS;
export const captain:ReturnType<typeof creaturePoseRows>=CAPTAIN_CLIPS;
export const arrows:readonly number[]=signpost.defaults.arrows;
export const width:number=plankStep.defaults.w;
declare const payload:unknown;
export const native=driftwoodNativeRows(payload);
export const version:1=native.physics.version;
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Driftwood author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`signpost.defaults.arrows.push(1);
plankStep.defaults.dark=true;
fencePost.defaults['unknown']=1;
CRAB_CLIPS.group=1;
native.physics.version=2;
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2540)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(3);
 expect(refused).toHaveLength(5);
});
