/** Author-side closed-runtime import validation, shared by output validation. */
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve installed public exports without executing packages.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve runtime-local imports inside the copied output.
import { dirname, resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Confirm a relative import names an inventoried TypeScript file.
import { existsSync } from 'node:fs';
import { parseSync } from 'vite';

const resolver = createRequire(resolve(import.meta.dirname,'package.json'));
/** Exact package families: public engine/game/SDK/format exports, three's
 * exported JavaScript modules, and valibot's root. Never Node or commons. */
export function runtimePackageAllowed(specifier: string): boolean {
  if (/[?#]/u.test(specifier) || !/^(?:@wildshard\/(?:engine|game|sdk|sharddev|format)\/[^.][a-zA-Z0-9_./-]*|three(?:\/[^.][a-zA-Z0-9_./-]*)?|valibot)$/u.test(specifier)) return false;
  try { return /\.[cm]?[jt]s$/u.test(resolver.resolve(specifier)); } catch { return false; }
}
function object(input: unknown): Record<string,unknown>|null { return typeof input==='object'&&input!==null&&!Array.isArray(input)?input as Record<string,unknown>:null; }
function literal(input:unknown):string|null { const node=object(input);if(node?.['type']==='Literal'&&typeof node['value']==='string')return node['value'];const expressions=node?.['expressions'],quasis=node?.['quasis'];if(node?.['type']==='TemplateLiteral'&&Array.isArray(expressions)&&expressions.length===0&&Array.isArray(quasis)){const value=object(object(quasis[0])?.['value'])?.['cooked'];if(typeof value==='string')return value;}return null; }
/** Refuse unresolved, computed, asset and escaping imports on the actual copy.
 * This check executes no runtime module and grants no private-binary credit. */
export function validateRuntimeImports(directory:string,path:string,source:string):void {
 const parsed=parseSync(path,source);if(parsed.errors.length>0)throw new Error('Invalid runtime TypeScript');
 const root=resolve(directory,'runtime');
 const check=(input:unknown,glob=false):void=>{const specifier=literal(input);if(specifier===null)throw new Error('Runtime import must be a literal');if(glob&&specifier.startsWith('!'))return;
  if(specifier.startsWith('.')){const target=resolve(directory,dirname(path),specifier);if(!target.startsWith(`${root}${sep}`)||/[?#]/u.test(specifier)||/\.[^/]+$/u.test(specifier)&&!specifier.endsWith('.ts'))throw new Error('Runtime import escapes its TypeScript copy');
   if(!glob&&![target,`${target}.ts`,resolve(target,'index.ts')].some(file=>file.endsWith('.ts')&&existsSync(file)))throw new Error('Runtime import has no copied TypeScript target');
  }else if(!runtimePackageAllowed(specifier))throw new Error(`Runtime package is not a public runtime export: ${specifier}`);
 };
 const walk=(input:unknown):void=>{if(Array.isArray(input)){for(const child of input)walk(child);return;}const node=object(input);if(node===null)return;
  const type=node['type'];if(type==='ImportDeclaration'||type==='ImportExpression'||type==='TSImportType')check(node['source']);
  if((type==='ExportNamedDeclaration'||type==='ExportAllDeclaration')&&node['source']!==null&&node['source']!==undefined)check(node['source']);
  if(type==='TSExternalModuleReference')check(node['expression']);
  if(type==='CallExpression'){const callee=object(node['callee']);if(callee?.['type']==='Identifier'&&callee['name']==='require'){const args=node['arguments'];check(Array.isArray(args)?args[0]:undefined);}
   if(callee?.['type']==='MemberExpression'){const property=object(callee['property']);if(property?.['name']==='glob'||property?.['name']==='globEager'){const args=node['arguments'];if(!Array.isArray(args))throw new Error('Missing runtime glob');const array=object(args[0]);const patterns=array?.['type']==='ArrayExpression'?array['elements']:[args[0]];if(!Array.isArray(patterns))throw new Error('Invalid runtime glob');for(const pattern of patterns)check(pattern,true);const properties=object(args[1])?.['properties'];if(Array.isArray(properties)&&properties.some(value=>{const key=object(object(value)?.['key']);return key?.['name']==='query'||key?.['name']==='as';}))throw new Error('Runtime globs cannot import assets');}}}
  if(type==='NewExpression'&&object(node['callee'])?.['name']==='URL'){const args=node['arguments'];if(Array.isArray(args)&&object(object(args[1])?.['object'])?.['type']==='MetaProperty')check(args[0]);}
  for(const [key,child]of Object.entries(node))if(key!=='comments'&&key!=='parent')walk(child);
 };walk(parsed.program);
}
