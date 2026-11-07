// oxlint-disable-next-line import/no-nodejs-modules -- Check declaration ownership without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve an unwritten author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ['_template/shard.config','_template/generators/boss','_template/generators/ground',
 '_template/generators/kit','blender-template/shard.config','blender-template/generators/ground',
 'driftwood-isle/generators/bakedCove','driftwood-isle/generators/captainFields',
 'driftwood-isle/generators/cargoCatalogue','driftwood-isle/generators/chapterDirector',
 'driftwood-isle/generators/coveModels']){
 test(`${name} emits isolated author declarations`,()=>{
  const fileName=`src/shards/${name}.ts`;
  const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
   compilerOptions:{isolatedDeclarations:true,strict:true,exactOptionalPropertyTypes:true}});
  expect(emitted.diagnostics).toEqual([]);
  expect(emitted.outputText.length).toBeGreaterThan(0);
  expect(emitted.outputText.length).toBeLessThan(100_000);
 });
}

test('template author declarations retain readonly inputs and mutable resources',()=>{
 const consumer=resolve('src/shards/t4-template-author-consumer.ts');
 let source=`import {generate,buildOptions} from './_template/shard.config';
import {generate as defineGeneration} from './_template/generators/generate';
import {TEMPLATE_BOSS_INPUTS} from './_template/generators/boss';
import {ROAD_HALF} from './_template/generators/ground';
import {Kit} from './_template/generators/kit';
import project from './blender-template/shard.config';
import {GROUND_TILES,output} from './blender-template/generators/ground';
export const generation:typeof defineGeneration=generate;
export const ceiling:number=buildOptions.asLineCeiling;
export const road:number=ROAD_HALF;
export const boss:'behaviour/boss.as'=TEMPLATE_BOSS_INPUTS[3];
export const kit=new Kit();
kit.root.position.x=1;
kit.root.add(new Kit().root);
export const identity:string=project.identity.slug;
export const terrainId:string=GROUND_TILES.id;
export const blobs=output.blobs.map(row=>row.kind);
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual template author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`TEMPLATE_BOSS_INPUTS[0]='behaviour/door.as';
kit.root=new Kit().root;
buildOptions.asLineCeiling='ceiling';
project.identity.slug=1;
output.blobs.push({name:'bad',kind:'audio',source:'bad'});
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(2);
 expect(refused.filter(code=>code===2322)).toHaveLength(3);
 expect(refused).toHaveLength(5);
});
