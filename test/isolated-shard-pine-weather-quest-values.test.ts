// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/weatherChannels", "pine-hollow/generators/questContent"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test("Pine weather and quest declarations preserve channel mutability and chapter omission",()=>{
 const consumer=resolve('src/shards/t4-pine-sixth-consumer.ts');
 let source="import {PINE_WEATHER_PROGRAMS} from './pine-hollow/generators/weatherChannels';\nimport {pineQuestContent} from './pine-hollow/generators/questContent';\nexport const content=pineQuestContent({rows:[]},{goods:[]});\ncontent.id='another-story';\ncontent.chapters.push(...content.chapters);\ncontent.npcs.push(...content.npcs);\nconst program=PINE_WEATHER_PROGRAMS[0];\nif(program!==undefined){program.id='another-channel';PINE_WEATHER_PROGRAMS.push(program);}\n";
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
 source="import {PINE_WEATHER_PROGRAMS} from './pine-hollow/generators/weatherChannels';\nimport {pineQuestContent} from './pine-hollow/generators/questContent';\nexport const content=pineQuestContent({rows:[]},{goods:[]});\ncontent.id='another-story';\ncontent.chapters.push(...content.chapters);\ncontent.npcs.push(...content.npcs);\nconst program=PINE_WEATHER_PROGRAMS[0];\nif(program!==undefined){program.id='another-channel';PINE_WEATHER_PROGRAMS.push(program);}\ncontent.id=2;\ncontent.chapters.push(1);\ncontent.npcs.push(1);\ncontent.board.id=2;\nif(program!==undefined)program.id=2;\nPINE_WEATHER_PROGRAMS.push(1);\nconst chapter=content.chapters[0];\nif(chapter!==undefined)chapter.onComplete;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(3);
 expect(refused.filter(code=>code===2345)).toHaveLength(3);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(7);
});
