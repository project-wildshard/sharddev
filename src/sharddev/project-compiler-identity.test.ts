// oxlint-disable-next-line import/no-nodejs-modules -- Build a tiny installed-package graph inside an owned fixture.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Package resolution uses only this synthetic directory.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { build } from 'vite';
import { compilerPackageInputs, createProjectCompilerIdentities } from './projectCompilerIdentity';

test('compiler identities cover transitive runtime and standard-library bytes, not installation paths', () => {
  mkdirSync('tmp', { recursive: true }); const root = mkdtempSync(resolve('tmp', 'compiler-identity-'));
  try {
    const main = resolve(root, 'node_modules/compiler-main'), child = resolve(root, 'node_modules/compiler-child');
    mkdirSync(main, { recursive: true }); mkdirSync(resolve(child, 'umd'), { recursive: true });
    writeFileSync(resolve(main, 'package.json'), JSON.stringify({ name: 'compiler-main', version: '1', main: 'index.js', dependencies: { 'compiler-child': '2' } }));
    writeFileSync(resolve(main, 'index.js'), 'export const compiler = 1;');
    writeFileSync(resolve(child, 'package.json'), JSON.stringify({ name: 'compiler-child', version: '2', main: 'umd/index.js' }));
    writeFileSync(resolve(child, 'umd/package.json'), JSON.stringify({ type: 'commonjs' }));
    writeFileSync(resolve(child, 'umd/index.js'), 'module.exports = 2;');
    writeFileSync(resolve(child, 'runtime.ts'), 'export function finite(x:f64):f64{return x;}');
    const rows = [{ name: 'compiler-main', from: resolve(root, 'entry.mjs') }], first = compilerPackageInputs(rows);
    expect(first.some(([path]) => path === 'compiler-child@2/runtime.ts')).toBe(true);
    expect(first.some(([path]) => path.startsWith(root))).toBe(false);
    writeFileSync(resolve(child, 'runtime.ts'), 'export function finite(x:f64):f64{return x+1;}');
    expect(compilerPackageInputs(rows)).not.toEqual(first);
    const second = compilerPackageInputs(rows); writeFileSync(resolve(child, 'README.md'), 'Not executed by the compiler');
    expect(compilerPackageInputs(rows)).toEqual(second);
    symlinkSync(resolve(child, 'runtime.ts'), resolve(child, 'alias.ts'));
    expect(() => compilerPackageInputs(rows)).toThrow('symbolic source');
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('raw compiler role excludes only decision builders while generation and raw compiler inputs remain bound',async()=>{
  let decisionVisits=0,rawVisits=0;
  async function identities(mutation:'none'|'decision'|'raw'){
    const identity=createProjectCompilerIdentities(options=>build({...options,plugins:[...(options?.plugins??[]),{
      name:'owned-identity-input-mutation',
      transform(code,id){
        if(id.endsWith('/src/sharddev/buildDecisionScripts.ts')&&mutation==='decision'){
          decisionVisits++;return code.replace('Missing decision source:', 'Changed decision builder source:');
        }
        if(id.endsWith('/src/sharddev/bake/compileScript.ts')&&mutation==='raw'){
          rawVisits++;return code.replace('AssemblyScript compile failed:', 'Changed raw compiler source:');
        }
        return undefined;
      },
    }]}));
    return {project:await identity.project(),raw:await identity.rawAssemblyScript()};
  }
  const before=await identities('none'),decision=await identities('decision');
  expect(decisionVisits).toBeGreaterThan(0);
  expect(decision.project).not.toBe(before.project);
  expect(decision.raw).toBe(before.raw);
  const compiler=await identities('raw');
  expect(rawVisits).toBeGreaterThan(0);
  expect(compiler.project).not.toBe(before.project);
  expect(compiler.raw).not.toBe(before.raw);
},30000);
