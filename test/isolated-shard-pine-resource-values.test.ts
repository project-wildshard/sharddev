// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/creatureLofts", "pine-hollow/generators/npcSkin", "pine-hollow/generators/state", "pine-hollow/generators/wildlifeDraw"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test("Pine resource declarations preserve skeleton, state and mutable draw contracts",()=>{
 const consumer=resolve('src/shards/t4-pine-fifth-consumer.ts');
 let source="import {LEG_BONE_NAMES,PARENT,WALK} from './pine-hollow/generators/npcSkin';\nimport {PINE_STATE} from './pine-hollow/generators/state';\nimport {wildlifeDraw} from './pine-hollow/generators/wildlifeDraw';\nconst WILDLIFE_DRAW=wildlifeDraw([]);\nexport const hip:'hips'=LEG_BONE_NAMES[0];\nexport const stride:0.24=WALK.stride;\nexport const revision:1=PINE_STATE.version;\nPARENT.push(22);\nWILDLIFE_DRAW.assets.name='another-bank';\n";
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
 source="import {LEG_BONE_NAMES,PARENT,WALK} from './pine-hollow/generators/npcSkin';\nimport {PINE_STATE} from './pine-hollow/generators/state';\nimport {wildlifeDraw} from './pine-hollow/generators/wildlifeDraw';\nconst WILDLIFE_DRAW=wildlifeDraw([]);\nexport const hip:'hips'=LEG_BONE_NAMES[0];\nexport const stride:0.24=WALK.stride;\nexport const revision:1=PINE_STATE.version;\nPARENT.push(22);\nWILDLIFE_DRAW.assets.name='another-bank';\nPARENT.push('22');\nLEG_BONE_NAMES[0]='head';\nWALK.stride=0.5;\nPINE_STATE.version=2;\nWILDLIFE_DRAW.assets.name=1;\nWILDLIFE_DRAW.assets.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(3);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(6);
});
