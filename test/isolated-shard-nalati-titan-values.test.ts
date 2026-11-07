// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["nalati-grasslands/generators/stormTitanFight"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test("Titan landing clocks preserve numeric maps and mutable state",()=>{
 const consumer=resolve("src/shards/t4-titan-first-consumer.ts");
 let source="import {TITAN_CLOCKS,TITAN_HOST,TITAN_PHASES} from './nalati-grasslands/generators/stormTitanFight';\nexport const clear:Readonly<Record<string,number>>=TITAN_CLOCKS.clear;\nexport const landing:number|undefined=TITAN_CLOCKS.clear['zzzLanding0on'];\nTITAN_CLOCKS.clear['custom']=1;\nTITAN_HOST.clocks.clear['custom']=2;\nTITAN_HOST.tuning.spearDamage=1;\nTITAN_CLOCKS.frame.outputs.push('still mutable');\nTITAN_PHASES.push({at:0,name:'still mutable',caption:''});\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual author contract consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {TITAN_CLOCKS,TITAN_HOST,TITAN_PHASES} from './nalati-grasslands/generators/stormTitanFight';\nexport const clear:Readonly<Record<string,number>>=TITAN_CLOCKS.clear;\nexport const landing:number|undefined=TITAN_CLOCKS.clear['zzzLanding0on'];\nTITAN_CLOCKS.clear['custom']=1;\nTITAN_HOST.clocks.clear['custom']=2;\nTITAN_HOST.tuning.spearDamage=1;\nTITAN_CLOCKS.frame.outputs.push('still mutable');\nTITAN_PHASES.push({at:0,name:'still mutable',caption:''});\nTITAN_CLOCKS.clear['bad']='bad';\nTITAN_HOST.clocks.clear['bad']=new Date();\nTITAN_HOST.tuning.spearDamage='bad';\nTITAN_CLOCKS.frame.outputs.push(1);\nTITAN_PHASES.push(1);\nTITAN_HOST.clocks.missing;\n";
 expect(diagnostics().map(diagnostic=>diagnostic.code)).toEqual([2322, 2322, 2322, 2345, 2345, 2339]);
});
