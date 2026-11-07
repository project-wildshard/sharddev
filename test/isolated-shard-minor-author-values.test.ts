// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["ink-cel-valley/generators/kit", "pastel-plain/generators/kit", "pastel-plain/generators/ground", "pastel-plain/shard.config", "open-plots/shard.config"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Standalone author declarations preserve readonly roots and mutable ceilings',()=>{
 const consumer=resolve('src/shards/t4-minor-author-consumer.ts');
 let source="import {Group} from 'three';\nimport {Kit as InkKit} from './ink-cel-valley/generators/kit';\nimport {Kit as PastelKit} from './pastel-plain/generators/kit';\nimport {ROAD_HALF} from './pastel-plain/generators/ground';\nimport {buildOptions as pastelOptions} from './pastel-plain/shard.config';\nimport {buildOptions as plotOptions} from './open-plots/shard.config';\nexport const ink=new InkKit(),pastel=new PastelKit();\nexport const root:Group=ink.root;\nexport const road:number=ROAD_HALF;\nink.root.position.x=1;pastel.root.position.x=2;\nink.colliders.push(...ink.colliders);pastel.colliders.push(...pastel.colliders);\nink.owned.push({dispose(){}});pastel.owned.push({dispose(){}});\nink.detail=true;pastel.detail=true;\npastelOptions.asLineCeiling=512;plotOptions.asLineCeiling=512;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual standalone author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {Group} from 'three';\nimport {Kit as InkKit} from './ink-cel-valley/generators/kit';\nimport {Kit as PastelKit} from './pastel-plain/generators/kit';\nimport {ROAD_HALF} from './pastel-plain/generators/ground';\nimport {buildOptions as pastelOptions} from './pastel-plain/shard.config';\nimport {buildOptions as plotOptions} from './open-plots/shard.config';\nexport const ink=new InkKit(),pastel=new PastelKit();\nexport const root:Group=ink.root;\nexport const road:number=ROAD_HALF;\nink.root.position.x=1;pastel.root.position.x=2;\nink.colliders.push(...ink.colliders);pastel.colliders.push(...pastel.colliders);\nink.owned.push({dispose(){}});pastel.owned.push({dispose(){}});\nink.detail=true;pastel.detail=true;\npastelOptions.asLineCeiling=512;plotOptions.asLineCeiling=512;\nink.root=new Group();pastel.root=new Group();\nink.detail=1;pastel.detail=1;\npastelOptions.asLineCeiling='small';plotOptions.asLineCeiling='small';\nink.colliders.push(1);pastel.colliders.push(1);\nink.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(2);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(4);
 expect(refused.filter(code=>code===2345)).toHaveLength(2);
 expect(refused).toHaveLength(9);
});
