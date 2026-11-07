// oxlint-disable-next-line import/no-nodejs-modules -- Inspect author declarations without generated products.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve a virtual author contract consumer.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

for(const name of ['driftwood-isle','ink-cel-valley','nalati-grasslands','pine-hollow'])test(`${name} emits its isolated default product`,()=>{
 const fileName=`src/shards/${name}/generators/product.ts`,source=readFileSync(fileName,'utf8');
 const emitted=ts.transpileDeclaration(source,{fileName,reportDiagnostics:true,
  compilerOptions:{strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true}});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText).toContain(name === 'pine-hollow' ? ': Shardfile;' : 'ReturnType<typeof parseShardfile>');
 expect(emitted.outputText).toContain("from '@wildshard/engine/host/shardfile'");
 expect(emitted.outputText.length).toBeLessThan(100_000);
});

test('default products retain the complete admitted shardfile contract',()=>{
 const consumer=resolve('src/shards/t4-default-product-consumer.ts');
 let source=`import driftwood from '../../test/fixtures/driftwood-product-source';
import ink from '../../test/fixtures/ink-product-source';
import nalati from '../../test/fixtures/nalati-product-source';
import {PINE as pine} from '../../test/fixtures/pine-program';
import type {Shardfile} from '@wildshard/engine/host/shardfile';
export const products:Shardfile[]=[driftwood,ink,nalati,pine];
export const slug:string=driftwood.identity.slug;
export const library:number=ink.budgets.library.resident;
export const x:number=nalati.spawn.x;
export const seed:number=pine.identity.seed;
`;
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  noPropertyAccessFromIndexSignature:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node'],allowArbitraryExtensions:true,skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual Driftwood default consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+=`driftwood.identity.slug=1;
ink.budgets.library.resident='invalid';
nalati.spawn.x='invalid';
pine.identity.seed='invalid';
driftwood.missingProductField;
`;
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2322)).toHaveLength(4);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused).toHaveLength(5);
});
