// oxlint-disable-next-line import/no-nodejs-modules -- Inspect defining author-facing declarations without running producers.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep the strict SDK consumer virtual and unwritten.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ['admission','audio','behaviourSource','buildBehaviour','clientScripts','commons','commonsCosts','headless','interactions','ledger','plumbing','projectOutput','questGraph','quests','species','version','as/ws'])test(`${name} emits isolated SDK declarations`,()=>{
 const emitted=ts.transpileDeclaration(readFileSync(`src/${/^(?:tick|headless)/u.test(name)?"sdk":"sharddev"}/${name}.ts`,'utf8'),{fileName:`${name}.ts`,reportDiagnostics:true,
  compilerOptions:{isolatedDeclarations:true,strict:true,exactOptionalPropertyTypes:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeLessThan(50_000);
});

test('SDK bindings retain fixed revisions, readonly admission limits and schema composition',()=>{
 const consumer=resolve('src/sharddev/t4-sdk-binding-consumer.ts');
 let source="import type * as v from 'valibot';\nimport {SHARDFILE_ADMISSION_LIMITS} from './admission';\nimport {AudioDataSchema} from './audio';\nimport {QuestDataSchema} from './quests';\nimport {StrikeSchema} from './species';\nimport {SHARDFILE_VERSION} from './version';\nimport {WS_CORE} from './as/ws';\nexport const version:'0.1'=SHARDFILE_VERSION;\nexport const files:4096=SHARDFILE_ADMISSION_LIMITS.files;\nexport const audioLength:1=AudioDataSchema.pipe.length;\nexport const questLength:1=QuestDataSchema.pipe.length;\nexport const sourceText:string=WS_CORE;\nexport const tag:v.InferOutput<typeof StrikeSchema>['tags'][number]='damage.physical';\nexport const tagItem=StrikeSchema.entries.tags.pipe[0].item;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  types:[],skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual SDK consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+="SHARDFILE_ADMISSION_LIMITS.files=4096;\nexport const wrongVersion:'0.2'=SHARDFILE_VERSION;\nexport const wrongPipe:2=AudioDataSchema.pipe.length;\nexport const wrongTag:v.InferOutput<typeof StrikeSchema>['tags'][number]='unscoped';\nexport const absent=StrikeSchema.entries.undeclared;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(3);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(5);
});
