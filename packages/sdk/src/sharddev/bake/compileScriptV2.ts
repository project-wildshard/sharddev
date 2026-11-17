/** Explicit ABI v2 compiler; v0/v1 callers and their module hashes never enter
 * this path. No optimization runs after the verified finite/fuel passes. */
import binaryen from 'binaryen';
import { loadAssemblyScriptCompiler } from '../assemblyscriptCompiler.mjs';
import type { AssemblyScriptMemo } from './assemblyscriptMemoPort';
import { instrumentV2Finite } from './v2Finite';
import { instrumentV2Fuel } from './v2Fuel';
import type { V2Lane } from '@wildshard/format/scriptFuelV2';
import { readV2Module } from '@wildshard/format/scriptModuleV2';
import { admitScriptV2,SCRIPT_V2_REVISIONS } from '@wildshard/format/scriptAdmissionV2';

interface Compiler { main: (args: string[],options: { readFile: (name: string) => string | null; writeFile: (name: string,contents: string | Uint8Array) => void }) => Promise<{ error: Error | null; stderr?: { toString: () => string } }> }
function compiler(value: unknown): value is Compiler { return typeof value === 'object' && value !== null && 'main' in value && typeof value.main === 'function'; }
function localStartAndAbort(bytes: Uint8Array): Uint8Array {
  const image = binaryen.readBinary(bytes);
  try {
    image.setFeatures(binaryen.Features.MutableGlobals | binaryen.Features.SignExt | binaryen.Features.NontrappingFPToInt);
    const imports = Array.from({ length: image.getNumFunctions() },(_,i) => binaryen.getFunctionInfo(image.getFunctionByIndex(i))).filter(fn => fn.body === 0);
    for (const fn of imports) {
      if (fn.module === 'env' && fn.base === '__v2_fuel' && fn.results === binaryen.i32 && binaryen.expandType(fn.params).length === 0) {
        if (Array.from({ length: image.getNumExports() },(_,i) => binaryen.getExportInfo(image.getExportByIndex(i))).some(value => value.name === '__v2_fuel')) throw new Error('Reserved v2 fuel intrinsic export');
        // The opaque authoring marker survives AS optimization. The meter
        // replaces this local placeholder with a private-global read and
        // removes the marker export before executable admission.
        image.removeFunction(fn.name);image.addFunction(fn.name,fn.params,fn.results,[],image.i32.const(0));image.addFunctionExport(fn.name,'__v2_fuel');continue;
      }
      if (fn.module !== 'env' || fn.base !== 'abort' || fn.results !== binaryen.none || binaryen.expandType(fn.params).length !== 4 || binaryen.expandType(fn.params).some(type => type !== binaryen.i32)) throw new Error('ABI v2 forbids guest function imports');
      image.removeFunction(fn.name); image.addFunction(fn.name,fn.params,fn.results,[],image.unreachable());
    }
    const exports = Array.from({ length: image.getNumExports() },(_,i) => binaryen.getExportInfo(image.getExportByIndex(i)));
    const start = exports.find(value => value.name === '__v2_start'), init = exports.find(value => value.name === 'ws_init');
    if (start !== undefined) {
      if (init === undefined) throw new Error('Missing v2 init');
      const entry = image.getFunction(init.value), info = binaryen.getFunctionInfo(entry);
      const body = image.block(null,[image.call(start.value,[],binaryen.none),info.body],info.results);
      image.removeFunction(info.name); image.addFunction(info.name,info.params,info.results,info.vars,body); image.removeExport('__v2_start');
    }
    if (!image.validate()) throw new Error('Invalid v2 local initialization'); return image.emitBinary();
  } finally { image.dispose(); }
}
/** Source exports the H0b signatures, including the final i32 fuel parameter
 * and i32 result for each work entry. Generated wrappers return the real fuel
 * remainder rather than trusting the authored result. */
export async function compileScriptV2(source: string,options: { maximumPages?: number; ioBytes?: number; lane?: V2Lane; sources?: Readonly<Record<string,string>>; compilerRevision?: number; compileMemo?: AssemblyScriptMemo } = {}): Promise<Uint8Array> {
  if (options.compilerRevision !== undefined && options.compilerRevision !== SCRIPT_V2_REVISIONS.compiler) throw new Error('Unsupported v2 compiler revision');
  const pages = options.maximumPages ?? 1;
  if (!Number.isInteger(pages) || pages < 1 || pages > 4) throw new Error('V2 fixed memory must be 1..4 pages');
  const sources = new Map(Object.entries(options.sources ?? {}));
  if (sources.size > 64 || [...sources].some(([name,value]) => name === 'main.ts' || !/^(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.ts$/u.test(name) || typeof value !== 'string')) throw new Error('Invalid v2 virtual sources');
  const asc = await loadAssemblyScriptCompiler(); if (!compiler(asc)) throw new Error('Invalid pinned AssemblyScript compiler');
  const compile = async (memoryBase: number): Promise<Uint8Array> => {
    const args = ['main.ts','--outFile','v2.wasm','--runtime','stub','--importMemory','--noExportMemory','--initialMemory',String(pages),'--maximumMemory',String(pages),'--memoryBase',String(memoryBase),'--exportStart','__v2_start','--disable','bulk-memory','-O3'];
    const generate = async (): Promise<Uint8Array> => {
      let bytes: Uint8Array = new Uint8Array();
      const result = await asc.main(args,{
        readFile: name => name === 'main.ts' ? source : sources.get(name) ?? null,
        writeFile: (name,value) => { if (name === 'v2.wasm' && value instanceof Uint8Array) bytes = value; },
      });
      if (result.error || bytes.length === 0) throw new Error(`V2 AssemblyScript compile failed: ${result.error?.message ?? 'no output'}${result.stderr?.toString() ?? ''}`);
      return bytes;
    };
    const bytes = options.compileMemo === undefined ? await generate()
      : await options.compileMemo(args, new Map([['main.ts', source], ...sources]), generate);
    return localStartAndAbort(bytes);
  };
  // Discover the literal IO base without executing the getter. Compile again
  // with all static data and the AS stack/heap beyond the entire host IO range.
  const first = readV2Module(await compile(0)), entry = first.exports.get('ws_io'), code = first.bodies[entry?.index ?? -1]?.code;
  const io = code?.[0]?.literal, ioBytes = options.ioBytes ?? 656;
  if (entry?.kind !== 0 || code?.length !== 2 || code[0]?.op !== 0x41 || code[1]?.op !== 0x0b || typeof io !== 'number' || io < 0 || io%8 !== 0
    || !Number.isSafeInteger(ioBytes) || ioBytes < 656 || ioBytes > pages*65536-io) throw new Error('V2 IO does not fit fixed memory');
  const reserved = await compile(Math.ceil((io+ioBytes)/16)*16);
  const output = instrumentV2Fuel(instrumentV2Finite(reserved),options), admitted = admitScriptV2(output,{ ioBytes,...(options.lane === undefined ? {} : { lane: options.lane }) });
  if (admitted.io !== io) throw new Error('V2 IO getter depends on compiler allocation'); return output;
}
