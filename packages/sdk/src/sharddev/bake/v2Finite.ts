/** WASM-HOST H1 build pass. This is not executable-module admission: H2 must
 * verify metering, entries, capabilities and the complete ABI before execution.
 * Kept separate from compileScript so v0/v1 bytes remain unchanged. */
import binaryen from 'binaryen';
import { SCRIPT_ABI } from '@wildshard/format/scriptAbi';

type Form = string | Form[];
type Float = 'f32' | 'f64';
interface Guard { type: Float; label: string | undefined; local: string; value: Form }
const features = binaryen.Features.MutableGlobals | binaryen.Features.SignExt | binaryen.Features.NontrappingFPToInt;
const maximum = { f32: '3.4028234663852886e+38', f64: '1.7976931348623157e+308' };
const floating = (value: Form | undefined): value is Float => value === 'f32' || value === 'f64';
function form(value: Form | undefined): value is Form[] { return Array.isArray(value); }
function text(value: Form): string { return form(value) ? `(${value.map(text).join(' ')})` : value; }
function parse(source: string): Form[] {
  const root: Form[] = [], stack = [root];
  for (const word of source.match(/"(?:\\.|[^"\\])*"|[()]|[^\s()]+/gu) ?? []) {
    const current = stack.at(-1); if (current === undefined) throw new Error('Malformed v2 WAT');
    if (word === '(') { const next: Form[] = []; current.push(next); stack.push(next); }
    else if (word === ')') { if (stack.length === 1) throw new Error('Unbalanced v2 WAT'); stack.pop(); }
    else current.push(word);
  }
  const module = root[0];
  if (stack.length !== 1 || root.length !== 1 || !form(module) || module[0] !== 'module') throw new Error('Malformed v2 module');
  return module;
}
function walk(node: Form, visit: (value: Form[]) => void): void {
  if (!form(node)) return;
  visit(node); for (const child of node) walk(child, visit);
}
function globals(module: Form[]): Map<string, Float> {
  const result = new Map<string, Float>();
  for (const node of module) if (form(node) && node[0] === 'global' && typeof node[1] === 'string') {
    const declaration = node[2], type = form(declaration) && declaration[0] === 'mut' ? declaration[1] : declaration;
    if (floating(type)) result.set(node[1], type);
  }
  return result;
}
function checkedModule(bytes: Uint8Array): binaryen.Module {
  if (bytes.byteLength > SCRIPT_ABI.maxBytes || !WebAssembly.validate(new Uint8Array(bytes))) throw new Error('Invalid v2 finite input');
  const module = binaryen.readBinary(bytes); module.setFeatures(features);
  if (!module.validate()) { module.dispose(); throw new Error('Unsupported v2 features (including SIMD)'); }
  return module;
}
function check(type: Float, local: string): Form[] {
  return ['if', ['i32.or', [`${type}.ne`, ['local.get', local], ['local.get', local]],
    [`${type}.gt`, [`${type}.abs`, ['local.get', local]], [`${type}.const`, maximum[type]]]], ['then', ['unreachable']]];
}
function same(a: Form | undefined, b: Form): boolean { return a !== undefined && text(a) === text(b); }
function guard(node: Form): Guard | undefined {
  if (!form(node) || node[0] !== 'block') return undefined;
  const label = typeof node[1] === 'string' ? node[1] : undefined, at = label === undefined ? 1 : 2;
  // Binaryen can flatten the checked expression's preceding statements into
  // this block. The final set/check/get must still be exact; branches to the
  // result label remain forbidden, including from that preceding sequence.
  if (node.length < at+4) return undefined;
  const result = node[at], set = node.at(-3), get = node.at(-1);
  if (!form(result) || result.length !== 2 || result[0] !== 'result' || !floating(result[1])
    || !form(set) || set.length !== 3 || set[0] !== 'local.set' || typeof set[1] !== 'string'
    || set[2] === undefined || !same(get, ['local.get', set[1]])) return undefined;
  // Binaryen canonicalizes decimal float constants on emission. Compare the
  // value at its declared width, while requiring every other guard instruction.
  const expected = check(result[1], set[1]), actual = node.at(-2);
  if (!form(actual)) return undefined;
  const copy = parse(`(module ${text(actual)})`)[1];
  if (!form(copy)) return undefined;
  const condition = copy[1], bound = form(condition) ? condition[2] : undefined;
  const constant = form(bound) ? bound[2] : undefined;
  if (!form(constant) || constant.length !== 2 || constant[0] !== `${result[1]}.const` || typeof constant[1] !== 'string') return undefined;
  const value = Number(constant[1]), target = Number(maximum[result[1]]);
  if ((result[1] === 'f32' ? Math.fround(value) !== Math.fround(target) : value !== target)) return undefined;
  constant[1] = maximum[result[1]];
  if (!same(copy, expected)) return undefined;
  return { type: result[1], label, local: set[1], value: set[2] };
}

/** Insert expression-local finite checks without a JS function import. Original
 * branches retain their named labels; new guard labels are collision-free. */
