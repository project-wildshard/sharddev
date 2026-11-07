// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["open-plots/generators/product"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(20_000);
});

test('Open plot declarations preserve factory output maps and optional look fields',()=>{
 const consumer=resolve('src/shards/t4-open-plot-consumer.ts');
 let source="import {outputs,product} from './open-plots/generators/product';\nexport const map:Record<string,typeof product>=outputs;\nexport const reverse:typeof outputs=map;\nexport const paths:string[]=Object.values(outputs).map(row=>row.world.glb);\nexport const file:string=product.world.glb;\nexport const x:number=product.spawn.x;\nexport const author:string=product.identity.author;\nexport const empty:Record<string,typeof product>={};\noutputs['copy']=product;\nconst value=outputs['one'];if(value!==undefined){value.identity.seed=7;value.world.glb='assets/another/world.glb';}\nproduct.identity.name='Another plot';product.spawn.x=2;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual open plot consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {outputs,product} from './open-plots/generators/product';\nexport const map:Record<string,typeof product>=outputs;\nexport const reverse:typeof outputs=map;\nexport const paths:string[]=Object.values(outputs).map(row=>row.world.glb);\nexport const file:string=product.world.glb;\nexport const x:number=product.spawn.x;\nexport const author:string=product.identity.author;\nexport const empty:Record<string,typeof product>={};\noutputs['copy']=product;\nconst value=outputs['one'];if(value!==undefined){value.identity.seed=7;value.world.glb='assets/another/world.glb';}\nproduct.identity.name='Another plot';product.spawn.x=2;\n\nif(value!==undefined){value.identity.seed='seven';value.world.glb=2;value.missing;}\nproduct.identity.author=7;product.spawn.x='west';product.missing;\noutputs['unknown'].world.glb;\noutputs['bad']={};\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(5);
 expect(refused.filter(code=>code===2339)).toHaveLength(2);
 expect(refused.filter(code=>code===2532)).toHaveLength(1);
 expect(refused).toHaveLength(8);
});
