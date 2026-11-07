// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/birdVariants", "pine-hollow/generators/bowProfile", "pine-hollow/generators/cabinLivingContribution", "pine-hollow/generators/chapterDirector", "pine-hollow/generators/contractProgram", "pine-hollow/generators/cragLook", "pine-hollow/generators/cragSceneContribution", "pine-hollow/generators/creatureHulls", "pine-hollow/generators/crossbowProfile", "pine-hollow/generators/eliteRoster", "pine-hollow/generators/explorerCatalogue", "pine-hollow/generators/figureCatalogue", "pine-hollow/generators/finishCards", "pine-hollow/generators/forestPage", "pine-hollow/generators/heldGear", "pine-hollow/generators/kingCard", "pine-hollow/generators/ledger", "pine-hollow/generators/nativeInventory"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine author declarations preserve pack, weapon and mutable contracts',()=>{
 const consumer=resolve('src/shards/t4-pine-first-consumer.ts');
 let source=`import {BIRD_FRAMES} from './pine-hollow/generators/birdVariants';
import {CROSSBOW_WEAPON_PROFILE} from './pine-hollow/generators/crossbowProfile';
import {PINE_NATIVE_PACK,PINE_PACK_SLOTS} from './pine-hollow/generators/nativeInventory';
import {HELD_GEAR} from './pine-hollow/generators/heldGear';
import {BOW_PROFILE} from './pine-hollow/generators/bowProfile';
import {contractProgramRegistries} from './pine-hollow/generators/contractProgram';
import type {HullFlapRow} from './pine-hollow/generators/creatureHulls';
export const name:'raven'=BIRD_FRAMES[0].name;
export const quantity:'unchecked'=PINE_NATIVE_PACK.quantity;
export const slots:7=PINE_PACK_SLOTS;
export const family:'firearm'=CROSSBOW_WEAPON_PROFILE.family;
CROSSBOW_WEAPON_PROFILE.magazine=2;
HELD_GEAR.variantOrder.push('another-finish');
BOW_PROFILE.quiver=8;
export const omitted=contractProgramRegistries(undefined);
export const flap:HullFlapRow={yMin:0,y0:0,z0:0,slope:0,keep:0,bulge:0};
flap.slope=1;
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Pine author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`BIRD_FRAMES[0].name='owl';
PINE_NATIVE_PACK.quantity='checked';
PINE_NATIVE_PACK.slots=8;
CROSSBOW_WEAPON_PROFILE.family='bow';
CROSSBOW_WEAPON_PROFILE.magazine='two';
HELD_GEAR.variantOrder.push(1);
flap.slope='steep';
HELD_GEAR.noSuchProperty;
BOW_PROFILE.quiver='many';
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(3);
 expect(refused.filter(code=>code===2322)).toHaveLength(4);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(9);
});
