// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/bootFiles"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine boot declarations preserve exact readonly selections',()=>{
 const consumer=resolve('src/shards/t4-pine-boot-consumer.ts');
 let source="import {PINE_BOOT_FILES} from './pine-hollow/generators/bootFiles';\nexport const first:'/assets/hdri/qwantani_sunset_puresky_2k.sky.jpg'=PINE_BOOT_FILES.skyHdr.source.available[0];\nexport const stage:'rapier'=PINE_BOOT_FILES.physics.source.concat[0];\nexport const group:'props'=PINE_BOOT_FILES.propBase.aliases;\nexport const coats:'procedural:/assets/pine-hollow/creatures/'=PINE_BOOT_FILES.coats.source.tablePrefix;\n";
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
 source+="PINE_BOOT_FILES.skyHdr.source.available[0]='another';\nPINE_BOOT_FILES.skyKeys.present=false;\nPINE_BOOT_FILES.physics.source.concat[0]='nav';\nPINE_BOOT_FILES.baked.excludeParts[0]='desktop';\nPINE_BOOT_FILES.world.source.urls.push('another');\nPINE_BOOT_FILES.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(4);
 expect(refused.filter(code=>code===2339)).toHaveLength(2);
 expect(refused).toHaveLength(6);
});
