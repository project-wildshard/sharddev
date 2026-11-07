// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["nalati-grasslands/generators/riggedHulls"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test("Nalati rig exports preserve original hull and resource contracts",()=>{
 const consumer=resolve("src/shards/t4-rigged-first-consumer.ts");
 let source="import {CREATURE_HULLS,NALATI_HULL_BOOK,nalatiCoatUrl} from './nalati-grasslands/generators/riggedHulls';\nexport const hull:string=CREATURE_HULLS[\"horse:bay\"];\nCREATURE_HULLS[\"horse:bay\"]='still mutable';\nexport const url:string=nalatiCoatUrl('horse','kind','variant');\n";
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
 source="import {CREATURE_HULLS,NALATI_HULL_BOOK,nalatiCoatUrl} from './nalati-grasslands/generators/riggedHulls';\nexport const hull:string=CREATURE_HULLS[\"horse:bay\"];\nCREATURE_HULLS[\"horse:bay\"]='still mutable';\nexport const url:string=nalatiCoatUrl('horse','kind','variant');\nCREATURE_HULLS[\"horse:bay\"]=1;\nNALATI_HULL_BOOK.family.hulls['bad']='bad';\nnalatiCoatUrl(1,'kind','variant');\nCREATURE_HULLS.missing;\nNALATI_HULL_BOOK.missing;\n";
 expect(diagnostics().map(diagnostic=>diagnostic.code)).toEqual([2322, 2542, 2345, 2339, 2339]);
});

test('the exported hull table is the original authored object',async()=>{
 const {CREATURE_HULLS}=await import('../src/shards/nalati-grasslands/generators/riggedHulls');
 const {default:rows}=await import('../src/shards/nalati-grasslands/data/creatureRigs.json',{with:{type:'json'}});
 expect(CREATURE_HULLS).toBe(rows.hulls);
});
