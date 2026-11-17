// oxlint-disable-next-line import/no-nodejs-modules -- Resolve virtual generated source owners without writing output.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';
import {authoredManifestSource} from '@wildshard/engine/scripts/authored-manifest.mjs';
import {shardSource} from '../scripts/gen-shards.mjs';

/** SDK-SPLIT SP8c: the sample shards and their manifest fixtures stay in the sdk. */
const SDK = resolve(import.meta.dirname, '../../sdk');

function checkGenerated(fileName:string,source:string,annotation:string):void {
 expect(source).toContain(annotation);
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,isolatedDeclarations:true};
 const emitted=ts.transpileDeclaration(source,{fileName,reportDiagnostics:true,compilerOptions:options});
 expect(emitted.diagnostics).toEqual([]);
 expect(emitted.outputText.length).toBeGreaterThan(0);
 const inferred=source.replace(annotation,'');
 const refused=ts.transpileDeclaration(inferred,{fileName,reportDiagnostics:true,compilerOptions:options});
 expect(refused.diagnostics?.map(row=>row.code)).toEqual([9010]);
 const runtime=(text:string):string=>ts.transpileModule(text,{fileName,compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,removeComments:true,
 }}).outputText;
 expect(runtime(source)).toBe(runtime(inferred));
}

test('the discovery producer emits isolated manifest declarations',()=>{
 checkGenerated(resolve(SDK,'src/shards/_template/discovery.generated.ts'),authoredManifestSource(SDK,'_template'),
  ': ReturnType<typeof defineAuthoredShard>');
});

test('the composition producer emits isolated placed shard declarations',()=>{
 const source=shardSource(SDK);
 checkGenerated(resolve(SDK,'src/client/app/shards.generated.ts'),source,': typeof placed');
 expect(source).not.toContain('LEGACY_');
});
