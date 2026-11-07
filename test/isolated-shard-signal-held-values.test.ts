// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["sunscar-dunes/generators/questPresentation", "sunscar-dunes/generators/rows/species/duneRay", "sunscar-dunes/generators/rows/species/skitterer", "sunscar-dunes/generators/rows/species/matriarch", "sunscar-dunes/generators/rows/species/strider", "sunscar-dunes/generators/rows/sand", "sunscar-dunes/generators/rows/lastLight", "sunscar-dunes/generators/rows/stormLook", "sunscar-dunes/generators/rows/heldWeapon", "sunscar-dunes/generators/rows/brains", "sunscar-dunes/generators/rows/skittererDecision", "sunscar-dunes/generators/rows/items", "sunscar-dunes/generators/rows/dusk", "sunscar-dunes/generators/rows/files", "sunscar-dunes/generators/rows/whip", "sunscar-dunes/generators/layout", "sunscar-dunes/generators/physics", "sunscar-dunes/generators/questPageInteractions"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Sunscar held and species rows preserve resource and item contracts',()=>{
 const consumer=resolve('src/shards/t4-signal-second-consumer.ts');
 let source="import type {WhipHeldRecipe} from './sunscar-dunes/generators/rows/heldWeapon';\nimport {WHIP_ITEM,WHIP_TIMING,WHIP_MOVES} from './sunscar-dunes/generators/rows/items';\nimport {RAY_LOOK} from './sunscar-dunes/generators/rows/species/duneRay';\nimport {SKITTERER_LOOK} from './sunscar-dunes/generators/rows/species/skitterer';\nimport {SIGNAL_BODY_ROWS,SIGNAL_PAGE_ROWS} from './sunscar-dunes/generators/rows/brains';\nimport {CARAVAN} from './sunscar-dunes/generators/layout';\nexport const item:'weapon.sunscar-whip'=WHIP_ITEM.id;\nexport const timing:0.42=WHIP_TIMING.show;\nexport const move:'sunscar.whip.crack'=WHIP_MOVES.light;\nexport const socket:'body'=RAY_LOOK.sockets[0];\nexport const skitterer:'sunscar.look.sandSkitterer'=SKITTERER_LOOK.id;\nexport const flight:'flight'=SIGNAL_BODY_ROWS.duneRay.motion;\nexport const x:number=CARAVAN.x;\nCARAVAN.x=1;\nconst page=SIGNAL_PAGE_ROWS[0];if(page!==undefined){page.id='still-mutable';SIGNAL_PAGE_ROWS.push(page);}\nexport function held(recipe:WhipHeldRecipe):void{\n const bytes:196608=recipe.resources.textures[0].bytes;\n const along:number=recipe.resources.repeats[0].value[0];\n const path:readonly['decorate']=recipe.resources.decorators[0].from.path;\n void bytes;void along;void path;\n}\n";
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
 source="import type {WhipHeldRecipe} from './sunscar-dunes/generators/rows/heldWeapon';\nimport {WHIP_ITEM,WHIP_TIMING,WHIP_MOVES} from './sunscar-dunes/generators/rows/items';\nimport {RAY_LOOK} from './sunscar-dunes/generators/rows/species/duneRay';\nimport {SKITTERER_LOOK} from './sunscar-dunes/generators/rows/species/skitterer';\nimport {SIGNAL_BODY_ROWS,SIGNAL_PAGE_ROWS} from './sunscar-dunes/generators/rows/brains';\nimport {CARAVAN} from './sunscar-dunes/generators/layout';\nexport const item:'weapon.sunscar-whip'=WHIP_ITEM.id;\nexport const timing:0.42=WHIP_TIMING.show;\nexport const move:'sunscar.whip.crack'=WHIP_MOVES.light;\nexport const socket:'body'=RAY_LOOK.sockets[0];\nexport const skitterer:'sunscar.look.sandSkitterer'=SKITTERER_LOOK.id;\nexport const flight:'flight'=SIGNAL_BODY_ROWS.duneRay.motion;\nexport const x:number=CARAVAN.x;\nCARAVAN.x=1;\nconst page=SIGNAL_PAGE_ROWS[0];if(page!==undefined){page.id='still-mutable';SIGNAL_PAGE_ROWS.push(page);}\nexport function held(recipe:WhipHeldRecipe):void{\n const bytes:196608=recipe.resources.textures[0].bytes;\n const along:number=recipe.resources.repeats[0].value[0];\n const path:readonly['decorate']=recipe.resources.decorators[0].from.path;\n void bytes;void along;void path;\n}\nWHIP_ITEM.id='other';\nWHIP_TIMING.show=1;\nWHIP_MOVES.light='other';\nRAY_LOOK.sockets[0]='other';\nSKITTERER_LOOK.id='other';\nSIGNAL_BODY_ROWS.duneRay.motion='ground';\nCARAVAN.x='bad';\nexport function refuse(recipe:WhipHeldRecipe):void{recipe.resources.textures[0].bytes=1;}\nSIGNAL_PAGE_ROWS.push(1);\nSIGNAL_PAGE_ROWS.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(7);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(10);
});
