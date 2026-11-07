// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["nine-dragon-stack/generators/manifestRows", "nine-dragon-stack/generators/mapAssemblySource", "nine-dragon-stack/generators/floorRows", "nine-dragon-stack/generators/sections"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Nine floor and section declarations preserve exact schema and wire contracts',()=>{
 const consumer=resolve('src/shards/t4-nine-third-consumer.ts');
 let source="import {NINE_MANIFEST_ROWS} from './nine-dragon-stack/generators/manifestRows';\nimport {OPENING_HALF,DECK_DEPTH,SLAB,CAP,FRAMES,deckParts} from './nine-dragon-stack/generators/floorRows';\nimport {NINE_SECTION_INPUTS, type LayoutRows, type BakedPlace} from './nine-dragon-stack/generators/sections';\nimport {nineMapAssemblyFrom,type NineMapAssembly} from './nine-dragon-stack/generators/mapAssemblySource';\nexport const dimensions:number[]=[OPENING_HALF,DECK_DEPTH,SLAB,CAP.rail];\nexport const revision:1=NINE_SECTION_INPUTS.layout.entries.version.value;\nexport const minimum:0=NINE_SECTION_INPUTS.geometry.entries.records.min;\nexport const maximum:4000000=NINE_SECTION_INPUTS.geometry.entries.records.max;\nexport const gainKind:'exact-optional'=NINE_SECTION_INPUTS.place.entries.gain.kind;\nNINE_MANIFEST_ROWS.api=2;NINE_MANIFEST_ROWS.uses.push('another-tool');CAP.rail=2;\nconst frame=FRAMES[0];if(frame!==undefined)deckParts(frame).rails.push(...deckParts(frame).rails);\nexport function layout(rows:LayoutRows,place:BakedPlace,map:NineMapAssembly):void{\n const version:1=rows.version;void version;rows.counts.walkers=2;rows.emitters.push(...rows.emitters);\n const emitter=rows.emitters[0];if(emitter!==undefined)emitter.at[0]=2;\n place.spec.style='box';delete place.gain;map.facade.push(...map.facade);\n}\nexport const assemble:typeof nineMapAssemblyFrom=nineMapAssemblyFrom;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Nine author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {NINE_MANIFEST_ROWS} from './nine-dragon-stack/generators/manifestRows';\nimport {OPENING_HALF,DECK_DEPTH,SLAB,CAP,FRAMES,deckParts} from './nine-dragon-stack/generators/floorRows';\nimport {NINE_SECTION_INPUTS, type LayoutRows, type BakedPlace} from './nine-dragon-stack/generators/sections';\nimport {nineMapAssemblyFrom,type NineMapAssembly} from './nine-dragon-stack/generators/mapAssemblySource';\nexport const dimensions:number[]=[OPENING_HALF,DECK_DEPTH,SLAB,CAP.rail];\nexport const revision:1=NINE_SECTION_INPUTS.layout.entries.version.value;\nexport const minimum:0=NINE_SECTION_INPUTS.geometry.entries.records.min;\nexport const maximum:4000000=NINE_SECTION_INPUTS.geometry.entries.records.max;\nexport const gainKind:'exact-optional'=NINE_SECTION_INPUTS.place.entries.gain.kind;\nNINE_MANIFEST_ROWS.api=2;NINE_MANIFEST_ROWS.uses.push('another-tool');CAP.rail=2;\nconst frame=FRAMES[0];if(frame!==undefined)deckParts(frame).rails.push(...deckParts(frame).rails);\nexport function layout(rows:LayoutRows,place:BakedPlace,map:NineMapAssembly):void{\n const version:1=rows.version;void version;rows.counts.walkers=2;rows.emitters.push(...rows.emitters);\n const emitter=rows.emitters[0];if(emitter!==undefined)emitter.at[0]=2;\n place.spec.style='box';delete place.gain;map.facade.push(...map.facade);\n}\nexport const assemble:typeof nineMapAssemblyFrom=nineMapAssemblyFrom;\n\nexport function refuse(rows:LayoutRows,place:BakedPlace,map:NineMapAssembly):void{\n rows.version=2;rows.counts.walkers='many';place.gain=undefined;place.spec.style='unknown';\n map.facade=[];rows.missing;NINE_SECTION_INPUTS.place.entries.missing;\n}\nFRAMES.push;CAP.rail='tall';NINE_MANIFEST_ROWS.debugOptions.push('debug');\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(4);
 expect(refused.filter(code=>code===2412)).toHaveLength(1);
 expect(refused.filter(code=>code===2540)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(3);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused).toHaveLength(10);
});
