// Test-only setup for the retained real ABI2 protocol contracts.
/** Generate the module-sized sim loop. A binding program exports onBinding;
 * it uses the same memory SDK and cannot import a JS callback or refill fuel. */
import { compileScriptV2 } from '../bake/compileScriptV2';
import { v2CoreSource } from '../as/wsV2';

export function compileSimV2(program: string,options: {
  readonly io: number; readonly ioBytes: number; readonly maximumPages?: number;
  readonly sources?: Readonly<Record<string,string>>;
}): Promise<Uint8Array> {
  if (Object.hasOwn(options.sources ?? {},'program.ts') || Object.hasOwn(options.sources ?? {},'sdk/as/wsV2.ts')) throw new Error('Reserved v2 sim source');
  const source = `import * as ws from './sdk/as/wsV2';import { onBinding } from './program';
export function ws_abi():i32{return 2;} export function ws_io():i32{return ws.io();}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return 0;}
export function ws_step(tick:i32,fuel:i32):i32{
 ws.beginState();for(let i=0;i<ws.count(1);i++){if(!ws.beginBinding(i))continue;onBinding();ws.endBinding();}return 0;
}`;
  return compileScriptV2(source,{ lane: 'sim',ioBytes: options.ioBytes,...(options.maximumPages === undefined ? {} : { maximumPages: options.maximumPages }),
    sources: { ...options.sources,'program.ts': program,'sdk/as/wsV2.ts': v2CoreSource(options.io) },
  });
}
