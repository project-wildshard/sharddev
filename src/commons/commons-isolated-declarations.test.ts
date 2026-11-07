// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the defining commons project and portable authoring source.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep strict consumer checks virtual and unwritten.
import {resolve} from 'node:path';
import ts from '@typescript/typescript6';
import {expect,test} from 'vitest';

function commonsProject():ts.ParsedCommandLine {
 const path=resolve('tsconfig.commons.json'),config=ts.readConfigFile(path,file=>ts.sys.readFile(file));
 if(config.error!==undefined)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,' '));
 return ts.parseJsonConfigFileContent(config.config,ts.sys,'.',undefined,path);
}

test('commons authoring requires isolated declarations and excludes test owners',()=>{
 const project=commonsProject();
 expect(project.errors).toEqual([]);
 expect(project.options.isolatedDeclarations).toBe(true);
 expect(project.options.declaration).toBe(true);
 expect(project.options.types).toContain('node');
 expect(project.fileNames.some(file=>file.endsWith('.test.ts'))).toBe(false);
 const options:ts.CompilerOptions={isolatedDeclarations:true,strict:true,exactOptionalPropertyTypes:true};
 const inferred=ts.transpileDeclaration('export const owner=Object.freeze({active:true});',{
  fileName:'inferred.ts',reportDiagnostics:true,compilerOptions:options,
 });
 expect((inferred.diagnostics??[]).map(row=>row.code)).toContain(9010);
 const missingReturn=ts.transpileDeclaration('export function owner(){return Object.freeze({active:true});}',{
  fileName:'return.ts',reportDiagnostics:true,compilerOptions:options,
 });
 expect((missingReturn.diagnostics??[]).map(row=>row.code)).toContain(9007);
});

test('every owned commons implementation emits isolated declarations',()=>{
 const project=commonsProject(),files=project.fileNames.filter(file=>/\.m?ts$/.test(file)&&!ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest).isDeclarationFile);
 expect(files.length).toBeGreaterThan(0);
 for(const file of files){
  const emitted=ts.transpileDeclaration(readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,
   compilerOptions:{isolatedDeclarations:true,strict:true,exactOptionalPropertyTypes:true}});
  expect(emitted.diagnostics,file).toEqual([]);
  expect(emitted.outputText.length,file).toBeGreaterThan(0);
 }
});

test('portable math preserves readonly function keys, numeric arguments and callback results',()=>{
 const consumer=resolve('src/commons/t4-portable-consumer.ts');
 let source="import {portableMath,installPortableMath,withPortableMath} from './bake/portableMath';\nexport const sine:number=portableMath.sin(1);\nexport const power:number=portableMath.pow(2,3);\nexport const restore:()=>void=installPortableMath();\nexport const marker:{readonly value:'kept'}=withPortableMath(()=>({value:'kept'}));\n";
 const options:ts.CompilerOptions={strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  types:[],skipLibCheck:true,noEmit:true};
 const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.fileExists=file=>file===consumer||exists(file);
 host.readFile=file=>file===consumer?source:read(file);
 const diagnostics=():readonly ts.Diagnostic[]=>{
  const program=ts.createProgram([consumer],options,host),file=program.getSourceFile(consumer);
  if(file===undefined)throw new Error('Missing virtual commons consumer');
  return program.getSemanticDiagnostics(file);
 };
 expect(diagnostics()).toEqual([]);
 source+="portableMath.sin=(x:number)=>x;\nportableMath.pow('wrong',2);\nexport const absent=portableMath.undeclared;\nexport const wrong:string=withPortableMath(()=>1);\n";
 const refused=diagnostics().map(diagnostic=>diagnostic.code);
 expect(refused.filter(code=>code===2540)).toHaveLength(1);
 expect(refused.filter(code=>code===2345)).toHaveLength(1);
 expect(refused.filter(code=>code===2339)).toHaveLength(1);
 expect(refused.filter(code=>code===2322)).toHaveLength(1);
 expect(refused).toHaveLength(4);
});
