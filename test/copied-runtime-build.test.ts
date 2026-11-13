// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures own their small source and output directories.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture paths are confined to their owned tmp root.
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { emptyShardfile } from '@wildshard/sdk/author';
import { buildProject } from '@wildshard/sdk/project';
import { proveRuntimeData } from '@wildshard/sdk/outputRuntime';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { parseOutputIndex } from '@wildshard/format/outputIndex';

const owned: string[] = [];
afterEach(() => { for (const directory of owned.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture(runtime = 'null', mirrors = true): { project: string; destination: string } {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'copied-runtime-build-')); owned.push(root);
  const project = resolve(root, 'project'), destination = resolve(root, 'output');
  mkdirSync(resolve(project, 'runtime'), { recursive: true });
  const shard = emptyShardfile({ slug: 'runtime-test', name: 'Runtime', author: 'Test', revision: 1, seed: 3 });
  // The declaration is raw config text: LD9 retired the copied-runtime `entry` arm, so it is no longer a typed shape.
  writeFileSync(resolve(project, 'shard.config.ts'), `
export default {...${JSON.stringify(shard)}, runtime: ${runtime}};
export const output = {};
${mirrors ? "export const mirrors = [{name:'REWARD',value:{amount:3}}];" : ''}
`);
  writeFileSync(resolve(project, 'runtime/index.ts'), 'throw new Error("Page entry must never execute during a build");\r\n');
  writeFileSync(resolve(project, 'runtime/hybrid.ts'), 'throw new Error("Native entry must never execute during a build");\n');
  writeFileSync(resolve(project, 'runtime/const.ts'), 'export const REWARD = {amount:3};\r\n');
  return { project, destination };
}
it('refuses a copied runtime build with no successful product receipt and never evaluates its entry (LD9)', async () => {
  const { project, destination } = fixture();
  await expect(buildProject(project, destination, { outputFormat: 2, client: null, copyRuntime: true })).rejects.toThrow('cannot contain executable source');
  expect(existsSync(resolve(destination, 'validation.json'))).toBe(false);
  expect(existsSync(resolve(destination, 'runtime'))).toBe(false);
});
it('refuses a source entry declaration at admission', async () => {
  const { project, destination } = fixture(JSON.stringify({ entry: 'runtime/hybrid.ts' }));
  await expect(buildProject(project, destination, { outputFormat: 2, client: null, copyRuntime: true })).rejects.toThrow();
  expect(existsSync(resolve(destination, 'validation.json'))).toBe(false);
});
it('proves platform-only output, and declared mirrors still need a runtime constant', async () => {
  const { project, destination } = fixture('null', false);
  for (const file of ['index.ts', 'hybrid.ts', 'const.ts']) rmSync(resolve(project, 'runtime', file));
  await buildProject(project, destination, { outputFormat: 2, client: null, copyRuntime: true });
  const { index } = validateOutputProduct(destination);
  expect(index.runtime).toBeNull();
  expect(() => { proveRuntimeData(destination, index, []); }).not.toThrow();
  const schema={path:'schemas/custom/old.schema.json',hash:'0'.repeat(64),bytes:2};
  expect(()=>parseOutputIndex({...index,schemas:[schema]})).toThrow();
  expect(()=>proveRuntimeData(destination,{...index,schemas:[schema]},[])).toThrow('Custom runtime registries are retired');
  expect(()=>proveRuntimeData(destination,{...index,sections:[{name:'custom/old',path:'sections/custom/old.json',schema:schema.path,hash:'0'.repeat(64),bytes:2}]},[])).toThrow('Custom runtime registries are retired');
  expect(() => { proveRuntimeData(destination, index, [{ name: 'REWARD', value: { amount: 3 } }]); }).toThrow('runtime/const.ts');
});
it('refuses a copied-runtime inventory: the index schema refuses an entry row, the proof refuses any listed copy', async () => {
  const { project, destination } = fixture('null', false);
  for (const file of ['index.ts', 'hybrid.ts', 'const.ts']) rmSync(resolve(project, 'runtime', file));
  await buildProject(project, destination, { outputFormat: 2, client: null, copyRuntime: true });
  const { index } = validateOutputProduct(destination);
  const copy = { path: 'runtime/index.ts', hash: '0'.repeat(64), bytes: 1, lines: 1 };
  // LD10 tail: the retired `entry` inventory row no longer parses at all
  const raw: unknown = JSON.parse(readFileSync(resolve(destination, 'shard.json'), 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error('Missing output index');
  expect(() => parseOutputIndex({ ...raw, runtime: { entry: 'runtime/index.ts', trust: 'first-party', files: [copy], lines: 1 } })).toThrow();
  // a client-plan row that lists a copy is refused before the copy is read, whether it is missing or tampered
  const cost = { webContentMB: 500, glMB: 100, engineBaseMB: 300, rev: 'abcdef1234', device: 'Fixture', evidence: 'progress/memory/fixture.json' };
  const listed = { ...index, runtime: { kind: 'client-plan' as const, cost, binds: [], trust: 'first-party' as const, files: [copy], lines: 0 as const } };
  expect(() => { proveRuntimeData(destination, listed, []); }).toThrow('Runtime proof requires a client-plan output with no copied TypeScript');
  mkdirSync(resolve(destination, 'runtime'), { recursive: true });
  writeFileSync(resolve(destination, 'runtime/index.ts'), 'export const tampered = true;\n');
  expect(() => { proveRuntimeData(destination, listed, []); }).toThrow('Runtime proof requires a client-plan output with no copied TypeScript');
});
it('refuses overlapping source/output before clearing the author project', async () => {
  const { project } = fixture();
  const config = readFileSync(resolve(project, 'shard.config.ts'));
  await expect(buildProject(project, project, { outputFormat: 2, client: null, copyRuntime: true })).rejects.toThrow('separate');
  expect(readFileSync(resolve(project, 'shard.config.ts'))).toEqual(config);
});


it('compiled project builds always refuse hidden executable sources without a copy flag',async()=>{
  const {project,destination}=fixture(),shard=emptyShardfile({slug:'compiled-build',name:'Compiled build',author:'Fixture',revision:1,seed:3});
  shard.runtime={kind:'client-plan',cost:{webContentMB:500,glMB:100,engineBaseMB:300,rev:'abcdef1234',device:'Fixture',evidence:'progress/memory/fixture.json'},binds:[]};
  writeFileSync(resolve(project,'shard.config.ts'),`export default ${JSON.stringify(shard)};`);
  await expect(buildProject(project,destination,{client:null})).rejects.toThrow('cannot contain executable source');
  rmSync(resolve(project,'runtime'),{recursive:true});mkdirSync(resolve(project,'runtime'));
  writeFileSync(resolve(project,'runtime/productSections.generated.d.ts'),'export interface Generated {readonly id:string}');
  await buildProject(project,destination,{client:null});
  const {index,shard:actual}=validateOutputProduct(destination);
  expect(index.runtime).toEqual({...shard.runtime,trust:'first-party',files:[],lines:0});expect(actual.runtime).toEqual(shard.runtime);
});
