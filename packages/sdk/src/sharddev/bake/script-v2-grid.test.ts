
import { expect,test } from 'vitest';
import { layoutV2,writeV2Frame,validateV2Frame,type V2FrameAuthority ,type V2Layout} from '@wildshard/format/scriptWireV2';

import { bakedSamplers } from '@wildshard/format/bakedTerrainSampling';
import { v2CoreSource } from '../as/wsV2';
import { compileScriptV2 } from './compileScriptV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { prepareV2Observations } from '@wildshard/engine/script/observationsV2';

// Test-only setup for the retained real ABI2 protocol contracts.
/** ABI-v2 height-grid transport. Sim/projection callers supply the native world
 * owner's lattice; there is no renderer or implicit active-terrain fallback. */


interface V2HeightGrid {
  readonly originX: number; readonly originZ: number; readonly cellX: number; readonly cellZ: number;
  readonly cols: number; readonly rows: number; readonly waterY: number; readonly heights: Float32Array;
}
/** Validate arithmetic and copy all bytes before touching the guest. Returning
 * a writer lets the same native snapshot survive a rejected call/re-step. */
function prepareV2HeightGrid(layout: V2Layout,grid: V2HeightGrid | null): { readonly count: number; readonly write: (view: DataView) => void } {
  const region = layout.regions[13];if (region === undefined) throw new Error('Missing v2 height-grid region');
  let bytes = new Uint8Array();
  if (grid !== null) {
    const { originX,originZ,cellX,cellZ,cols,rows,waterY,heights } = grid;
    if (![originX,originZ,cellX,cellZ,waterY].every(Number.isFinite) || cellX <= 0 || cellZ <= 0
      || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || region.capacity < 64
      || cols > Math.floor((region.capacity-64)/4/rows)) throw new Error('Invalid or oversized v2 height grid');
    if (heights.length !== cols*rows || !heights.every(Number.isFinite)
      || !Number.isFinite(originX+(cols-1)*cellX) || !Number.isFinite(originZ+(rows-1)*cellZ)) throw new Error('Invalid v2 height-grid samples');
    bytes = new Uint8Array(64+heights.length*4);const view = new DataView(bytes.buffer);
    [originX,originZ,cellX,cellZ].forEach((value,i) => view.setFloat64(i*8,value,true));
    view.setUint32(32,cols,true);view.setUint32(36,rows,true);view.setUint32(40,region.offset+64,true);view.setFloat64(48,waterY,true);view.setUint32(56,1,true);
    heights.forEach((value,i) => view.setFloat32(64+i*4,value,true));
  }
  return { count: bytes.length,write: view => {
    if (view.byteLength !== layout.pages*65536) throw new Error('Wrong v2 height-grid memory');
    const target = new Uint8Array(view.buffer,view.byteOffset+layout.io+region.offset,region.capacity);
    if (bytes.length === 0) target.subarray(0,64).fill(0);else target.set(bytes);
  } };
}


