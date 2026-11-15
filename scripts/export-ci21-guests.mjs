import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { returnProjectionV2Layout } from '@wildshard/format/returnProjectionV2';
import { compileScriptV2 } from '../src/sharddev/bake/compileScriptV2.ts';
import { v2CoreSource } from '../src/sharddev/as/wsV2.ts';

const target = resolve(process.argv[2] ?? '../engine/test/fixtures/wasm');
const ioBytes = returnProjectionV2Layout(2).bytes;
const source = `import * as core from './core';
export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
export function ws_project(fuel:i32):i32{
  core.beginState();assert(core.beginBinding(0));
  core.pageOutput(2,core.field(0));core.pageOutput(1,core.parameter(0));
  core.endBinding();return fuel;
}`;

mkdirSync(target, { recursive: true });
const bytes = await compileScriptV2(source, { lane: 'project', ioBytes, sources: { 'core.ts': v2CoreSource(0) } });
writeFileSync(resolve(target, 'return-projection-template.wasm'), bytes);
writeFileSync(resolve(target, 'return-projection-template.json'), `${JSON.stringify({ source, fixture: 'return-projection-template.wasm', ioBytes }, null, 2)}\n`);
