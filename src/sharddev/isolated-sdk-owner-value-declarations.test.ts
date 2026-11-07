// oxlint-disable-next-line import/no-nodejs-modules -- Inspect defining declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve an unwritten schema consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["materials","modes","physics","projectGeneration","runtimePerformance","tickWorkerHost","tickWorkerLoop","bake/annulus","bake/mapRaster","bake/props","bake/textureWasm"])test(`${name} emits isolated declarations`,()=>{
 const emitted=ts.transpileDeclaration(readFileSync(`src/${/^(?:tick|headless)/u.test(name)?"sdk":"sharddev"}/${name}.ts`,'utf8'),{fileName:`${name}.ts`,reportDiagnostics:true,compilerOptions:{isolatedDeclarations:true,strict:true,exactOptionalPropertyTypes:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('SDK author values retain node kinds, endpoint owners and numeric defaults',()=>{
 const consumer=resolve('src/sharddev/t4-isolated-sdk-owner-value-declarations-consumer.ts');
 let source="import type {Node} from 'three/webgpu';\nimport {BufferGeometry,Vector3,Matrix4} from 'three';\nimport {graphInputs,meshMap} from './materials';\nimport {Zipline} from './modes';\nimport {annulus} from './bake/annulus';\nimport {partitionWholeGeometry} from './bake/props';\nimport {WORLD_TEXTURE_TOOL} from './bake/textureWasm';\nexport const uv:Node<\"vec4\">=meshMap;\nexport const sky:Node<\"vec3\">=graphInputs.skyLightDirection;\nexport const facing:Node<\"bool\">=graphInputs.frontFacing;\nexport const zip=new Zipline(new Vector3(),new Vector3());\nzip.top.x=1;\nexport const ring:BufferGeometry=annulus(1,2,12);\nexport const parts=partitionWholeGeometry(ring,new Matrix4());\nexport const version:\"4.5.3\"=WORLD_TEXTURE_TOOL.version;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  types:[],skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual declarative world consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+="zip.top=new Vector3();\nWORLD_TEXTURE_TOOL.version=\"4.5.3\";\nannulus(1,2,12,\"arc\");\npartitionWholeGeometry(ring,\"transform\");\nexport const wrong:Node<\"float\">=graphInputs.frontFacing;\nexport const absent=graphInputs.undeclared;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2345)).toHaveLength(2);
 expect(refused.filter(code=>code===2540)).toHaveLength(2);
 expect(refused).toHaveLength(6);
});