const layout = layoutV2(1024,1,new Map([[1,1],[2,2],[3,2],[4,2],[5,1],[14,128]]));
const grid: V2HeightGrid = { originX: -1,originZ: -1,cellX: 1,cellZ: 1,cols: 3,rows: 3,waterY: -5,heights: Float32Array.from([1.1,2,7,3,9,4,-2,3,8]) };
function at(kind: number): number { const region = layout.regions[kind-1];if (region === undefined) throw new Error('Missing fixture region');return 1024+region.offset; }
const source = `import * as ws from './sdk/as/wsV2';
export function ws_abi():i32{return 2;} export function ws_io():i32{return ws.io();}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return 0;}
export function ws_step(tick:i32,fuel:i32):i32{ws.beginState();ws.select(0);ws.setState(0,ws.gridHeight(ws.parameter(0),ws.parameter(1)));ws.setState(1,ws.gridWater());return 0;}`;
let compiled: Promise<Uint8Array> | undefined;
async function host(): Promise<ScriptModuleV2> {
  compiled ??= compileScriptV2(source,{ ioBytes: layout.bytes,sources: { 'sdk/as/wsV2.ts': v2CoreSource(1024) } });
  return new ScriptModuleV2(await compiled,{ seed: [1,2],initFuel: 10000,ioBytes: layout.bytes,output: [{ offset: at(3),width: 8,count: 2 }] });
}
function prepare(view: DataView,x: number,z: number,value: V2HeightGrid | null = grid): V2FrameAuthority {
  const observations = prepareV2Observations(layout,6,{ bindings: [{ identity: 'ground',handle: 1,self: 0,player: 0,observed: new Set(),enabled: true,due: true,divisor: 6,fuel: 100000,previousTick: 0,currentTick: 6,state: [0,0],parameters: [{ name: 'x',value: x },{ name: 'z',value: z }],fields: [],sample: { atTick: 6,target: 0 } }],players: [],edges: [],events: [],actions: new Set(),eventKinds: new Set() });
  const heights = prepareV2HeightGrid(layout,value), counts = new Map(observations.counts);counts.set(14,heights.count);
  const authority = writeV2Frame(view,layout,{ module: 1,lane: 1,sequence: 1,tick: 6,due: 1 },counts);observations.write(view);heights.write(view);return authority;
}
test('the v2 height grid keeps the native Float32 lattice and bilinear law at corners, interior and boundaries', async () => {
  const module = await host(), native = bakedSamplers({ res: 3,size: 2,seed: 1,landscapeHash: 0,heights: grid.heights,splat: new Uint8Array(36),undergrowth: null });
  for (const [x,z] of [[-1,-1],[1,1],[-1,1],[1,-1],[0,0],[-.7,.24],[.999,.99]] as const) {
    let authority: V2FrameAuthority;
    const result = module.step(6,100000,view => { authority = prepare(view,x,z); },view => { validateV2Frame(view,layout,authority);return [view.getFloat64(at(3),true),view.getFloat64(at(3)+8,true)]; }).value;
    expect(result).toEqual([native.heightAt(x,z),-5]);
  }
});
test('outside/absent grids and forged dimensions never fall through to another terrain owner', async () => {
  const module = await host();let reads = 0;
  for (const write of [
    (view: DataView) => { prepare(view,-1.01,0); },(view: DataView) => { prepare(view,0,1.01); },(view: DataView) => { prepare(view,0,0,null); },
    (view: DataView) => { prepare(view,0,0);view.setUint32(at(14)+32,0xffffffff,true); },
    (view: DataView) => { prepare(view,0,0);view.setUint32(at(14)+40,0xfffffff0,true); },
    (view: DataView) => { prepare(view,0,0);view.setUint32(at(14)+56,3,true); },
  ]) expect(() => module.step(6,100000,write,() => { reads++; })).toThrow(WebAssembly.RuntimeError);
  expect(reads).toBe(0);expect(() => module.step(6,100000,view => { prepare(view,0,0); },() => undefined)).not.toThrow();
});
test('host grid preparation checks all sizes before copying and retains a stable native sample image', () => {
  const input = { ...grid,heights: grid.heights.slice() }, captured = prepareV2HeightGrid(layout,input), view = new DataView(new ArrayBuffer(65536));input.heights.fill(99);captured.write(view);
  expect(view.getFloat32(at(14)+64,true)).toBe(grid.heights[0]);expect(captured.count).toBe(100);expect(view.getUint32(at(14)+44,true)).toBe(0);expect(view.getUint32(at(14)+60,true)).toBe(0);
  for (const value of [{ ...grid,cols: Number.MAX_SAFE_INTEGER },{ ...grid,rows: 1 },{ ...grid,cellX: 0 },{ ...grid,originX: Infinity },{ ...grid,heights: Float32Array.from([1,2,3,4]) },{ ...grid,heights: Float32Array.from([1,2,3,4,5,6,7,8,Infinity]) }]) expect(() => prepareV2HeightGrid(layout,value)).toThrow();
  const absent = prepareV2HeightGrid(layout,null);expect(absent.count).toBe(0);absent.write(view);expect(new Uint8Array(view.buffer,at(14),64).every(value => value === 0)).toBe(true);
});
