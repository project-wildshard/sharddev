// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["nalati-grasslands/generators/placeSets", "nalati-grasslands/generators/decorative", "nalati-grasslands/generators/nativeGroups", "nalati-grasslands/generators/smoothGeometry", "nalati-grasslands/generators/kurganLayout", "nalati-grasslands/generators/placement", "nalati-grasslands/generators/solid", "nalati-grasslands/generators/packGroup", "nalati-grasslands/generators/panoramaData", "nalati-grasslands/generators/layout", "nalati-grasslands/generators/spruceGeometry", "nalati-grasslands/generators/paint", "nalati-grasslands/generators/speciesPoses", "nalati-grasslands/generators/spear", "nalati-grasslands/generators/yurt", "nalati-grasslands/generators/sabre", "nalati-grasslands/generators/goldenKingPose"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Nalati geometry and population preserve mutable author contracts',()=>{
 const consumer=resolve('src/shards/t4-nalati-second-consumer.ts');
 let source="import {Vector3} from 'three';\nimport {SPRUCE_SPECS} from './nalati-grasslands/generators/spruceGeometry';\nimport {BRIDGE_XZ,NALATI_MAP} from './nalati-grasslands/generators/layout';\nimport {NALATI_PLACE_SETS} from './nalati-grasslands/generators/placeSets';\nimport {SPECIES_POSES} from './nalati-grasslands/generators/speciesPoses';\nimport {nalatiHeadlessAssembly} from './nalati-grasslands/generators/nativeGroups';\nimport {NALATI_ADMISSION} from '../../test/fixtures/nalati-admission';\nimport type {NalatiTitanProgram} from './nalati-grasslands/generators/stormTitanRows.mjs';\ndeclare const pasture:NalatiTitanProgram;\nconst headlessAssembly=nalatiHeadlessAssembly(pasture,NALATI_ADMISSION),nalatiNativeGroupRows=headlessAssembly.constants.groupRows;\nimport {TERRAIN_PAINT_SOURCE} from './nalati-grasslands/generators/nalatiGroundSource';\nimport {buildSabre,SABRE_REST} from './nalati-grasslands/generators/sabre';\nimport {PACK_RESULT_CHANNELS} from './nalati-grasslands/generators/packGroup';\nexport const height:15=SPRUCE_SPECS[0].height;\nBRIDGE_XZ.x=2;\nNALATI_MAP.zones.push({label:'still mutable',x:1,z:2});\nconst place=NALATI_PLACE_SETS[0];if(place!==undefined){place.x=1;const pois:readonly string[]=place.pois;void pois;}\nSPECIES_POSES.horse.programs.push(...SPECIES_POSES.eagle.programs);\nheadlessAssembly.constants.pageWildlife.seed=1;\nnalatiNativeGroupRows.bounds[0]=1;\nTERRAIN_PAINT_SOURCE.seed=1;\nPACK_RESULT_CHANNELS.push('still mutable');\nSABRE_REST.pos.copy(new Vector3());\nexport const sabre:typeof buildSabre=buildSabre;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Nalati geometry consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {Vector3} from 'three';\nimport {SPRUCE_SPECS} from './nalati-grasslands/generators/spruceGeometry';\nimport {BRIDGE_XZ,NALATI_MAP} from './nalati-grasslands/generators/layout';\nimport {NALATI_PLACE_SETS} from './nalati-grasslands/generators/placeSets';\nimport {SPECIES_POSES} from './nalati-grasslands/generators/speciesPoses';\nimport {nalatiHeadlessAssembly} from './nalati-grasslands/generators/nativeGroups';\nimport {NALATI_ADMISSION} from '../../test/fixtures/nalati-admission';\nimport type {NalatiTitanProgram} from './nalati-grasslands/generators/stormTitanRows.mjs';\ndeclare const pasture:NalatiTitanProgram;\nconst headlessAssembly=nalatiHeadlessAssembly(pasture,NALATI_ADMISSION),nalatiNativeGroupRows=headlessAssembly.constants.groupRows;\nimport {TERRAIN_PAINT_SOURCE} from './nalati-grasslands/generators/nalatiGroundSource';\nimport {buildSabre,SABRE_REST} from './nalati-grasslands/generators/sabre';\nimport {PACK_RESULT_CHANNELS} from './nalati-grasslands/generators/packGroup';\nexport const height:15=SPRUCE_SPECS[0].height;\nBRIDGE_XZ.x=2;\nNALATI_MAP.zones.push({label:'still mutable',x:1,z:2});\nconst place=NALATI_PLACE_SETS[0];if(place!==undefined){place.x=1;const pois:readonly string[]=place.pois;void pois;}\nSPECIES_POSES.horse.programs.push(...SPECIES_POSES.eagle.programs);\nheadlessAssembly.constants.pageWildlife.seed=1;\nnalatiNativeGroupRows.bounds[0]=1;\nTERRAIN_PAINT_SOURCE.seed=1;\nPACK_RESULT_CHANNELS.push('still mutable');\nSABRE_REST.pos.copy(new Vector3());\nexport const sabre:typeof buildSabre=buildSabre;\nSPRUCE_SPECS[0].height=16;\nexport const wrongHeight:16=SPRUCE_SPECS[0].height;\nBRIDGE_XZ.x='bad';\nNALATI_MAP.zones.push({label:'bad',x:'bad',z:2});\nif(place!==undefined)place.pois.push('bad');\nSPECIES_POSES.horse.programs.push(1);\nheadlessAssembly.constants.pageWildlife.seed='bad';\nnalatiNativeGroupRows.bounds[0]='bad';\nTERRAIN_PAINT_SOURCE.missing;\nSPECIES_POSES.missing;\n";
 expect(diagnostics().map(diagnostic=>diagnostic.code)).toEqual([2540,2322,2322,2322,2339,2345,2322,2322,2339,2339]);
});
