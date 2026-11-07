// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/cabinSceneAssembly", "pine-hollow/generators/cabinScenes", "pine-hollow/generators/cragAssembly", "pine-hollow/generators/fireLookout", "pine-hollow/generators/logCabin", "pine-hollow/generators/siteTimbers"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine assembly declarations preserve readonly ownership and default recorder ports',()=>{
 const consumer=resolve('src/shards/t4-pine-structural-consumer.ts');
 let source="import * as THREE from 'three';\nimport type {CabinAuthorResources,CabinAuthorAssembly} from './pine-hollow/generators/cabinSceneAssembly';\nimport type {CabinSceneRecorder} from './pine-hollow/generators/cabinScenes';\nimport type {CabinBuilder} from './pine-hollow/generators/logCabin';\nimport {bakeFireLookout} from './pine-hollow/generators/fireLookout';\nimport {bakeSiteTimbers} from './pine-hollow/generators/siteTimbers';\nexport function check(resources:CabinAuthorResources,assembly:CabinAuthorAssembly,recorder:CabinSceneRecorder,builder:CabinBuilder):void{\n const mesh=new THREE.Mesh();\n resources.clouds.set(mesh,new Float32Array(4));\n assembly.root.position.x=1;\n recorder.geometry.set('new-shape',new THREE.BufferGeometry());\n recorder.sourceMaterials.set('new-material',{id:'id',url:'asset',part:0});\n const source=recorder.sourceMaterials.get('new-material');\n if(source!==undefined){const part:number=source.part;void part;}\n builder.root=new THREE.Group();\n}\nexport const omittedLookout=bakeFireLookout();\nexport const explicitLookout=bakeFireLookout(undefined);\nexport const omittedTimbers=bakeSiteTimbers(()=>0);\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Pine author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import * as THREE from 'three';\nimport type {CabinAuthorResources,CabinAuthorAssembly} from './pine-hollow/generators/cabinSceneAssembly';\nimport type {CabinSceneRecorder} from './pine-hollow/generators/cabinScenes';\nimport type {CabinBuilder} from './pine-hollow/generators/logCabin';\nimport {bakeFireLookout} from './pine-hollow/generators/fireLookout';\nimport {bakeSiteTimbers} from './pine-hollow/generators/siteTimbers';\nexport function check(resources:CabinAuthorResources,assembly:CabinAuthorAssembly,recorder:CabinSceneRecorder,builder:CabinBuilder):void{\n const mesh=new THREE.Mesh();\n resources.clouds.set(mesh,new Float32Array(4));\n assembly.root.position.x=1;\n recorder.geometry.set('new-shape',new THREE.BufferGeometry());\n recorder.sourceMaterials.set('new-material',{id:'id',url:'asset',part:0});\n const source=recorder.sourceMaterials.get('new-material');\n if(source!==undefined){const part:number=source.part;void part;}\n builder.root=new THREE.Group();\n resources.clouds=new Map();\n assembly.root=new THREE.Group();\n recorder.geometry=new Map();\n if(source!==undefined)source.part=1;\n builder.root=1;\n resources.clouds.set(mesh,new Uint8Array(4));\n}\nexport const omittedLookout=bakeFireLookout();\nexport const explicitLookout=bakeFireLookout(undefined);\nexport const omittedTimbers=bakeSiteTimbers(()=>0);\n\nbakeFireLookout(1);\nbakeSiteTimbers(()=>0,1);\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(4);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2345)).toHaveLength(3);
 expect(refused).toHaveLength(8);
});
