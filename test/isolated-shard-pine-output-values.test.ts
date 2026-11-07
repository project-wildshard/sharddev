// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/outputInputs", "pine-hollow/generators/sourceOutput"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test("Pine output declarations preserve named assets and readonly file arrays",()=>{
 const consumer=resolve('src/shards/t4-pine-output-consumer.ts');
 let source="import {PINE_OUTPUT} from './pine-hollow/generators/outputInputs';\nimport type {PineStaticOutput} from './pine-hollow/generators/sourceOutput';\ndeclare const output: PineStaticOutput;\nimport {PINE_MODES} from './pine-hollow/generators/zipline';\nexport const pool:string=PINE_OUTPUT.custom['custom/handsPool'].pool.url;\nPINE_OUTPUT.custom['custom/handsPool'].pool.url='another-named-pool';\nconst bow=PINE_OUTPUT.custom['custom/handsPool'].heldBow;\nbow.bow.arrow.maxStuck=10;\nconst first=output.namedFiles[0];\nif(first!==undefined){const hash:string=first.hash;void hash;first.hash='another-hash';}\nexport const modes=PINE_MODES;\n";
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
 source="import {PINE_OUTPUT} from './pine-hollow/generators/outputInputs';\nimport type {PineStaticOutput} from './pine-hollow/generators/sourceOutput';\ndeclare const output: PineStaticOutput;\nimport {PINE_MODES} from './pine-hollow/generators/zipline';\nexport const pool:string=PINE_OUTPUT.custom['custom/handsPool'].pool.url;\nPINE_OUTPUT.custom['custom/handsPool'].pool.url='another-named-pool';\nconst bow=PINE_OUTPUT.custom['custom/handsPool'].heldBow;\nbow.bow.arrow.maxStuck=10;\nconst first=output.namedFiles[0];\nif(first!==undefined){const hash:string=first.hash;void hash;first.hash='another-hash';}\nexport const modes=PINE_MODES;\nPINE_OUTPUT.custom['custom/handsPool'].pool.url=2;\nbow.bow.arrow.maxStuck='many';\noutput.namedFiles.push;\nif(first!==undefined)first.hash=2;\nPINE_OUTPUT.custom['custom/handsPool'].missing;\nPINE_MODES.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(3);
 expect(refused.filter(code=>code===2339)).toHaveLength(3);
 expect(refused).toHaveLength(6);
});
