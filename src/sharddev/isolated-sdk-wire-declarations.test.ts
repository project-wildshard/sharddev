// oxlint-disable-next-line import/no-nodejs-modules -- Inspect defining declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve an unwritten schema consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["worldSource","tickProtocol"])test(`${name} emits isolated declarations`,()=>{
 const emitted=ts.transpileDeclaration(readFileSync(`src/${/^(?:tick|headless)/u.test(name)?"sdk":"sharddev"}/${name}.ts`,'utf8'),{fileName:`${name}.ts`,reportDiagnostics:true,compilerOptions:{isolatedDeclarations:true,strict:true,exactOptionalPropertyTypes:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('SDK wire contracts retain command variants, worker proofs and normalized source defaults',()=>{
 const consumer=resolve('src/sharddev/t4-isolated-sdk-wire-declarations-consumer.ts');
 let source="import type * as v from 'valibot';\nimport {WorldSourceSchema} from './worldSource';\nimport {TickCommandSchema,TickCommitSchema,AuthorProofReportSchema,WorkerRequestSchema} from '@wildshard/engine/host/tickProtocol';\nexport const player:v.InferOutput<typeof TickCommandSchema>={kind:\"player\",moveX:0,moveZ:0,yaw:0,hover:true};\nexport const finish:v.InferOutput<typeof WorkerRequestSchema>={kind:\"finish\"};\ndeclare const report:v.InferOutput<typeof AuthorProofReportSchema>;\ndeclare const source:v.InferOutput<typeof WorldSourceSchema>;\ndeclare const commit:v.InferOutput<typeof TickCommitSchema>;\nexport const saved:true=report.grid.refusedSave;\nexport const ticks:5=report.grid.frozenTicks;\nexport const mode:\"replace\"|undefined=source.farMode;\nexport const objects:Record<string,string>=source.objects;\nexport const micros:number|undefined=commit.scriptMicros;\n";
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
 source+="export const wrongKind:v.InferOutput<typeof TickCommandSchema>[\"kind\"]=\"draw\";\nexport const wrongHover:Extract<v.InferOutput<typeof TickCommandSchema>,{kind:\"player\"}>[\"hover\"]=false;\nexport const wrongProof:v.InferOutput<typeof AuthorProofReportSchema>[\"grid\"][\"refusedSave\"]=false;\nexport const wrongTicks:v.InferOutput<typeof AuthorProofReportSchema>[\"grid\"][\"frozenTicks\"]=6;\nexport const wrongMode:v.InferOutput<typeof WorldSourceSchema>[\"farMode\"]=\"blend\";\nexport const retiredMode:v.InferOutput<typeof WorldSourceSchema>[\"farMode\"]=\"add\";\nexport const absent=commit.undeclared;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(6);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(7);
});
