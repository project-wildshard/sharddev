// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["nine-dragon-stack/generators/audio", "nine-dragon-stack/generators/banyan", "nine-dragon-stack/generators/casts", "nine-dragon-stack/generators/composite", "nine-dragon-stack/generators/facadePieces", "nine-dragon-stack/generators/facades", "nine-dragon-stack/generators/farLook", "nine-dragon-stack/generators/fragmentFloor", "nine-dragon-stack/generators/frameChannels", "nine-dragon-stack/generators/landingPlanter", "nine-dragon-stack/generators/lightVolumes", "nine-dragon-stack/generators/meshLod", "nine-dragon-stack/generators/moversProgram", "nine-dragon-stack/generators/props3d", "nine-dragon-stack/generators/words", "nine-dragon-stack/generators/stairPlan", "nine-dragon-stack/generators/towers", "nine-dragon-stack/generators/well-lower"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Nine author declarations preserve readonly identities, schema metadata and mutable rows',()=>{
 const consumer=resolve('src/shards/t4-nine-first-consumer.ts');
 let source="import {BANYAN_TREE} from './nine-dragon-stack/generators/banyan';\nimport {SIGN_WORDS,FONT_CHARS} from './nine-dragon-stack/generators/words';\nimport {ND_AUDIO} from './nine-dragon-stack/generators/audio';\nimport {NINE_FRAME_CHANNELS} from './nine-dragon-stack/generators/frameChannels';\nimport {NINE_MOVERS_CONTRACT} from './nine-dragon-stack/generators/moversProgram';\nimport {LIGHT_POOL_INPUTS} from './nine-dragon-stack/generators/lightVolumes';\nimport {compositeRows} from './nine-dragon-stack/generators/composite';\nimport {farLook} from './nine-dragon-stack/generators/farLook';\nimport {FLIGHTS} from './nine-dragon-stack/generators/stairPlan';\nexport const seed:7=BANYAN_TREE.seed;\nexport const word:'\u9EB5'=SIGN_WORDS[0];\nexport const characters:string=FONT_CHARS;\nexport const family:'toon'=farLook.family;\nexport const abi:2=NINE_MOVERS_CONTRACT.abi;\nexport const finite:true=LIGHT_POOL_INPUTS.entries.lantern.entries.k.finite;\nexport const minimum:0=LIGHT_POOL_INPUTS.entries.lantern.entries.k.min;\nND_AUDIO.cues.push(...ND_AUDIO.cues);\nconst program=NINE_FRAME_CHANNELS[0];\nif(program!==undefined){program.id='another-channel';NINE_FRAME_CHANNELS.push(program);}\nconst rows=compositeRows();rows.bleed.tight=0.2;\nconst flight=FLIGHTS[0];if(flight!==undefined)flight.y0=2;\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer,...ts.sys.readDirectory(resolve('src/game'),['.d.ts'],undefined,['**/*.merge.d.ts'])],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Nine author consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source="import {BANYAN_TREE} from './nine-dragon-stack/generators/banyan';\nimport {SIGN_WORDS,FONT_CHARS} from './nine-dragon-stack/generators/words';\nimport {ND_AUDIO} from './nine-dragon-stack/generators/audio';\nimport {NINE_FRAME_CHANNELS} from './nine-dragon-stack/generators/frameChannels';\nimport {NINE_MOVERS_CONTRACT} from './nine-dragon-stack/generators/moversProgram';\nimport {LIGHT_POOL_INPUTS} from './nine-dragon-stack/generators/lightVolumes';\nimport {compositeRows} from './nine-dragon-stack/generators/composite';\nimport {farLook} from './nine-dragon-stack/generators/farLook';\nimport {FLIGHTS} from './nine-dragon-stack/generators/stairPlan';\nexport const seed:7=BANYAN_TREE.seed;\nexport const word:'\u9EB5'=SIGN_WORDS[0];\nexport const characters:string=FONT_CHARS;\nexport const family:'toon'=farLook.family;\nexport const abi:2=NINE_MOVERS_CONTRACT.abi;\nexport const finite:true=LIGHT_POOL_INPUTS.entries.lantern.entries.k.finite;\nexport const minimum:0=LIGHT_POOL_INPUTS.entries.lantern.entries.k.min;\nND_AUDIO.cues.push(...ND_AUDIO.cues);\nconst program=NINE_FRAME_CHANNELS[0];\nif(program!==undefined){program.id='another-channel';NINE_FRAME_CHANNELS.push(program);}\nconst rows=compositeRows();rows.bleed.tight=0.2;\nconst flight=FLIGHTS[0];if(flight!==undefined)flight.y0=2;\nSIGN_WORDS[0]='other';\nBANYAN_TREE.r=1;\nfarLook.grade.exposure=0;\nrows.uniforms.uBleed.v4[0]=0;\nNINE_MOVERS_CONTRACT.abi=2;\nND_AUDIO.cues.push(1);\nif(program!==undefined)program.id=1;\nrows.bleed.tight='small';\nfarLook.missing;\nLIGHT_POOL_INPUTS.entries.missing;\nFLIGHTS.push;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(5);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(2);
 expect(refused.filter(code=>code===2339)).toHaveLength(3);
 expect(refused).toHaveLength(11);
});