export function instrumentV2Finite(bytes: Uint8Array): Uint8Array {
  const input = checkedModule(bytes);
  try {
    const module = parse(input.emitText()), types = globals(module), names = new Set<string>();
    walk(module, node => { for (const value of node) if (typeof value === 'string') names.add(value); });
    let serial = 0;
    const fresh = (prefix: string): string => { let name: string; do { name = `$__v2_${prefix}_${serial++}`; } while (names.has(name)); names.add(name); return name; };
    for (const fn of module) {
      if (!form(fn) || fn[0] !== 'func') continue;
      const locals = new Map<Float, string>();
      const wrap = (type: Float, value: Form): Form[] => {
        let local = locals.get(type);
        if (local === undefined) { local = fresh(type); locals.set(type, local); }
        return ['block', fresh('finite'), ['result', type], ['local.set', local, value], check(type, local), ['local.get', local]];
      };
      const rewrite = (node: Form): Form => {
        if (!form(node)) return node;
        const result = node.map(rewrite), op = result[0], tail = result.at(-1);
        const type = op === 'f32.store' || op === 'i32.reinterpret_f32' ? 'f32'
          : op === 'f64.store' || op === 'i64.reinterpret_f64' ? 'f64'
          : op === 'global.set' && typeof result[1] === 'string' ? types.get(result[1]) : undefined;
        if (type !== undefined && tail !== undefined) result[result.length - 1] = wrap(type, tail);
        // A result block at the end of an if arm is flattened by Binaryen.
        // Keep reinterpret guards expression-local for both verifiers. Finite
        // multiplication by one preserves every bit, including signed zero.
        return op === 'f32.reinterpret_i32' ? ['f32.mul',wrap('f32', result),['f32.const','1']]
          : op === 'f64.reinterpret_i64' ? ['f64.mul',wrap('f64', result),['f64.const','1']] : result;
      };
      let body = 2;
      while (form(fn[body]) && ['param', 'result', 'local', 'type'].includes(String(fn[body]?.[0]))) body++;
      for (let i = body; i < fn.length; i++) { const node = fn[i]; if (node !== undefined) fn[i] = rewrite(node); }
      fn.splice(body, 0, ...[...locals].map(([type, name]): Form[] => ['local', name, type]));
    }
    const output = binaryen.parseText(text(module));
    try {
      output.setFeatures(features); if (!output.validate()) throw new Error('Invalid v2 finite rewrite');
      const resultBytes = output.emitBinary(); inspectV2Finite(resultBytes); return resultBytes;
    } finally { output.dispose(); }
  } finally { input.dispose(); }
}

/** Build-time guard verification only; deliberately not the ABI-v2 admit API.
 * In particular a guarded binary still needs H2's fuel/control-flow verifier. */
export function inspectV2Finite(bytes: Uint8Array): { stores: number; globals: number; reinterprets: number } {
  const input = checkedModule(bytes);
  try {
    const module = parse(input.emitText()), types = globals(module), guards = new Map<Form[], Guard>(), guardedResults = new Set<Form>();
    walk(module, node => {
      let found = guard(node);
      // Binaryen represents a function's outer block as its body sequence.
      if (found === undefined && node[0] === 'func') {
        const result = node.find(child => form(child) && child[0] === 'result');
        let body = 2;
        while (form(node[body]) && ['param', 'result', 'local', 'type'].includes(String(node[body]?.[0]))) body++;
        if (form(result) && floating(result[1]) && node.length-body >= 3) found = guard(['block', result, ...node.slice(body)]);
      }
      if (found !== undefined) { guards.set(node, found); guardedResults.add(found.value); }
    });
    const labels = new Set([...guards.values()].flatMap(value => value.label === undefined ? [] : [value.label]));
    const counts = { stores: 0, globals: 0, reinterprets: 0 };
    walk(module, node => {
      const op = node[0];
      // A forged branch to a guard's result label could bypass its check. The
      // compiler never targets these labels, including from nested expressions.
      if ((op === 'br' || op === 'br_if' || op === 'br_table') && node.slice(1).some(value => typeof value === 'string' && labels.has(value))) throw new Error('Branch bypasses v2 finite guard');
      const type = op === 'f32.store' || op === 'i32.reinterpret_f32' ? 'f32'
        : op === 'f64.store' || op === 'i64.reinterpret_f64' ? 'f64'
        : op === 'global.set' && typeof node[1] === 'string' ? types.get(node[1]) : undefined;
      if (type !== undefined) {
        const value = node.at(-1), found = form(value) ? guards.get(value) : undefined;
        if (found?.type !== type) throw new Error('Missing v2 finite input guard');
        if (op === 'global.set') counts.globals++;
        else if (op === 'f32.store' || op === 'f64.store') counts.stores++;
        else counts.reinterprets++;
      }
      if (op === 'f32.reinterpret_i32' || op === 'f64.reinterpret_i64') {
        if (!guardedResults.has(node)) throw new Error('Missing v2 finite reinterpret guard'); counts.reinterprets++;
      }
    });
    return counts;
  } finally { input.dispose(); }
}
