// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["driftwood-isle/generators/assets", "driftwood-isle/generators/barrelDecision", "driftwood-isle/generators/bootRecipes", "driftwood-isle/generators/brains", "driftwood-isle/generators/captainDecision", "driftwood-isle/generators/clientSections", "driftwood-isle/generators/completion", "driftwood-isle/generators/coveLayout", "driftwood-isle/generators/coverGrid", "driftwood-isle/generators/creatureLook", "driftwood-isle/generators/driftLogs", "driftwood-isle/generators/finds", "driftwood-isle/generators/fishDraw", "driftwood-isle/generators/foliageModels", "driftwood-isle/generators/groundColor", "driftwood-isle/generators/groundField", "driftwood-isle/generators/groundRows", "driftwood-isle/generators/gullDraw"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Driftwood author defaults keep literal policies and mutable storage',()=>{
 const consumer=resolve('src/shards/t4-driftwood-default-consumer.ts');
 let source=`import {DRIFTWOOD_BOOT_FILES} from './driftwood-isle/generators/bootRecipes';
import {DRIFTWOOD_FIXED_SOURCES,DRIFTWOOD_ASSET_NAMES} from './driftwood-isle/generators/assets';
import {BARREL_BODIES,BARREL_DECISION} from './driftwood-isle/generators/barrelDecision';
import {CAPTAIN_MOVES} from './driftwood-isle/generators/captainDecision';
import {AuthorCoverGrid} from './driftwood-isle/generators/coverGrid';
import {driftwoodGroundRows,driftwoodGroundField} from './driftwood-isle/generators/groundRows';
import {landscapeHash} from './driftwood-isle/generators/groundField';
import {lowPolyGroundColor} from './driftwood-isle/generators/groundColor';
import type {Color} from 'three';
export const prefix:'/assets/baked/driftwood-isle/tex/'=DRIFTWOOD_BOOT_FILES.baked.source.publicPrefix;
export const physics:'/assets/physics/rapier.wasm'=DRIFTWOOD_BOOT_FILES.physics.source.urls[0];
export const grid=new AuthorCoverGrid();
grid.data[0]=1;
DRIFTWOOD_FIXED_SOURCES['slot']='model';
DRIFTWOOD_ASSET_NAMES['slot']='model';
export const radius:number|undefined=BARREL_BODIES.bodies[0]?.shape.cylinder.radius;
export const side:'sim'=BARREL_DECISION[0].side;
export const abi:'1.0'=BARREL_DECISION[0].abi;
export const rows=driftwoodGroundRows();
export const omitted=driftwoodGroundRows(undefined);
export const field=driftwoodGroundField(undefined);
export const hash=landscapeHash({heightAt:()=>0},undefined);
declare const color:Color;
export const painted=lowPolyGroundColor(color,0,0,0,0,undefined);
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
 source+=`DRIFTWOOD_BOOT_FILES.baked.source.publicPrefix='other';
DRIFTWOOD_BOOT_FILES.physics.source.urls[0]='other';
grid.n=2;
grid.data=new Float32Array(1);
BARREL_DECISION[0].abi='2.0';
CAPTAIN_MOVES.push({});
driftwoodGroundRows('seed');
landscapeHash({heightAt:()=>0},'size');
lowPolyGroundColor(color,0,0,0,0,'lip');
DRIFTWOOD_ASSET_NAMES['slot']=1;
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(5);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2345)).toHaveLength(3);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused).toHaveLength(10);
});
