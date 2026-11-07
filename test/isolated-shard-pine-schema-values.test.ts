// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ["pine-hollow/generators/sections"])test(`${name} emits isolated author declarations`,()=>{
 const fileName=`src/shards/${name}.ts`;
 const emitted=ts.transpileDeclaration(readFileSync(fileName,'utf8'),{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('Pine schemas preserve nested metadata, literal actions and exact optional fields',()=>{
 const consumer=resolve('src/shards/t4-pine-sections-consumer.ts');
 let source="import * as v from 'valibot';\nimport {CabinAmbienceSchema,PropKindSchema,LogKitSchema,NativeViewSchema,PineQuestRowsSchema,TradeSchema,parseTradeCatalogue} from './pine-hollow/generators/sections';\nexport const capacity:128=CabinAmbienceSchema.entries.floors.pipe[1].requirement;\nexport const crate:'crate'=LogKitSchema.entries.PROP_KINDS.items[0].literal;\nexport const roar:'roar'=NativeViewSchema.entries.BOSS_ENCOUNTER.options[1].entries.profile.options[1].entries.fight.entries.strike.entries.action.options[0];\nexport function lever(row:Extract<v.InferOutput<typeof PineQuestRowsSchema>['table']['rows'][number],{kind:'lever'}>):'lever'{return row.kind;}\nPropKindSchema.options[0]='crate';\nexport const trade:v.InferOutput<typeof TradeSchema>={id:'trade',label:'Trade',short:'Trade',blurb:'Offer',give:[{item:'venison',n:1}],get:{bolts:2}};\ntrade.give.push({item:'amber-resin',n:1});\nexport function changeCatalogue(value:ReturnType<typeof parseTradeCatalogue>):void{\n const row=value.goods[0];\n if(row!==undefined)row.cost.push({item:'venison',n:1,text:'One venison'});\n}\n";
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
 source+="PropKindSchema.options[0]='barrel';\nTradeSchema.entries=TradeSchema.entries;\nCabinAmbienceSchema.entries.floors.pipe[0]=v.array(v.unknown());\nexport const wrong:'brace'=NativeViewSchema.entries.BOSS_ENCOUNTER.options[1].entries.profile.options[1].entries.fight.entries.strike.entries.action.options[0];\nexport const undefinedOnce:v.InferOutput<typeof TradeSchema>={...trade,once:undefined};\nNativeViewSchema.entries.missing;\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(2);
 expect(refused.filter(code=>code===2322)).toHaveLength(2);
 expect(refused.filter(code=>code===2375)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(6);
});
