// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures own only temporary directories below repository tmp.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The build writer receives actual fixture paths.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { RuntimeSchema } from '@wildshard/format/runtime';
import { runtimeAccountedBytes } from '@wildshard/format/runtimeCost';
import { parseManifestMetadata } from '@wildshard/format/minimap';
import { parseOutputIndex } from '@wildshard/format/outputIndex';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { writeOutputProduct, validateOutputProduct } from '../src/sharddev/outputProduct';
import { writeRuntimeFiles } from '../src/sharddev/outputRuntime';
import { formatJsonSchema } from '@wildshard/engine/host/formatJsonSchema';
import { authoredManifestSource } from '@wildshard/engine/scripts/authored-manifest.mjs';
import metadata from '../src/shards/pastel-plain/manifest.json' with {type:'json'};
import { FIXTURE_RUNTIME_COST } from './fixtures/clientPlanRuntime';

// Synthetic accounting for the current format model, not a captured runtime reading.
const cost = { ...FIXTURE_RUNTIME_COST };
const row = { kind: 'client-plan', cost, binds: ['terrain', 'props', 'quests', 'state', 'movers'] };

test('compiled ownership retains the exact authority and measured charge with no source entry', () => {
  const parsed = v.parse(RuntimeSchema, row);
  expect(parsed).toEqual(row); expect(runtimeAccountedBytes(parsed.cost)).toBe(runtimeAccountedBytes(cost));
  // LD9: the copied-runtime `entry` arm is retired; a source entry is refused on its own as well as beside a client plan
  expect(v.safeParse(RuntimeSchema, {entry:'runtime/index.ts',cost,binds:row.binds}).success).toBe(false);
  expect(v.safeParse(RuntimeSchema, {entry:'runtime/index.ts'}).success).toBe(false);
  for (const bad of [{...row,entry:'runtime/index.ts'},{...row,kind:'arbitrary'}, {...row,cost:undefined}, {...row,binds:undefined}, {...row,binds:['state','state']}, {...row,binds:['spawns']}, {...row,load:'runtime/index.ts'}]) expect(v.safeParse(RuntimeSchema,bad).success).toBe(false);
  // The real converter must admit the defining client-plan schema.
  expect(formatJsonSchema(RuntimeSchema)).toBeDefined();
});

test('built-in manifest policy emits only the platform constructor and keeps CSS and ownership', () => {
  mkdirSync('tmp',{recursive:true});
  const root=mkdtempSync(resolve('tmp/compiled-manifest-'));
  try {
  mkdirSync(resolve(root,'src/shards/pastel-plain/data'),{recursive:true});
  writeFileSync(resolve(root,'src/shards/pastel-plain/data/budgets.json'),'{}');
  writeFileSync(resolve(root,'src/shards/pastel-plain/style.css'),'.fixture { color: red; }');
  const rest=structuredClone(metadata);Reflect.deleteProperty(rest,'runtimeEntry');
  const input={...rest,card:{thumb:'data:image/png;base64,AA==',portrait:'data:image/png;base64,AA==',landscape:'data:image/png;base64,AA=='},minimap:{...rest.minimap,image:'data:image/png;base64,AA=='},bindings:{accent:'#123456',budgets:{module:'./data/budgets.json',export:'default'},entry:{platform:'client-plan',retainHomeRuntime:true,stagesOwner:'runtime',styles:['./style.css']}}};
  const parsed=parseManifestMetadata(input), source=authoredManifestSource(root,'pastel-plain',{composed:input});
  expect(parsed.bindings.entry).toEqual(input.bindings.entry);
  expect(source).toContain('declaredClientPlanEntry({"retainHomeRuntime":true,"stagesOwner":"runtime"})');
  expect(source).toContain('await Promise.all([import("./style.css")])');
  expect(source).not.toContain('runtimeModule'); expect(source).not.toContain('nativeModule'); expect(source).not.toContain('resolveTrustedRuntime');
  expect(()=>parseManifestMetadata({...input,bindings:{...input.bindings,entry:{...input.bindings.entry,legacy:'./runtime/hybrid'}}})).toThrow();
  expect(()=>authoredManifestSource(root,'pastel-plain',{composed:{...input,runtimeEntry:'runtime/hybrid.ts'}})).toThrow('names no runtime module');
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('compiled output refuses real runtime code and ships no declaration stubs', () => {
  mkdirSync(resolve('tmp'),{recursive:true}); const root=mkdtempSync(resolve('tmp/client-runtime-')),project=join(root,'project'),output=join(root,'output');
  try {
    mkdirSync(join(project,'runtime'),{recursive:true});writeFileSync(join(project,'runtime','productSections.generated.d.ts'),'export interface Generated { readonly id: string }');
    expect(writeRuntimeFiles(project,output)).toEqual({files:[],lines:0});
    writeFileSync(join(project,'runtime','hidden.ts'),'export const value = 3;');
    expect(()=>writeRuntimeFiles(project,output)).toThrow('cannot contain executable source');
  } finally {rmSync(root,{recursive:true,force:true});}
});


test('actual output transport preserves compiled cost and binds while refusing a hidden TS inventory', () => {
  mkdirSync(resolve('tmp'),{recursive:true});const root=mkdtempSync(resolve('tmp/client-runtime-product-'));
  const source=emptyShardfile({slug:'compiled-product',name:'Compiled product',author:'Fixture',revision:1,seed:7});
  source.runtime={kind:'client-plan',cost,binds:['terrain','props','movers']};
  try{
    const index=writeOutputProduct(source,new Map(),root),actual=validateOutputProduct(root);
    expect(actual.shard.runtime).toEqual(source.runtime);expect(index.runtime).toEqual(source.runtime); // format 0.70 drops empty runtime files and lines (FP4)
    expect(()=>parseOutputIndex({...index,runtime:{...index.runtime,entry:'runtime/index.ts'}})).toThrow();
    expect(()=>parseOutputIndex({...index,runtime:{...index.runtime,lines:1}})).toThrow();
    expect(()=>parseOutputIndex({...index,runtime:{...index.runtime,files:[{path:'runtime/index.ts',hash:'a'.repeat(64),bytes:1,lines:1}]}})).toThrow();
    // J424/J426: a stale reading refuses an armed zone; any other shard reports it. Since format 0.78 (FORMAT-PRUNE FP27c)
    // the armed word comes from the API catalogue at admission, so the SDK, which sees only the slug, reports for every zone.
    const unarmed = structuredClone(source);
    if (unarmed.runtime === null) throw new Error('Missing synthetic client plan');
    Reflect.deleteProperty(unarmed.runtime.cost, 'epoch');
    expect(() => { writeOutputProduct(unarmed, new Map(), join(root, 'stale-unarmed')); validateOutputProduct(join(root, 'stale-unarmed')); }).not.toThrow();
    for (const epoch of [undefined, 1, 2]) {
      const stale = structuredClone({ ...source, identity: { ...source.identity, slug: 'pastel-plain' } });
      if (stale.runtime === null) throw new Error('Missing synthetic client plan');
      if (epoch === undefined) Reflect.deleteProperty(stale.runtime.cost, 'epoch'); else stale.runtime.cost.epoch = epoch;
      expect(() => { writeOutputProduct(stale, new Map(), join(root, `stale-${epoch ?? 'omitted'}`)); validateOutputProduct(join(root, `stale-${epoch ?? 'omitted'}`)); }).not.toThrow();
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
