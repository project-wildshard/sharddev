/** Separate ABI v2 build meter. No existing v0/v1 compilation calls this pass. */
import { readV2Module,type V2Body,type V2Signature } from '@wildshard/format/scriptModuleV2';
import { inspectV2Fuel,V2_ENTRY_SIGNATURES,V2_WORK_ENTRIES,v2Lane,v2BlockCosts,type V2Lane } from '@wildshard/format/scriptFuelV2';

function uint(input: number): number[] { let value = input; const result: number[] = []; do { const byte = value%128; value = Math.floor(value/128); result.push(byte | (value > 0 ? 128 : 0)); } while (value > 0); return result; }
function signed(input: number): number[] {
  let value = input; const result: number[] = []; let more = true;
  while (more) { let byte = value & 127; value >>= 7; more = !((value === 0 && (byte & 64) === 0) || (value === -1 && (byte & 64) !== 0)); if (more) byte |= 128; result.push(byte); } return result;
}
function vector(rows: readonly (readonly number[])[]): number[] { return [...uint(rows.length),...rows.flat()]; }
function section(id: number,bytes: readonly number[]): number[] { return [id,...uint(bytes.length),...bytes]; }
function named(name: string): number[] { const bytes = new TextEncoder().encode(name); return [...uint(bytes.length),...bytes]; }
function charge(fuel: number,cost: number): number[] { return [0x23,...uint(fuel),0x41,...signed(cost),0x6b,0x24,...uint(fuel),0x23,...uint(fuel),0x41,0,0x48,0x04,0x40,0x00,0x0b]; }
function metered(body: V2Body,fuel: number,getters: ReadonlySet<number>): number[] {
  const costs = v2BlockCosts(body.code,new Map([...getters].map(target => [target,2]))), result = [...body.bytes.subarray(0,body.prefix)];
  for (let i = 0; i < body.code.length; i++) {
    const value = body.code[i]; if (value === undefined) throw new Error('Missing v2 meter instruction');
    const cost = costs.get(i); if (cost !== undefined) result.push(...charge(fuel,cost));
    for (const byte of body.bytes.subarray(value.at,value.end)) result.push(byte);
  }
  return [...uint(result.length),...result];
}
function wrapper(type: V2Signature,target: number,fuel: number): number[] {
  const body = [0,0x20,...uint(type.params.length-1),0x24,...uint(fuel),0x23,...uint(fuel),0x41,0,0x48,0x04,0x40,0x00,0x0b,
    ...type.params.flatMap((_,index) => [0x20,...uint(index)]),0x10,...uint(target),0x1a,0x23,...uint(fuel),0x0b];
  return [...uint(body.length),...body];
}
/** Add a private fuel global and canonical host-only entry wrappers, pricing
 * coalesced acyclic regions by their scalar instruction counts (H0). The resulting
 * bytes still need complete finite/ABI admission before execution. */
export function instrumentV2Fuel(bytes: Uint8Array,options: { readonly lane?: V2Lane } = {}): Uint8Array {
  const image = readV2Module(bytes), lane = v2Lane(image,options.lane,true), fuel = image.globals.length, getters = new Set<number>(), entries = new Map<number,number>();
  for (const name of ['ws_abi','ws_io']) { const entry = image.exports.get(name); if (entry?.kind !== 0) throw new Error('Missing v2 getter'); getters.add(entry.index); }
  for (const name of ['ws_init',V2_WORK_ENTRIES[lane]]) {
    const params = V2_ENTRY_SIGNATURES[name]; if (params === undefined) throw new Error('Missing v2 entry contract');
    const exp = image.exports.get(name), type = image.types[image.functions[exp?.index ?? -1] ?? -1];
    if (exp?.kind !== 0 || type?.result !== 0x7f || type.params.length !== params.length || type.params.some((value,i) => value !== params[i]) || entries.has(exp.index)) throw new Error('Wrong v2 work entry');
    entries.set(exp.index,image.functions.length+entries.size);
  }
  const reader = image.exports.get('__v2_fuel');
  if (reader !== undefined) {
    const type = image.types[image.functions[reader.index] ?? -1];
    if (reader.kind !== 0 || type?.params.length !== 0 || type.result !== 0x7f || getters.has(reader.index) || entries.has(reader.index)) throw new Error('Invalid v2 fuel reader intrinsic');
  }
  // Refuse acyclic entry-to-entry calls too: a source entry implementation is
  // host-only even though the final exported wrapper has a different index.
  const sourceEntries = new Set(Object.keys(V2_ENTRY_SIGNATURES).flatMap(name => { const row = image.exports.get(name); return row?.kind === 0 ? [row.index] : []; }));
  for (const body of image.bodies) for (const value of body.code) if (value.op === 0x10 && sourceEntries.has(value.args[0] ?? -1)) throw new Error('Guest calls a v2 entry');
  const functions = [...image.functions,...[...entries.keys()].map(index => image.functions[index] ?? -1)];
  const globalSection = image.sections.find(value => value.id === 6);
  // The original vector's count can occupy multiple bytes. Locate its payload
  // by consuming exactly that unsigned LEB, preserving every initializer byte.
  let globalPrefix = 0; if (globalSection !== undefined) { do { const byte = globalSection.bytes[globalPrefix++]; if (byte === undefined) throw new Error('Missing v2 globals'); if (byte < 128) break; } while (globalPrefix < 5); }
  const globalBytes = [...uint(fuel+1),...(globalSection?.bytes.subarray(globalPrefix) ?? []),0x7f,1,0x41,0,0x0b];
  const exports = [...image.exports].filter(([name,value]) => name !== '__v2_fuel' && value.kind === 0 && (!Object.hasOwn(V2_ENTRY_SIGNATURES,name) || name === 'ws_init' || name === V2_WORK_ENTRIES[lane])).map(([name,value]) => named(name).concat([value.kind],uint(entries.get(value.index) ?? value.index)));
  for (let i = 0; i < image.globals.length; i++) if (image.globals[i]?.mutable) exports.push([...named(`__state_${i}`),3,...uint(i)]);
  const bodies = image.bodies.map((body,index) => {
    if (index === reader?.index) { const plain = [0,...charge(fuel,2),0x23,...uint(fuel),0x0b];return [...uint(plain.length),...plain]; }
    return getters.has(index) ? [...uint(body.bytes.length),...body.bytes] : metered(body,fuel,getters);
  });
  for (const target of entries.keys()) { const type = image.types[image.functions[target] ?? -1]; if (type === undefined) throw new Error('Missing v2 entry type'); bodies.push(wrapper(type,target,fuel)); }
  const replacements = new Map([[3,vector(functions.map(value => uint(value)))],[6,globalBytes],[7,vector(exports)],[10,vector(bodies)]]), output = [...bytes.subarray(0,8)];
  const emitted = new Set<number>();
  for (const input of image.sections) {
    if (input.id === 0) continue; // stale names no longer describe wrapper indices
    for (const [id,data] of replacements) if (id < input.id && !emitted.has(id)) { for (const value of section(id,data)) output.push(value); emitted.add(id); }
    for (const value of section(input.id,replacements.get(input.id) ?? [...input.bytes])) output.push(value); emitted.add(input.id);
  }
  for (const [id,data] of replacements) if (!emitted.has(id)) for (const value of section(id,data)) output.push(value);
  const result = new Uint8Array(output); inspectV2Fuel(result,{ lane }); return result;
}
